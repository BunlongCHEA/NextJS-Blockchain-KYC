/**
 * POST /api/integration/kyc-webhook
 *
 * Relay endpoint: Go-KYC calls this when a customer KYC status changes to
 * SUSPENDED or EXPIRED. NextJS validates the integration API key, then
 * forwards the payload to CBS /internal/webhook/kyc/status-changed.
 *
 * Auth:  Authorization: Bearer <integration_api_key>  (same key system as gateway)
 * Env:   CBS_WEBHOOK_URL     — e.g. https://cbs.bank/internal/webhook/kyc/status-changed
 *        CBS_WEBHOOK_SECRET  — shared secret CBS expects in X-Webhook-Api-Key header
 */

import { NextRequest, NextResponse } from "next/server";
import { findKeyByHash, incrementStats } from "../lib/db";

// SHA-256 helper (same as gateway.ts)
async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Validate integration API key from Go-KYC
  const authHeader = req.headers.get("authorization") ?? "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!rawKey) {
    return NextResponse.json({ success: false, error: "Missing Authorization header" }, { status: 401 });
  }

  const hash = await sha256hex(rawKey);
  const key  = await findKeyByHash(hash);

  if (!key || key.is_deleted || !key.is_active) {
    return NextResponse.json({ success: false, error: "Invalid or inactive API key" }, { status: 401 });
  }

  // Key must have kyc:verify scope to send status change notifications
  if (!key.scopes.includes("kyc:verify")) {
    return NextResponse.json({ success: false, error: "API key missing scope: kyc:verify" }, { status: 403 });
  }

  // 2. Parse payload from Go-KYC
  let body: { customer_id?: string; kyc_status?: string; timestamp?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.customer_id || !body.kyc_status) {
    return NextResponse.json({ success: false, error: "customer_id and kyc_status are required" }, { status: 400 });
  }

  const status = body.kyc_status.toUpperCase();
  if (status !== "SUSPENDED" && status !== "EXPIRED") {
    // Accept but ignore non-actionable statuses
    return NextResponse.json({ success: true, message: "Status not actionable, ignored" });
  }

  // 3. Forward to CBS
  const cbsUrl    = process.env.CBS_WEBHOOK_URL;
  const cbsSecret = process.env.CBS_WEBHOOK_SECRET;

  if (!cbsUrl || !cbsSecret) {
    console.error("[kyc-webhook] CBS_WEBHOOK_URL or CBS_WEBHOOK_SECRET not configured");
    return NextResponse.json({ success: false, error: "CBS integration not configured" }, { status: 500 });
  }

  try {
    const cbsRes = await fetch(cbsUrl, {
      method: "POST",
      headers: {
        "Content-Type":     "application/json",
        "X-Webhook-Api-Key": cbsSecret,  // CBS KycWebhookController validates this
      },
      body: JSON.stringify({
        customerId: body.customer_id,
        kycStatus:  status,
      }),
    });

    if (!cbsRes.ok) {
      const text = await cbsRes.text();
      console.error(`[kyc-webhook] CBS returned ${cbsRes.status}: ${text}`);
      return NextResponse.json({ success: false, error: `CBS rejected notification: ${cbsRes.status}` }, { status: 502 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[kyc-webhook] Failed to reach CBS:", msg);
    return NextResponse.json({ success: false, error: `Failed to reach CBS: ${msg}` }, { status: 502 });
  }

  // 4. Stats (fire-and-forget)
  incrementStats(key.id, "kyc:verify");

  console.log(`[kyc-webhook] Forwarded KYC status change → CBS: customer=${body.customer_id} status=${status}`);
  return NextResponse.json({ success: true, message: "KYC status change forwarded to CBS" });
}