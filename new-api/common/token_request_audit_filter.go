package common

import (
	"strconv"
	"strings"
	"sync/atomic"
)

// TokenRequestAuditStatusCodeWhitelistKey controls which HTTP status codes
// are allowed to be persisted into token request audit tables.
//
// Value format: comma-separated integers, e.g. "200,400,401,429,500".
//
// Semantics (MVP):
// - empty/whitespace => no filtering (store all status codes), keeping backward compatibility.
// - invalid tokens / out-of-range values are ignored.
const TokenRequestAuditStatusCodeWhitelistKey = "TokenRequestAuditStatusCodeWhitelist"

type tokenRequestAuditStatusCodeWhitelistCache struct {
	raw string
	set map[int]struct{}
}

var tokenRequestAuditStatusWhitelist atomic.Pointer[tokenRequestAuditStatusCodeWhitelistCache]

func init() {
	// Default: no filtering.
	tokenRequestAuditStatusWhitelist.Store(&tokenRequestAuditStatusCodeWhitelistCache{raw: "", set: nil})
}

// UpdateTokenRequestAuditStatusCodeWhitelist parses and caches the whitelist string.
// It is safe to call frequently.
func UpdateTokenRequestAuditStatusCodeWhitelist(raw string) {
	normalized := strings.TrimSpace(raw)
	set := parseStatusCodeWhitelist(normalized)
	tokenRequestAuditStatusWhitelist.Store(&tokenRequestAuditStatusCodeWhitelistCache{raw: normalized, set: set})
}

// ShouldStoreTokenRequestAuditStatusCode decides whether a record with the given status
// code should be persisted.
//
// If whitelist is empty => true (do not filter).
func ShouldStoreTokenRequestAuditStatusCode(statusCode int) bool {
	cache := tokenRequestAuditStatusWhitelist.Load()
	if cache == nil || len(cache.set) == 0 {
		return true
	}
	_, ok := cache.set[statusCode]
	return ok
}

func parseStatusCodeWhitelist(raw string) map[int]struct{} {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	// small set, keep it simple
	set := make(map[int]struct{}, len(parts))
	for _, p := range parts {
		t := strings.TrimSpace(p)
		if t == "" {
			continue
		}
		v, err := strconv.Atoi(t)
		if err != nil {
			continue
		}
		if v < 100 || v > 599 {
			continue
		}
		set[v] = struct{}{}
	}
	if len(set) == 0 {
		// treat as empty => no filtering
		return nil
	}
	return set
}
