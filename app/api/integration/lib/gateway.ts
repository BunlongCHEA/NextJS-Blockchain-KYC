/**
 * app/api/integration/lib/gateway.ts
 * ────────────────────────────────────
 * Integration Gateway — shared middleware for /api/integration/<feature>
 *
 * CHANGE from previous version:
 *   - findKeyByHash() and incrementStats() now call the Go backend via db.ts
 *     instead of querying Postgres directly.
 *   - No other logic changed — auth flow, proxy, scope checks are identical.
 *
 * Flow:
 *  1. Extract  Authorization: Bearer <raw_key>
 *  2. SHA-256 hash → findKeyByHash() → Go GET /api/v1/integration/keys?hash=:hash
 *  3. Validate: is_active, !is_deleted, scope allowed, not expired
 *  4. incrementStats() → Go POST /api/v1/integration/keys/stats  (non-blocking)
 *  5. Proxy to Go using service account JWT (auto-refreshed)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  findKeyByHash,
  incrementStats,
  type Scope,
} from "./db";   // ← only change: db.ts now calls Go instead of Postgres directly

// ─── SHA-256 (server-side Web Crypto) ────────────────────────────────────────

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Service token — cached in memory, auto-refreshed on expiry ──────────────

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
  const goBase   = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";

  console.log("[gateway] getServiceToken()");
  console.log("[gateway]   goBase    =", goBase);
  console.log("[gateway]   SVC_USER  =", username ?? "(not set)");
  console.log("[gateway]   SVC_PASS  =", password ? "set" : "(not set)");

  if (!username || !password) {
    if (staticToken) {
      _cachedToken    = staticToken;
      _tokenExpiresAt = Date.now() + 3_600_000;
      return staticToken;
    }
    throw new Error(
      "INTEGRATION_SERVICE_TOKEN or INTEGRATION_SERVICE_USER/PASS required"
    );
  }

  if (!goBase) throw new Error("Missing API_URL or NEXT_PUBLIC_API_URL in .env.local");

  const loginURL = `${goBase}/api/v1/auth/login`;
  const res = await fetch(loginURL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ username, password }),
  });

  const raw = await res.text();
  console.log("[gateway]   login status =", res.status);
  if (!res.ok) throw new Error(`Service account login failed: ${res.status} — ${raw}`);

  const data       = JSON.parse(raw);
  const token      = data?.data?.access_token;
  if (!token) throw new Error("No access_token in login response");

  _cachedToken    = token;
  const expiresIn = (data?.data?.expires_in ?? 86_400) * 1000;
  _tokenExpiresAt = Date.now() + expiresIn;

  console.log("[gateway]   token cached, expires in", expiresIn / 1000, "s");
  return token;
}

// ─── Feature → Go API mapping ─────────────────────────────────────────────────
// Unchanged from previous version.

export type Feature =
  | "kyc" | "users" | "blockchain" | "banks" | "certificates" | "audit";

interface RouteMap {
  [action: string]: { method: string; path: string };
}

const FEATURE_MAP: Record<Feature, RouteMap> = {
  kyc: {
    list:    { method: "GET",  path: "/api/v1/kyc/list"    },
    get:     { method: "GET",  path: "/api/v1/kyc"         },
    create:  { method: "POST", path: "/api/v1/kyc"         },
    update:  { method: "PUT",  path: "/api/v1/kyc"         },
    verify:  { method: "POST", path: "/api/v1/kyc/verify"  },
    reject:  { method: "POST", path: "/api/v1/kyc/reject"  },
    stats:   { method: "GET",  path: "/api/v1/kyc/stats"   },
    history: { method: "GET",  path: "/api/v1/kyc/history" },
    external_verify: { method: "POST", path: "/api/v1/kyc/external-verify" },
    suspend: { method: "POST", path: "/api/v1/kyc/suspend" },
    expire:  { method: "POST", path: "/api/v1/kyc/expire"  },
  },
  users: {
    list:           { method: "GET",    path: "/api/v1/users/list"           },
    create:         { method: "POST",   path: "/api/v1/users"                },
    update:         { method: "PATCH",  path: "/api/v1/users"                },
    delete:         { method: "DELETE", path: "/api/v1/users"                },
    reset_password: { method: "POST",   path: "/api/v1/users/reset-password" },
  },
  blockchain: {
    stats:    { method: "GET",  path: "/api/v1/blockchain/stats"    },
    blocks:   { method: "GET",  path: "/api/v1/blockchain/blocks"   },
    block:    { method: "GET",  path: "/api/v1/blockchain/block"    },
    pending:  { method: "GET",  path: "/api/v1/blockchain/pending"  },
    validate: { method: "GET",  path: "/api/v1/blockchain/validate" },
    mine:     { method: "POST", path: "/api/v1/blockchain/mine"     },
  },
  banks: {
    list:   { method: "GET",  path: "/api/v1/banks/list" },
    get:    { method: "GET",  path: "/api/v1/banks"      },
    create: { method: "POST", path: "/api/v1/banks"      },
  },
  certificates: {
    list:   { method: "GET",  path: "/api/v1/certificates/list"  },
    issue:  { method: "POST", path: "/api/v1/certificate/issue"  },
    verify: { method: "POST", path: "/api/v1/certificate/verify" },
  },
  audit: {
    logs:   { method: "GET", path: "/api/v1/audit/logs"      },
    alerts: { method: "GET", path: "/api/v1/security/alerts" },
  },
};

// ─── Scope per feature + action (unchanged) ───────────────────────────────────

// function requiredScope(feature: Feature, action: string): Scope | null {
//   const write  = ["create", "update", "delete", "reset_password"];
//   const verify = ["verify", "reject", "auto_verify", "external_verify", "suspend", "expire"];  // kyc-only actionable statuses
//   if (feature === "kyc") {
//     if (verify.includes(action)) return "kyc:verify";
//     if (write.includes(action))  return "kyc:write";
//     // if (action === "external_verify") return "kyc:verify";
//     // if (action === "suspend" || action === "expire") return "kyc:verify";
//     return "kyc:read";
//   }
//   if (feature === "users")        return write.includes(action) ? "users:write" : "users:read";
//   if (feature === "blockchain")   return action === "mine" ? "blockchain:mine" : "blockchain:read";
//   if (feature === "banks")        return write.includes(action) ? "banks:write" : "banks:read";
//   if (feature === "certificates") return action === "issue" ? "certificates:issue" : "certificates:verify";
//   if (feature === "audit")        return "audit:read";
//   return null;
// }

function requiredScope(feature: Feature, action: string): Scope | null {

  // ── kyc ──────────────────────────────────────────────────────────────────
  if (feature === "kyc") {
    switch (action) {
      // read-only
      case "list":
      case "get":
      case "stats":
      case "history":
        return "kyc:read";
      // write (create / update)
      case "create":
      case "update":
        return "kyc:write";
      // verify-class actions (status changes + external check)
      case "verify":
      case "reject":
      case "auto_verify":
      case "external_verify":
      case "suspend":
      case "expire":
        return "kyc:verify";
      default:
        return "kyc:read";
    }
  }

  // ── users ─────────────────────────────────────────────────────────────────
  if (feature === "users") {
    switch (action) {
      case "list":
        return "users:read";
      case "create":
      case "update":
      case "delete":
      case "reset_password":
        return "users:write";
      default:
        return "users:read";
    }
  }

  // ── blockchain ────────────────────────────────────────────────────────────
  if (feature === "blockchain") {
    switch (action) {
      case "stats":
      case "blocks":
      case "block":
      case "pending":
      case "validate":
        return "blockchain:read";
      case "mine":
        return "blockchain:mine";
      default:
        return "blockchain:read";
    }
  }

  // ── banks ─────────────────────────────────────────────────────────────────
  if (feature === "banks") {
    switch (action) {
      case "list":
      case "get":
        return "banks:read";
      case "create":
        return "banks:write";
      default:
        return "banks:read";
    }
  }

  // ── certificates ──────────────────────────────────────────────────────────
  if (feature === "certificates") {
    switch (action) {
      case "list":
        return "certificates:verify";   // listing certs requires verify scope
      case "issue":
        return "certificates:issue";
      case "verify":
        return "certificates:verify";
      default:
        return "certificates:verify";
    }
  }

  // ── audit ─────────────────────────────────────────────────────────────────
  if (feature === "audit") {
    switch (action) {
      case "logs":
      case "alerts":
        return "audit:read";
      default:
        return "audit:read";
    }
  }

  return null;
}

// ─── Main gateway handler (unchanged except incrementStats call) ──────────────

export async function gatewayHandler(
  req: NextRequest,
  feature: Feature,
): Promise<NextResponse> {
  // 1. Extract raw key
  const authHeader = req.headers.get("authorization") ?? "";
  const rawKey = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!rawKey) {
    return NextResponse.json(
      { success: false, error: "Missing Authorization header" },
      { status: 401 },
    );
  }

  // 2. Hash → Go backend lookup  (was: Postgres via db.ts Pool)
  const hash = await sha256hex(rawKey);
  const key  = await findKeyByHash(hash);   // now hits Go GET /api/v1/integration/keys?hash=

  if (!key) {
    return NextResponse.json(
      { success: false, error: "Invalid API key" },
      { status: 401 },
    );
  }

  // 3. Validate
  if (key.is_deleted) {
    return NextResponse.json({ success: false, error: "API key has been deleted" }, { status: 403 });
  }
  if (!key.is_active) {
    return NextResponse.json({ success: false, error: "API key is disabled" }, { status: 403 });
  }
  if (key.expires_at > 0 && key.expires_at < Date.now()) {
    return NextResponse.json({ success: false, error: "API key has expired" }, { status: 403 });
  }

  // 4. Parse body
  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const action = (body.action as string) ?? "";
  if (!action) {
    return NextResponse.json(
      {
        success: false,
        error:   "Missing required field: action",
        hint:    `Available actions for '${feature}': ${Object.keys(FEATURE_MAP[feature] ?? {}).join(", ")}`,
      },
      { status: 400 },
    );
  }

  // 5. Resolve route
  const featureRoutes = FEATURE_MAP[feature];
  if (!featureRoutes) {
    return NextResponse.json({ success: false, error: `Unknown feature: ${feature}` }, { status: 404 });
  }
  const route = featureRoutes[action];
  if (!route) {
    return NextResponse.json(
      { success: false, error: `Unknown action '${action}' for feature '${feature}'`, available: Object.keys(featureRoutes) },
      { status: 400 },
    );
  }

  // 6. Scope check
  const needed = requiredScope(feature, action);
  if (needed && !key.scopes.includes(needed)) {
    return NextResponse.json(
      { success: false, error: `API key does not have required scope: ${needed}`, granted: key.scopes },
      { status: 403 },
    );
  }

  // 7. Build Go URL + service token
  const goBase  = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";
  const params  = (body.params  as Record<string, string>) ?? {};
  const payload = body.data ?? body.payload ?? null;

  const url = new URL(route.path, goBase);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const serviceToken = await getServiceToken();
  if (!serviceToken) {
    return NextResponse.json(
      { success: false, error: "Server misconfiguration: service token unavailable" },
      { status: 500 },
    );
  }

  // 8. Proxy to Go
  try {
    const goRes = await fetch(url.toString(), {
      method:  route.method,
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${serviceToken}`,
      },
      body: ["GET", "HEAD"].includes(route.method)
        ? undefined
        : JSON.stringify(payload ?? {}),
    });

    const responseData = await goRes.json().catch(() => ({}));

    // 9. Increment stats via Go  (was: direct Postgres UPDATE)
    if (needed) {
      incrementStats(key.id, needed); // fire-and-forget — defined as non-blocking in db.ts
    }

    return NextResponse.json(
      {
        ...responseData,
        _gateway: {
          key_name:   key.name,
          feature,
          action,
          scope:      needed,
          proxied_by: "nextjs-integration-gateway",
        },
      },
      { status: goRes.status },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Proxy error";
    return NextResponse.json(
      { success: false, error: `Failed to reach Go backend: ${message}` },
      { status: 502 },
    );
  }
}