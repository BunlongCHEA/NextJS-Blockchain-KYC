/**
 * POST /api/integration/_sync
 * Called by the keys page whenever keys are created/updated/deleted.
 * Body: { keys: IntegrationKey[] }
 * Auth: next-auth session (admin only — no integration key needed here)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeServerKeys, readServerKeys } from "../lib/gateway";

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;

  if (!session || !["admin", "bank_admin"].includes(role)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { keys } = await req.json();
    if (!Array.isArray(keys)) {
      return NextResponse.json({ success: false, error: "keys must be an array" }, { status: 400 });
    }
    writeServerKeys(keys);
    return NextResponse.json({ success: true, count: keys.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// GET — returns current server-side keys (admin only, for debugging)
export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;

  if (!session || role !== "admin") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const keys = readServerKeys();
    return NextResponse.json({ success: true, count: keys.length, keys });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to read keys" }, { status: 500 });
  }
}