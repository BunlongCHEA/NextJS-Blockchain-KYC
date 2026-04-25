/**
 * app/api/integration/lib/db.ts
 * ─────────────────────────────
 * Integration key store — delegates ALL storage to the Go backend.
 *
 * CHANGE: No more direct Postgres connection from NextJS.
 * All reads/writes go through Go /api/v1/integration/keys.
 * DATABASE_URL is no longer needed and has been removed from the k8s secrets/deployment.
 *
 * The Go backend owns the `integration_api_keys` table.
 * This file is a thin HTTP client that keeps the same function signatures
 * so gateway.ts and the admin UI don't need to change.
 */

// ─── Types (mirror Go models.IntegrationKey JSON tags) ─────────────

export type Scope =
  | "kyc:read"    | "kyc:write"   | "kyc:verify"
  | "users:read"  | "users:write"
  | "blockchain:read" | "blockchain:mine"
  | "banks:read"  | "banks:write"
  | "certificates:issue" | "certificates:verify"
  | "audit:read";

export interface IntegrationKey {
  id:                  string;
  name:                string;
  description:         string;
  organization:        string;
  key_prefix:          string;
  key_hash:            string;
  is_active:           boolean;
  is_deleted:          boolean;
  scopes:              Scope[];
  created_at:          number;   // Unix ms
  expires_at:          number;   // Unix ms  (0 = never)
  last_used_at:        number;   // Unix ms
  request_count:       number;
  request_count_today: number;
  scope_counts:        Partial<Record<Scope, number>>;
  scope_counts_today:  Partial<Record<Scope, number>>;
  _today_date?:        string;
}

// ─── Go backend URL ───────────────────────────────────────────────────────────
// Uses the internal cluster URL (API_URL) so SSR never leaves the cluster.

function goBase(): string {
  const url = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";
  if (!url) throw new Error("API_URL is not set");
  return url;
}

// ─── Service token (reuse the same cache from gateway.ts) ────────────────────
// We import getServiceToken lazily to avoid a circular dependency.
// gateway.ts already exports it — re-export here for db callers.

let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

async function getServiceToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiresAt - 60_000) {
    return _cachedToken;
  }

  const staticToken = process.env.INTEGRATION_SERVICE_TOKEN;
  if (staticToken && !staticToken.startsWith("eyJ")) {
    _cachedToken    = staticToken;
    _tokenExpiresAt = Date.now() + 24 * 3_600_000;
    return staticToken;
  }

  const username = process.env.INTEGRATION_SERVICE_USER;
  const password = process.env.INTEGRATION_SERVICE_PASS;
  if (!username || !password) {
    if (staticToken) {
      _cachedToken    = staticToken;
      _tokenExpiresAt = Date.now() + 3_600_000;
      return staticToken;
    }
    throw new Error("INTEGRATION_SERVICE_USER/PASS or INTEGRATION_SERVICE_TOKEN required");
  }

  const res = await fetch(`${goBase()}/api/v1/auth/login`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ username, password }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Service login failed ${res.status}: ${raw}`);

  const data       = JSON.parse(raw);
  const token      = data?.data?.access_token;
  if (!token) throw new Error("No access_token in login response");

  _cachedToken    = token;
  _tokenExpiresAt = Date.now() + ((data?.data?.expires_in ?? 86_400) * 1_000);
  return token;
}

// ─── Shared fetch helper ──────────────────────────────────────────────────────

async function goFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getServiceToken();
  return fetch(`${goBase()}${path}`, {
    ...options,
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
}

// ─── runMigration ─────────────────────────────────────────────────────────────
// No-op — Go runs migrations on startup via storage.Migrate().
// Kept so callers that do `await runMigration()` don't break.

export async function runMigration(): Promise<void> {
  // Go owns migrations — nothing to do here
}

// ─── readServerKeys ───────────────────────────────────────────────────────────
// Returns all non-deleted keys. Used by the admin UI.

export async function readServerKeys(): Promise<IntegrationKey[]> {
  const res = await goFetch("/api/v1/integration/keys");
  if (!res.ok) {
    console.error("[db] readServerKeys failed:", res.status, await res.text());
    return [];
  }
  const body = await res.json();
  // Go wraps in { success, data: { keys: [...], count: N } }
  return (body?.data?.keys ?? []) as IntegrationKey[];
}

// ─── findKeyByHash ────────────────────────────────────────────────────────────
// Hot path — called on every gateway request.
// Go returns null data when not found → returns null here.

export async function findKeyByHash(hash: string): Promise<IntegrationKey | null> {
  const res = await goFetch(`/api/v1/integration/keys?hash=${encodeURIComponent(hash)}`);
  if (!res.ok) return null;
  const body = await res.json();
  return (body?.data ?? null) as IntegrationKey | null;
}

// ─── upsertKey ────────────────────────────────────────────────────────────────
// Create or update a single key. Used by the admin UI key management page.

export async function upsertKey(key: IntegrationKey): Promise<void> {
  const res = await goFetch("/api/v1/integration/keys", {
    method: "POST",
    body:   JSON.stringify(key),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`upsertKey failed ${res.status}: ${text}`);
  }
}

// ─── syncKeys ─────────────────────────────────────────────────────────────────
// Bulk upsert. Called by POST /api/integration/sync (admin sync endpoint).

export async function syncKeys(keys: IntegrationKey[]): Promise<void> {
  const res = await goFetch("/api/v1/integration/keys/sync", {
    method: "POST",
    body:   JSON.stringify({ keys }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`syncKeys failed ${res.status}: ${text}`);
  }
}

// ─── incrementStats ───────────────────────────────────────────────────────────
// Non-blocking fire-and-forget — called after each successful gateway proxy.
// Errors are swallowed so a stats failure never breaks a gateway response.

export async function incrementStats(keyId: string, scope: Scope): Promise<void> {
  goFetch("/api/v1/integration/keys/stats", {
    method: "POST",
    body:   JSON.stringify({ key_id: keyId, scope }),
  }).catch((err) => {
    console.error("[db] incrementStats failed:", err.message);
  });
  // Intentionally not awaited — fire and forget
}

// ─── softDeleteKey ────────────────────────────────────────────────────────────
// Soft-deletes a key. Called by the admin UI delete action.

export async function softDeleteKey(keyId: string): Promise<void> {
  const res = await goFetch(`/api/v1/integration/keys?id=${encodeURIComponent(keyId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`softDeleteKey failed ${res.status}: ${text}`);
  }
}