# Local usage-log and token-request-audit smoke flow

This document captures a repeatable local verification flow for `new-api`.
It uses:

- a temporary SQLite database;
- a local `new-api` process on `127.0.0.1:3300`;
- the helper at `bin/local_log_smoke.py`, which starts a tiny OpenAI-compatible mock upstream by default.

## 1. Start `new-api`

Run from the repository root:

```zsh
mkdir -p .tmp
SESSION_SECRET='smoke-session-secret'
CRYPTO_SECRET='smoke-crypto-secret'
SQLITE_PATH='.tmp/smoke.db?_busy_timeout=30000'
GLOBAL_API_RATE_LIMIT_ENABLE=false
GLOBAL_WEB_RATE_LIMIT_ENABLE=false
CRITICAL_RATE_LIMIT_ENABLE=false
UPDATE_TASK=false
NODE_TYPE=slave
PORT=3300
export SESSION_SECRET CRYPTO_SECRET SQLITE_PATH GLOBAL_API_RATE_LIMIT_ENABLE GLOBAL_WEB_RATE_LIMIT_ENABLE CRITICAL_RATE_LIMIT_ENABLE UPDATE_TASK NODE_TYPE PORT

go run . --port 3300
```

## 2. Run the smoke helper

In a second terminal from the repository root:

```zsh
python3 bin/local_log_smoke.py --base-url http://127.0.0.1:3300
```

The script will:

1. initialize the instance if setup has not been completed yet;
2. log in as the root user;
3. create a fresh test token and OpenAI channel;
4. send one `/dashboard/billing/usage` request to create an audit-only record;
5. send one `/v1/chat/completions` request to create both a consume log and an audit record;
6. poll the admin and token log APIs until the records are visible;
7. print a JSON summary with the created token/channel ids and the captured request ids.

## Notes

- By default the helper starts a mock upstream on `http://127.0.0.1:18080`.
- If you already have a reachable upstream, pass `--channel-base-url <url> --no-start-mock`.
- The helper intentionally keeps the created token and channel so you can inspect the generated data afterwards in the dashboard or via the APIs.

