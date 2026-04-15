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
  ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import CameraCapture, { CaptureResult, CaptureMode } from "./CameraCapture";

// ─── Types ────────────────────────────────────────────────────────────────────
 
interface OcrResult {
  confidence?: number;
  document_type?: string;
  extracted_fields?: Record<string, string | number | boolean | null>;
  fields_valid?: boolean;
  invalid_fields?: Record<string, string>;
  missing_required?: string[];
  mrz_confidence?: number;
  mrz_raw_text?: string[];
  ocr_strategy?: string;
  raw_text?: string[];
}
 
interface FaceAttempt {
  distance: number;
  similarity: number;
  strategy: string;
  verified: boolean;
}
 
interface FaceResult {
  all_attempts?: FaceAttempt[];
  device?: string;
  distance?: number;
  model?: string;
  preprocessing?: string;
  similarity_score?: number;
  threshold?: number;
  verified?: boolean;
}
 
interface FieldMatch {
  db_date?: string;
  db_found?: boolean;
  match_score?: number;
  matched_fields?: Record<string, boolean>;
  ocr_date?: string;
}
 
interface ScoreBreakdown {
  db_found?: boolean;
  db_match_score?: number;
  db_matched_fields?: Record<string, boolean>;
  db_weighted?: number;
  face_similarity?: number;
  face_weighted?: number;
  formula?: string;
  ocr_confidence?: number;
  ocr_strategy?: string;
  ocr_weighted?: number;
  overall_score?: number;
  threshold_review?: number;
  threshold_verified?: number;
}
 
interface VerifyResult {
  customer_id: string;
  document_verified: boolean;
  face_matched: boolean;
  overall_score: number;
  ai_status: string;
  kyc_status: string;
  reason: string;
  ocr_result: OcrResult;
  face_result: FaceResult;
  field_match: FieldMatch;
  score_breakdown: ScoreBreakdown;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
 
function statusBadge(status: string) {
  const map: Record<string, string> = {
    VERIFIED:     "bg-green-900 text-green-300",
    REJECTED:     "bg-red-900 text-red-300",
    NEEDS_REVIEW: "bg-yellow-900 text-yellow-300",
  };
  return map[status] ?? "bg-gray-700 text-gray-300";
}

// Friendly error message from any axios / network error
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

// Format a field key like "date_of_birth" → "Date Of Birth"
function formatKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
 
// Safely render any value as a readable string
function renderValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

// ─── Sub-components ───────────────────────────────────────────────────────────
 
// Collapsible section wrapper
function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/60 text-gray-300 text-xs font-semibold uppercase tracking-wider hover:bg-gray-800"
      >
        {title}
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}
 
// Key-value grid for flat objects
function KVGrid({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return <p className="text-gray-600 text-xs">—</p>;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      {entries.map(([k, v]) => (
        <div key={k} className="text-xs">
          <span className="text-gray-500">{formatKey(k)}: </span>
          <span className="text-gray-200">{renderValue(v)}</span>
        </div>
      ))}
    </div>
  );
}
 
// OCR extracted_fields — masked values with full display
function ExtractedFields({ fields }: { fields: Record<string, string | number | boolean | null> }) {
  const entries = Object.entries(fields);
  if (entries.length === 0) return <p className="text-gray-600 text-xs">No fields extracted.</p>;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
      {entries.map(([k, v]) => (
        <div key={k} className="text-xs">
          <p className="text-gray-500">{formatKey(k)}</p>
          <p className="text-gray-100 font-mono">{v !== null && v !== undefined ? String(v) : "—"}</p>
        </div>
      ))}
    </div>
  );
}
 
// Invalid fields — shows field name + reason
function InvalidFields({ fields }: { fields: Record<string, string> }) {
  const entries = Object.entries(fields);
  if (entries.length === 0)
    return <p className="text-green-400 text-xs flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> All fields valid</p>;
  return (
    <div className="space-y-1">
      {entries.map(([k, reason]) => (
        <div key={k} className="flex items-start gap-1.5 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <span className="text-gray-300">
            <span className="text-yellow-300 font-medium">{formatKey(k)}:</span> {reason}
          </span>
        </div>
      ))}
    </div>
  );
}
 
// Face comparison attempts table
function FaceAttempts({ attempts }: { attempts: FaceAttempt[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-800">
            <th className="text-left pb-1.5 pr-3">Strategy</th>
            <th className="text-right pb-1.5 pr-3">Similarity</th>
            <th className="text-right pb-1.5 pr-3">Distance</th>
            <th className="text-right pb-1.5">Result</th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((a, i) => (
            <tr key={i} className="border-b border-gray-800/50">
              <td className="py-1.5 pr-3 text-gray-300 font-mono">{a.strategy}</td>
              <td className="py-1.5 pr-3 text-right text-gray-200">{a.similarity.toFixed(1)}%</td>
              <td className="py-1.5 pr-3 text-right text-gray-400">{a.distance.toFixed(4)}</td>
              <td className="py-1.5 text-right">
                {a.verified
                  ? <span className="text-green-400">✓ Pass</span>
                  : <span className="text-red-400">✗ Fail</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
 
// Matched fields pills
function MatchedFields({ fields }: { fields: Record<string, boolean> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(fields).map(([k, v]) => (
        <span
          key={k}
          className={`text-xs px-2 py-0.5 rounded-full ${
            v ? "bg-green-900/60 text-green-300" : "bg-red-900/60 text-red-300"
          }`}
        >
          {formatKey(k)} {v ? "✓" : "✗"}
        </span>
      ))}
    </div>
  );
}
 
// Score breakdown bar
function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-200 tabular-nums">{value.toFixed(1)}/{max}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

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
              step === s.key   ? "bg-blue-700 text-white"
              : currentIdx > i ? "bg-green-900 text-green-300"
              :                  "bg-gray-800 text-gray-500"
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
          <AlertDescription className="text-red-300 text-xs whitespace-pre-line">{error}</AlertDescription>
        </Alert>
      )}
 
      {/* ── Step: ID ── */}
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
 
            {/* ── Top status row ── */}
            <div className="flex flex-wrap gap-3 items-center">
              <span className={`text-xs px-3 py-1 rounded-full font-semibold ${statusBadge(result.ai_status)}`}>
                {result.ai_status}
              </span>
              <span className="text-gray-400 text-xs tabular-nums">
                Score: {result.overall_score.toFixed(1)}%
              </span>
              {result.document_verified && (
                <Badge className="bg-blue-900 text-blue-300 text-xs">Document ✓</Badge>
              )}
              {result.face_matched && (
                <Badge className="bg-purple-900 text-purple-300 text-xs">Face ✓</Badge>
              )}
            </div>
 
            {result.reason && (
              <p className="text-gray-400 text-sm border-l-2 border-gray-700 pl-3">{result.reason}</p>
            )}
 
            {/* ── OCR Result ── */}
            {result.ocr_result && (
              <Section title="OCR Result">
                <div className="space-y-3">
                  {/* Meta row */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {result.ocr_result.document_type && (
                      <span className="text-gray-400">
                        Type: <span className="text-gray-200">{result.ocr_result.document_type}</span>
                      </span>
                    )}
                    {result.ocr_result.confidence !== undefined && (
                      <span className="text-gray-400">
                        Confidence: <span className="text-gray-200">{(result.ocr_result.confidence * 100).toFixed(1)}%</span>
                      </span>
                    )}
                    {result.ocr_result.mrz_confidence !== undefined && (
                      <span className="text-gray-400">
                        MRZ Confidence: <span className="text-gray-200">{(result.ocr_result.mrz_confidence * 100).toFixed(1)}%</span>
                      </span>
                    )}
                    {result.ocr_result.ocr_strategy && (
                      <span className="text-gray-400">
                        Strategy: <span className="text-gray-200">{result.ocr_result.ocr_strategy}</span>
                      </span>
                    )}
                    <span className="text-gray-400">
                      Fields Valid:{" "}
                      <span className={result.ocr_result.fields_valid ? "text-green-400" : "text-red-400"}>
                        {result.ocr_result.fields_valid ? "Yes" : "No"}
                      </span>
                    </span>
                  </div>
 
                  {/* Extracted fields */}
                  {result.ocr_result.extracted_fields &&
                    Object.keys(result.ocr_result.extracted_fields).length > 0 && (
                      <div>
                        <p className="text-gray-500 text-xs mb-1.5">Extracted Fields</p>
                        <ExtractedFields fields={result.ocr_result.extracted_fields} />
                      </div>
                    )}
 
                  {/* Invalid fields */}
                  {result.ocr_result.invalid_fields !== undefined && (
                    <div>
                      <p className="text-gray-500 text-xs mb-1.5">Invalid Fields</p>
                      <InvalidFields fields={result.ocr_result.invalid_fields} />
                    </div>
                  )}
 
                  {/* Missing required */}
                  {result.ocr_result.missing_required &&
                    result.ocr_result.missing_required.length > 0 && (
                      <div>
                        <p className="text-gray-500 text-xs mb-1">Missing Required</p>
                        <div className="flex flex-wrap gap-1">
                          {result.ocr_result.missing_required.map((f) => (
                            <span key={f} className="text-xs bg-red-900/50 text-red-300 px-2 py-0.5 rounded-full">
                              {formatKey(f)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
 
                  {/* MRZ raw text */}
                  {result.ocr_result.mrz_raw_text &&
                    result.ocr_result.mrz_raw_text.length > 0 && (
                      <div>
                        <p className="text-gray-500 text-xs mb-1">MRZ Lines</p>
                        <div className="bg-gray-950 rounded p-2 font-mono text-xs text-gray-300 space-y-0.5">
                          {result.ocr_result.mrz_raw_text.map((line, i) => (
                            <p key={i}>{line}</p>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              </Section>
            )}
 
            {/* ── Face Result ── */}
            {result.face_result && (
              <Section title="Face Comparison" defaultOpen={false}>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {result.face_result.model && (
                      <span className="text-gray-400">Model: <span className="text-gray-200">{result.face_result.model}</span></span>
                    )}
                    {result.face_result.device && (
                      <span className="text-gray-400">Device: <span className="text-gray-200">{result.face_result.device}</span></span>
                    )}
                    {result.face_result.threshold !== undefined && (
                      <span className="text-gray-400">Threshold: <span className="text-gray-200">{result.face_result.threshold}</span></span>
                    )}
                    {result.face_result.similarity_score !== undefined && (
                      <span className="text-gray-400">
                        Best Similarity: <span className="text-gray-200">{result.face_result.similarity_score.toFixed(1)}%</span>
                      </span>
                    )}
                  </div>
 
                  {result.face_result.all_attempts && result.face_result.all_attempts.length > 0 && (
                    <div>
                      <p className="text-gray-500 text-xs mb-1.5">All Attempts</p>
                      <FaceAttempts attempts={result.face_result.all_attempts} />
                    </div>
                  )}
                </div>
              </Section>
            )}
 
            {/* ── Field Match ── */}
            {result.field_match && (
              <Section title="DB Field Match" defaultOpen={false}>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {result.field_match.db_found !== undefined && (
                      <span className="text-gray-400">
                        DB Found:{" "}
                        <span className={result.field_match.db_found ? "text-green-400" : "text-red-400"}>
                          {result.field_match.db_found ? "Yes" : "No"}
                        </span>
                      </span>
                    )}
                    {result.field_match.match_score !== undefined && (
                      <span className="text-gray-400">
                        Score: <span className="text-gray-200">{result.field_match.match_score}</span>
                      </span>
                    )}
                    {result.field_match.db_date && (
                      <span className="text-gray-400">DB Date: <span className="text-gray-200">{result.field_match.db_date}</span></span>
                    )}
                    {result.field_match.ocr_date && (
                      <span className="text-gray-400">OCR Date: <span className="text-gray-200">{result.field_match.ocr_date}</span></span>
                    )}
                  </div>
                  {result.field_match.matched_fields &&
                    Object.keys(result.field_match.matched_fields).length > 0 && (
                      <div>
                        <p className="text-gray-500 text-xs mb-1">Matched Fields</p>
                        <MatchedFields fields={result.field_match.matched_fields} />
                      </div>
                    )}
                </div>
              </Section>
            )}
 
            {/* ── Score Breakdown ── */}
            {result.score_breakdown && (
              <Section title="Score Breakdown" defaultOpen={false}>
                <div className="space-y-2.5">
                  {result.score_breakdown.ocr_weighted !== undefined && (
                    <ScoreBar label="OCR" value={result.score_breakdown.ocr_weighted} max={33.33} />
                  )}
                  {result.score_breakdown.face_weighted !== undefined && (
                    <ScoreBar label="Face" value={result.score_breakdown.face_weighted} max={33.33} />
                  )}
                  {result.score_breakdown.db_weighted !== undefined && (
                    <ScoreBar label="DB Match" value={result.score_breakdown.db_weighted} max={33.33} />
                  )}
                  <div className="pt-1 border-t border-gray-800 flex justify-between text-xs">
                    <span className="text-gray-400">Overall Score</span>
                    <span className="text-white font-semibold tabular-nums">
                      {result.score_breakdown.overall_score?.toFixed(1) ?? result.overall_score.toFixed(1)}%
                    </span>
                  </div>
                  {result.score_breakdown.formula && (
                    <p className="text-gray-600 text-xs font-mono">{result.score_breakdown.formula}</p>
                  )}
                  <div className="flex gap-3 text-xs text-gray-500">
                    {result.score_breakdown.threshold_verified !== undefined && (
                      <span>Verified ≥ {result.score_breakdown.threshold_verified}</span>
                    )}
                    {result.score_breakdown.threshold_review !== undefined && (
                      <span>Review ≥ {result.score_breakdown.threshold_review}</span>
                    )}
                  </div>
                </div>
              </Section>
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