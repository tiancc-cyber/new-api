#!/usr/bin/env python3
"""Bootstrap a local smoke flow that creates token/channel data and verifies usage logs plus token request audit records.

This script assumes `new-api` is already running and reachable via `--base-url`.
By default it starts a tiny OpenAI-compatible mock upstream on localhost, then:
  1. initializes the instance if needed;
  2. logs in as the root user;
  3. creates a fresh token and channel;
  4. sends one dashboard billing request and one chat completion relay request;
  5. polls the log and audit APIs until both records are visible.
"""

from __future__ import annotations

import argparse
import contextlib
import http.cookiejar
import http.server
import json
import socketserver
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

REQUEST_ID_HEADER = "X-Oneapi-Request-Id"
DEFAULT_TIMEOUT_SECONDS = 25


class SmokeError(RuntimeError):
    pass


class _ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class MockOpenAIHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
        return

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            return json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError as exc:  # pragma: no cover - defensive only
            raise SmokeError(f"mock upstream received invalid json: {exc}") from exc

    def _write_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/v1/chat/completions":
            self._write_json({"error": {"message": f"unsupported path: {self.path}"}}, status=404)
            return

        payload = self._read_json()
        model_name = str(payload.get("model") or "gpt-4o-mini")
        messages = payload.get("messages") or []
        last_user_message = ""
        if isinstance(messages, list) and messages:
            last = messages[-1]
            if isinstance(last, dict):
                last_user_message = str(last.get("content") or "")

        response = {
            "id": f"chatcmpl-mock-{int(time.time() * 1000)}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model_name,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": f"mock reply for: {last_user_message or 'smoke test'}",
                    },
                    "finish_reason": "stop",
                }
            ],
            "usage": {
                "prompt_tokens": 7,
                "completion_tokens": 5,
                "total_tokens": 12,
            },
        }
        self._write_json(response)


@dataclass
class HttpResult:
    status: int
    headers: dict[str, str]
    body: Any
    raw_text: str


class ApiClient:
    def __init__(self, base_url: str, timeout_seconds: int) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookie_jar))

    def request(
        self,
        method: str,
        path: str,
        *,
        headers: dict[str, str] | None = None,
        query: dict[str, Any] | None = None,
        json_body: Any | None = None,
        expected_statuses: tuple[int, ...] = (200,),
    ) -> HttpResult:
        url = self._build_url(path, query)
        payload = None
        request_headers = {
            "Accept": "application/json",
            "User-Agent": "new-api-local-smoke/1.0",
        }
        if headers:
            request_headers.update(headers)
        if json_body is not None:
            payload = json.dumps(json_body, ensure_ascii=False).encode("utf-8")
            request_headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=payload, headers=request_headers, method=method.upper())
        try:
            with self.opener.open(req, timeout=self.timeout_seconds) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                result = HttpResult(
                    status=resp.getcode(),
                    headers=dict(resp.headers.items()),
                    body=self._parse_json(raw),
                    raw_text=raw,
                )
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            result = HttpResult(
                status=exc.code,
                headers=dict(exc.headers.items()),
                body=self._parse_json(raw),
                raw_text=raw,
            )
        except urllib.error.URLError as exc:
            raise SmokeError(f"request {method} {url} failed: {exc}") from exc

        if result.status not in expected_statuses:
            raise SmokeError(
                f"unexpected HTTP status for {method} {url}: {result.status}\nbody: {result.raw_text}"
            )
        return result

    def _build_url(self, path: str, query: dict[str, Any] | None) -> str:
        url = urllib.parse.urljoin(self.base_url + "/", path.lstrip("/"))
        if query:
            query_pairs = []
            for key, value in query.items():
                if value is None:
                    continue
                query_pairs.append((key, str(value)))
            if query_pairs:
                url = f"{url}?{urllib.parse.urlencode(query_pairs)}"
        return url

    @staticmethod
    def _parse_json(raw_text: str) -> Any:
        if not raw_text:
            return None
        try:
            return json.loads(raw_text)
        except json.JSONDecodeError:
            return None


def require_success(result: HttpResult, action: str) -> Any:
    if not isinstance(result.body, dict):
        raise SmokeError(f"{action} returned non-JSON body: {result.raw_text}")
    if result.body.get("success") is False:
        raise SmokeError(f"{action} failed: {result.body.get('message') or result.raw_text}")
    return result.body.get("data")


@contextlib.contextmanager
def maybe_mock_server(start_mock: bool, host: str, port: int):
    if not start_mock:
        yield None
        return

    server = _ThreadingHTTPServer((host, port), MockOpenAIHandler)
    thread = threading.Thread(target=server.serve_forever, name="mock-openai-server", daemon=True)
    thread.start()
    try:
        yield f"http://{host}:{port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def wait_for_server(client: ApiClient, timeout_seconds: int) -> HttpResult:
    deadline = time.time() + timeout_seconds
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            return client.request("GET", "/api/setup", expected_statuses=(200,))
        except Exception as exc:  # noqa: BLE001 - we want retry visibility
            last_error = exc
            time.sleep(0.5)
    raise SmokeError(f"new-api did not become ready in time: {last_error}")


def create_root_if_needed(client: ApiClient, username: str, password: str) -> None:
    setup = wait_for_server(client, 30)
    data = require_success(setup, "query setup status")
    if not isinstance(data, dict):
        raise SmokeError("setup status response is missing data")
    if data.get("status"):
        return

    payload = {
        "username": username,
        "password": password,
        "confirmPassword": password,
        "SelfUseModeEnabled": False,
        "DemoSiteEnabled": False,
    }
    require_success(client.request("POST", "/api/setup", json_body=payload), "initialize instance")


def login(client: ApiClient, username: str, password: str) -> tuple[int, dict[str, str]]:
    result = client.request(
        "POST",
        "/api/user/login",
        json_body={"username": username, "password": password},
    )
    data = require_success(result, "login")
    if not isinstance(data, dict) or not data.get("id"):
        raise SmokeError("login response did not include user id")
    user_id = int(data["id"])
    return user_id, {"New-Api-User": str(user_id)}


def create_token(client: ApiClient, auth_headers: dict[str, str], token_name: str, group: str) -> tuple[int, str]:
    payload = {
        "name": token_name,
        "expired_time": -1,
        "remain_quota": 0,
        "unlimited_quota": True,
        "group": group,
        "model_limits_enabled": False,
        "cross_group_retry": False,
    }
    require_success(client.request("POST", "/api/token/", headers=auth_headers, json_body=payload), "create token")

    tokens_result = client.request(
        "GET",
        "/api/token/",
        headers=auth_headers,
        query={"p": 1, "size": 100},
    )
    tokens_page = require_success(tokens_result, "list tokens")
    items = list((tokens_page or {}).get("items") or [])
    matches = [item for item in items if isinstance(item, dict) and item.get("name") == token_name]
    if not matches:
        raise SmokeError(f"created token {token_name!r} not found in token list")
    token = max(matches, key=lambda item: int(item.get("id") or 0))
    token_id = int(token["id"])

    key_result = client.request("POST", f"/api/token/{token_id}/key", headers=auth_headers)
    key_data = require_success(key_result, "fetch token key")
    if not isinstance(key_data, dict) or not key_data.get("key"):
        raise SmokeError("token key response is missing key data")
    return token_id, str(key_data["key"])


def create_channel(
    client: ApiClient,
    auth_headers: dict[str, str],
    channel_name: str,
    model_name: str,
    channel_group: str,
    channel_base_url: str,
) -> int:
    payload = {
        "mode": "single",
        "channel": {
            "name": channel_name,
            "type": 1,
            "key": "mock-upstream-key",
            "base_url": channel_base_url,
            "models": model_name,
            "group": channel_group,
            "status": 1,
            "test_model": model_name,
            "priority": 100,
            "auto_ban": 0,
        },
    }
    require_success(client.request("POST", "/api/channel/", headers=auth_headers, json_body=payload), "create channel")

    channels_result = client.request(
        "GET",
        "/api/channel/",
        headers=auth_headers,
        query={"p": 1, "page_size": 100, "id_sort": "true"},
    )
    channels_page = require_success(channels_result, "list channels")
    items = list((channels_page or {}).get("items") or [])
    matches = [item for item in items if isinstance(item, dict) and item.get("name") == channel_name]
    if not matches:
        raise SmokeError(f"created channel {channel_name!r} not found in channel list")
    channel = max(matches, key=lambda item: int(item.get("id") or 0))
    return int(channel["id"])


def wait_for_record(description: str, timeout_seconds: int, fn):  # type: ignore[no-untyped-def]
    deadline = time.time() + timeout_seconds
    last_value = None
    while time.time() < deadline:
        last_value = fn()
        if last_value:
            return last_value
        time.sleep(0.5)
    raise SmokeError(f"timed out while waiting for {description}")


def find_log_by_request_id(client: ApiClient, token_key: str, request_id: str) -> dict[str, Any] | None:
    result = client.request(
        "GET",
        "/api/log/token",
        headers={"Authorization": f"Bearer {token_key}"},
    )
    data = require_success(result, "query token logs")
    for item in data or []:
        if isinstance(item, dict) and item.get("request_id") == request_id:
            return item
    return None


def find_audit_record(
    client: ApiClient,
    auth_headers: dict[str, str],
    request_id: str,
) -> dict[str, Any] | None:
    result = client.request(
        "GET",
        "/api/log/token-request-records",
        headers=auth_headers,
        query={"p": 1, "page_size": 20, "request_id": request_id},
    )
    page = require_success(result, "query token request audit list")
    items = list((page or {}).get("items") or [])
    for item in items:
        if isinstance(item, dict) and item.get("request_id") == request_id:
            return item
    return None


def get_audit_detail(client: ApiClient, auth_headers: dict[str, str], record_id: int) -> dict[str, Any]:
    result = client.request("GET", f"/api/log/token-request-records/{record_id}", headers=auth_headers)
    data = require_success(result, "query token request audit detail")
    if not isinstance(data, dict):
        raise SmokeError("audit detail response is missing detail payload")
    return data


def run(args: argparse.Namespace) -> dict[str, Any]:
    token_name = f"smoke-token-{int(time.time())}"
    channel_name = f"smoke-channel-{int(time.time())}"

    with maybe_mock_server(not args.no_start_mock, args.mock_host, args.mock_port) as default_mock_url:
        channel_base_url = args.channel_base_url or default_mock_url
        if not channel_base_url:
            raise SmokeError("no channel base URL available; supply --channel-base-url or allow the local mock server")

        client = ApiClient(args.base_url, args.timeout)
        create_root_if_needed(client, args.username, args.password)
        user_id, auth_headers = login(client, args.username, args.password)
        token_id, token_key = create_token(client, auth_headers, token_name, args.channel_group)
        channel_id = create_channel(
            client,
            auth_headers,
            channel_name,
            args.model,
            args.channel_group,
            channel_base_url,
        )

        billing_result = client.request(
            "GET",
            "/dashboard/billing/usage",
            headers={"Authorization": f"Bearer {token_key}"},
            query={"start_date": "2026-01-01", "end_date": "2026-01-02"},
        )
        billing_request_id = billing_result.headers.get(REQUEST_ID_HEADER, "")
        if not billing_request_id:
            raise SmokeError("dashboard billing request did not return a request id header")

        chat_result = client.request(
            "POST",
            "/v1/chat/completions",
            headers={"Authorization": f"Bearer {token_key}-{channel_id}"},
            json_body={
                "model": args.model,
                "stream": False,
                "messages": [{"role": "user", "content": "Please return a tiny smoke-test response."}],
            },
        )
        chat_request_id = chat_result.headers.get(REQUEST_ID_HEADER, "")
        if not chat_request_id:
            raise SmokeError("chat completion request did not return a request id header")

        chat_log = wait_for_record(
            "consume log entry",
            args.timeout,
            lambda: find_log_by_request_id(client, token_key, chat_request_id),
        )
        billing_audit = wait_for_record(
            "dashboard billing audit record",
            args.timeout,
            lambda: find_audit_record(client, auth_headers, billing_request_id),
        )
        chat_audit = wait_for_record(
            "chat completion audit record",
            args.timeout,
            lambda: find_audit_record(client, auth_headers, chat_request_id),
        )

        chat_audit_detail = get_audit_detail(client, auth_headers, int(chat_audit["id"]))

        return {
            "base_url": args.base_url,
            "mock_base_url": channel_base_url,
            "user_id": user_id,
            "token": {"id": token_id, "name": token_name, "key": token_key},
            "channel": {"id": channel_id, "name": channel_name},
            "requests": {
                "billing_usage": {
                    "request_id": billing_request_id,
                    "status": billing_result.status,
                    "audit_record_id": int(billing_audit["id"]),
                    "request_path": billing_audit.get("request_path"),
                },
                "chat_completion": {
                    "request_id": chat_request_id,
                    "status": chat_result.status,
                    "log_id": int(chat_log["id"]),
                    "audit_record_id": int(chat_audit["id"]),
                    "model_name": chat_log.get("model_name"),
                    "prompt_tokens": chat_log.get("prompt_tokens"),
                    "completion_tokens": chat_log.get("completion_tokens"),
                },
            },
            "chat_audit_detail": {
                "record": chat_audit_detail.get("record"),
                "request_chunk_count": len(chat_audit_detail.get("request_chunks") or []),
                "response_chunk_count": len(chat_audit_detail.get("response_chunks") or []),
            },
        }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Create a local usage-log and token-request-audit smoke flow.")
    parser.add_argument("--base-url", default="http://127.0.0.1:3300", help="running new-api base URL")
    parser.add_argument("--username", default="smokeadmin", help="root username to create/login")
    parser.add_argument("--password", default="ChangeMe123!", help="root password to create/login")
    parser.add_argument("--model", default="gpt-4o-mini", help="model name to expose on the mock channel")
    parser.add_argument("--channel-group", default="default", help="group used by both the token and channel")
    parser.add_argument("--channel-base-url", default="", help="upstream base URL reachable by new-api")
    parser.add_argument("--mock-host", default="127.0.0.1", help="host for the built-in mock upstream")
    parser.add_argument("--mock-port", type=int, default=18080, help="port for the built-in mock upstream")
    parser.add_argument("--no-start-mock", action="store_true", help="do not start the built-in mock upstream")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS, help="poll timeout in seconds")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        result = run(args)
    except SmokeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

