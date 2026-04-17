import { NextRequest } from "next/server";
import { gatewayHandler, Feature } from "../lib/gateway";

const VALID_FEATURES: Feature[] = [
  "kyc", "users", "blockchain", "banks", "certificates", "audit",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ feature: string }> },
) {
  const { feature } = await params;

  if (!VALID_FEATURES.includes(feature as Feature)) {
    return Response.json(
      {
        success: false,
        error:   `Unknown feature: '${feature}'`,
        available: VALID_FEATURES,
      },
      { status: 404 },
    );
  }

  return gatewayHandler(req, feature as Feature);
}