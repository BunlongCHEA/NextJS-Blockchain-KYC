/**
 * app/api/integration/mq-keys/route.ts
 * ─────────────────────────────────────
 * GET  /api/integration/mq-keys           → list MQ encryption keys (metadata only)
 * POST /api/integration/mq-keys           → rotate to a new AES-256-GCM key
 *   Body: { policy_months: 6 | 12 }
 *
 * Auth: next-auth session, admin only — same gate as /api/integration/sync.
 *
 * Proxies to Go:
 *   GET  /api/v1/security/keys/mq
 *   POST /api/v1/security/keys/mq/rotate
 *
 * SECURITY NOTE: Go's ListMQKeys only ever returns MQKeySafeView (fingerprint,
 * version, dates) — the raw AES key never leaves the Go process. This route
 * is a thin pass-through and does not need to redact anything further.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { goFetch } from "../lib/db";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;

  if (!session || role !== "admin") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await goFetch("/api/v1/security/keys/mq");
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;

  if (!session || role !== "admin") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const policyMonths = Number(body?.policy_months);

    if (policyMonths !== 6 && policyMonths !== 12) {
      return NextResponse.json(
        { success: false, error: "policy_months must be 6 or 12" },
        { status: 400 },
      );
    }

    const res = await goFetch("/api/v1/security/keys/mq/rotate", {
      method: "POST",
      body:   JSON.stringify({ policy_months: policyMonths }),
    });
    const data = await res.json();
    // NOTE: data.data.key_material contains the one-time raw key. Deliberately
    // NOT logged here, NOT cached, NOT persisted anywhere on this server —
    // it streams straight through to the admin's browser response only.
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[mq-keys] rotate error:", message); // safe — error message only, never the body
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}