"use client";

/**
 * KYCScanVerify
 * ─────────────
 * After a customer registers, this component walks them through:
 *   Step 1 – Capture ID document  (camera → CameraCapture)
 *   Step 2 – Capture selfie        (camera → CameraCapture)
 *   Step 3 – Submit to Go API:
 *              • POST /api/v1/kyc/scan-verify/file  (multipart, when captureMode="file")
 *              • POST /api/v1/kyc/scan-verify        (base64,    when captureMode="base64")
 *   Step 4 – Show AI result (score, status, OCR fields)
 *
 * Props:
 *   customerId   – the KYC customer ID returned after /api/v1/kyc/register
 *   documentType – "national_id" | "passport" | "driver_license"
 *   captureMode  – "file" (default, multipart) | "base64"
 *   onDone       – called when the flow finishes (success or skip)
 */

"use client";

import { useState } from "react";
import axios, { AxiosError } from "axios";
import {
  CheckCircle2, AlertTriangle, Loader2, ScanLine,
  IdCard, User as UserIcon, SkipForward, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import CameraCapture, { CaptureResult, CaptureMode } from "./CameraCapture";

interface VerifyResult {
  customer_id: string;
  document_verified: boolean;
  face_matched: boolean;
  overall_score: number;
  ai_status: string;
  kyc_status: string;
  reason: string;
  ocr_result: Record<string, unknown>;
  face_result: Record<string, unknown>;
  field_match: Record<string, unknown>;
  score_breakdown: Record<string, unknown>;
  pending_for_mine: boolean;
  timestamp: string;
}

type ScanStep = "id" | "selfie" | "submitting" | "result";

interface KYCScanVerifyProps {
  customerId: string;
  documentType?: "national_id" | "passport" | "driver_license";
  captureMode?: CaptureMode;
  apiBaseUrl: string;
  accessToken: string;
  onDone: (result?: VerifyResult) => void;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    VERIFIED:     "bg-green-900 text-green-300",
    REJECTED:     "bg-red-900 text-red-300",
    NEEDS_REVIEW: "bg-yellow-900 text-yellow-300",
  };
  return map[status] ?? "bg-gray-700 text-gray-300";
}

// ── Friendly error message from any axios / network error ────────────────────
function friendlyError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const axErr = err as AxiosError<{ message?: string; error?: string }>;

    // Network-level: ERR_CONNECTION_RESET, ERR_CONNECTION_REFUSED, ECONNRESET, etc.
    if (!axErr.response) {
      return (
        "Could not reach the server.\n" +
        "• Make sure the Go server is running on port 8080.\n" +
        "• Make sure the Python AI service is running (required for scan-verify).\n" +
        "If the Python service is not ready, you can skip this step and complete verification later."
      );
    }

    const status = axErr.response.status;
    const msg =
      axErr.response.data?.message ??
      axErr.response.data?.error ??
      axErr.message;

    if (status === 403)
      return "Permission denied (403). Ask your admin to grant kyc:verify to the customer role.";
    if (status === 401)
      return "Session expired (401). Please log in again.";
    if (status === 404)
      return "KYC record not found (404). The customer ID may be invalid.";
    if (status >= 500)
      return `Server error (${status}) — the Go server may be waiting on the Python AI service. ${msg ?? ""}`.trim();

    return msg ?? `Request failed with status ${status}`;
  }
  return "An unexpected error occurred. Please try again.";
}

export default function KYCScanVerify({
  customerId,
  documentType = "national_id",
  captureMode = "file",
  apiBaseUrl,
  accessToken,
  onDone,
}: KYCScanVerifyProps) {
  const [step,          setStep]          = useState<ScanStep>("id");
  const [idCapture,     setIdCapture]     = useState<CaptureResult | null>(null);
  const [submitting,    setSubmitting]    = useState(false);
  const [result,        setResult]        = useState<VerifyResult | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [retryCount,    setRetryCount]    = useState(0);

  // ── Step 1: ID captured ──────────────────────────────────────────────────
  const handleIdCapture = (res: CaptureResult) => {
    setIdCapture(res);
    setStep("selfie");
  };

  // ── Step 2: Selfie captured → submit ─────────────────────────────────────
  const handleSelfieCapture = async (res: CaptureResult) => {
    setStep("submitting");
    await submit(res);
  };

  // ── Submit to Go API ──────────────────────────────────────────────────────
  const submit = async (selfieRes: CaptureResult) => {
    if (!idCapture) return;
    setSubmitting(true);
    setError(null);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
    };

    try {
      let data: VerifyResult;

      if (captureMode === "file") {
        const form = new FormData();
        form.append("customer_id",   customerId);
        form.append("document_type", documentType);
        if (idCapture.file)   form.append("id_image",    idCapture.file,  "id_document.jpg");
        if (selfieRes.file)   form.append("selfie_image", selfieRes.file, "selfie.jpg");

        const resp = await axios.post(
          `${apiBaseUrl}/api/v1/kyc/scan-verify/file`,
          form,
          {
            headers,
            // ── Give the Python AI pipeline plenty of time ─────────────────
            // The Python OCR + face comparison can take 30-120 s on CPU.
            // Without a long timeout axios will abort and the browser reports
            // ERR_CONNECTION_RESET even though the server is still processing.
            timeout: 600_000, // 10 minutes
          }
        );
        data = resp.data?.data as VerifyResult;
      } else {
        const resp = await axios.post(
          `${apiBaseUrl}/api/v1/kyc/scan-verify`,
          {
            customer_id:        customerId,
            document_type:      documentType,
            id_image_base64:    idCapture.base64,
            selfie_image_base64: selfieRes.base64,
          },
          {
            headers: { ...headers, "Content-Type": "application/json" },
            timeout: 600_000,
          }
        );
        data = resp.data?.data as VerifyResult;
      }

      setResult(data);
      setStep("result");
    } catch (err) {
      setError(friendlyError(err));
      setStep("selfie"); // go back to selfie step so user can retry
      setRetryCount((c) => c + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const retrySelfie = () => {
    setError(null);
    setStep("selfie");
  };

  const retryFromId = () => {
    setError(null);
    setIdCapture(null);
    setStep("id");
  };

  // ── Progress bar ─────────────────────────────────────────────────────────
  const steps: { key: ScanStep; label: string }[] = [
    { key: "id",         label: "ID Scan"    },
    { key: "selfie",     label: "Selfie"     },
    { key: "submitting", label: "Processing" },
    { key: "result",     label: "Result"     },
  ];
  const currentIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="w-full max-w-lg mx-auto space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-2 justify-center text-xs text-gray-400">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-600">→</span>}
            <span className={`px-2 py-0.5 rounded-full ${
              step === s.key      ? "bg-blue-700 text-white"
              : currentIdx > i    ? "bg-green-900 text-green-300"
              :                     "bg-gray-800 text-gray-500"
            }`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <Alert className="bg-red-950 border-red-800">
          <WifiOff className="h-4 w-4 text-red-400 shrink-0" />
          <AlertDescription className="text-red-300 text-xs whitespace-pre-line">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* ── Step: ID document ── */}
      {step === "id" && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <IdCard className="h-5 w-5 text-blue-400" />
              Step 1 — Scan your ID Document
            </CardTitle>
            <p className="text-gray-400 text-xs">
              Hold your {documentType.replace(/_/g, " ")} flat — all corners visible, text readable.
            </p>
          </CardHeader>
          <CardContent>
            <CameraCapture
              label="ID / Passport"
              mode="id_document"
              captureMode={captureMode}
              onCapture={handleIdCapture}
              onCancel={() => onDone()}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Step: Selfie ── */}
      {step === "selfie" && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <UserIcon className="h-5 w-5 text-blue-400" />
              Step 2 — Take a Selfie
            </CardTitle>
            <p className="text-gray-400 text-xs">
              Look straight at the camera. Face well-lit and centred in the oval.
            </p>
          </CardHeader>
          <CardContent>
            {idCapture && (
              <div className="mb-3 flex items-center gap-2 text-green-400 text-xs">
                <CheckCircle2 className="h-4 w-4" />
                ID document captured successfully
              </div>
            )}
            {/* Show retry-from-ID button after failures */}
            {retryCount > 0 && (
              <button
                onClick={retryFromId}
                className="mb-3 text-xs text-gray-500 hover:text-gray-300 underline"
              >
                ← Re-capture ID document instead
              </button>
            )}
            <CameraCapture
              label="Selfie"
              mode="selfie"
              captureMode={captureMode}
              onCapture={handleSelfieCapture}
              onCancel={() => setStep("id")}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Step: Processing ── */}
      {step === "submitting" && (
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-10 pb-10 flex flex-col items-center gap-4 text-center">
            <ScanLine className="h-12 w-12 text-blue-400 animate-pulse" />
            <div>
              <p className="text-white font-semibold">Running AI Verification…</p>
              <p className="text-gray-400 text-sm mt-1">
                OCR scan → face match → blockchain record update
              </p>
              <p className="text-gray-500 text-xs mt-2">
                This can take up to 10 minutes — please keep this page open.
              </p>
            </div>
            <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
          </CardContent>
        </Card>
      )}

      {/* ── Step: Result ── */}
      {step === "result" && result && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
              Verification Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <span className={`text-xs px-3 py-1 rounded-full font-semibold ${statusBadge(result.ai_status)}`}>
                {result.ai_status}
              </span>
              <span className="text-gray-400 text-xs">
                Score: {(result.overall_score * 100).toFixed(1)}%
              </span>
              {result.document_verified && <Badge className="bg-blue-900 text-blue-300 text-xs">Document ✓</Badge>}
              {result.face_matched       && <Badge className="bg-purple-900 text-purple-300 text-xs">Face ✓</Badge>}
            </div>

            {result.reason && (
              <p className="text-gray-400 text-sm border-l-2 border-gray-700 pl-3">{result.reason}</p>
            )}

            {result.ocr_result && Object.keys(result.ocr_result).length > 0 && (
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">OCR Extracted</p>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(result.ocr_result).map(([k, v]) =>
                    v ? (
                      <div key={k} className="text-xs">
                        <span className="text-gray-500">{k.replace(/_/g, " ")}: </span>
                        <span className="text-gray-300">{String(v)}</span>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            )}

            {result.field_match && Object.keys(result.field_match).length > 0 && (
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Field Match</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(result.field_match).map(([k, v]) => (
                    <span key={k} className={`text-xs px-2 py-0.5 rounded-full ${v ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
                      {k.replace(/_/g, " ")} {v ? "✓" : "✗"}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.ai_status === "NEEDS_REVIEW" && (
              <Alert className="bg-yellow-950 border-yellow-800">
                <AlertDescription className="text-yellow-300 text-xs">
                  Documents submitted for manual review. A bank officer will verify them shortly.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3 pt-2">
              <Button onClick={() => onDone(result)} className="flex-1 bg-blue-600 hover:bg-blue-700">
                Continue to Login
              </Button>
              {result.ai_status !== "VERIFIED" && (
                <Button variant="outline" onClick={retrySelfie} className="border-gray-700 text-gray-300">
                  Retry
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Skip option */}
      {(step === "id" || step === "selfie") && (
        <button
          onClick={() => onDone()}
          className="w-full text-center text-xs text-gray-600 hover:text-gray-400 flex items-center justify-center gap-1 py-1"
        >
          <SkipForward className="h-3 w-3" />
          Skip for now — complete verification later
        </button>
      )}
    </div>
  );
}