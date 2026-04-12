"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Search, Filter, Eye, CheckCircle, XCircle, RefreshCw,
  Camera, Upload, ScanLine, X, Loader2, AlertCircle,
  ZoomIn, RotateCcw, FlipHorizontal
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import KYCStatusBadge from "@/components/kyc/KYCStatusBadge";
import { KYCData } from "@/types/kyc";
import api from "@/lib/api";
import { format } from "date-fns";
import { toast } from "@/components/ui/use-toast";

// ─── Camera quality guide thresholds ───────────────────────────────────────
const GUIDE_ASPECT = 1.586; // ID card aspect ratio (85.6mm × 53.98mm)

type ScanResult = {
  customer_id: string;
  document_verified: boolean;
  face_matched: boolean;
  overall_score: number;
  ai_status: string;
  kyc_status: string;
  reason: string;
  ocr_result: Record<string, any>;
  score_breakdown: Record<string, any>;
};

// ─── Camera component ───────────────────────────────────────────────────────
function IDCardCamera({
  onCapture,
  onClose,
}: {
  onCapture: (file: File, preview: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [brightness, setBrightness] = useState(0);
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const animFrameRef = useRef<number>(0);

  const startCamera = useCallback(async (facing: "environment" | "user") => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    setReady(false);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current!.play();
          setReady(true);
          measureBrightness();
        };
      }
    } catch {
      setError("Camera access denied. Please allow camera permission or use file upload.");
    }
  }, []);

  // Continuously measure brightness to guide user
  const measureBrightness = useCallback(() => {
    const measure = () => {
      if (!videoRef.current || !canvasRef.current) return;
      const v = videoRef.current;
      const c = canvasRef.current;
      const ctx = c.getContext("2d");
      if (!ctx || v.readyState < 2) { animFrameRef.current = requestAnimationFrame(measure); return; }
      c.width = 64; c.height = 36; // small sample for perf
      ctx.drawImage(v, 0, 0, 64, 36);
      const d = ctx.getImageData(0, 0, 64, 36).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i+1] + d[i+2]) / 3;
      setBrightness(Math.round(sum / (64 * 36)));
      animFrameRef.current = requestAnimationFrame(measure);
    };
    measure();
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [facingMode, startCamera]);

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(v, 0, 0);
    const dataUrl = c.toDataURL("image/jpeg", 0.92);
    setCaptured(dataUrl);
  };

  const retake = () => setCaptured(null);

  const confirmCapture = () => {
    if (!captured || !canvasRef.current) return;
    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "id_card.jpg", { type: "image/jpeg" });
      onCapture(file, captured);
    }, "image/jpeg", 0.92);
  };

  // Quality indicator
  const brightLabel =
    brightness < 60 ? { text: "Too Dark", color: "text-red-400" } :
    brightness > 220 ? { text: "Too Bright", color: "text-yellow-400" } :
    { text: "Good Lighting ✓", color: "text-green-400" };

  return (
    <div className="flex flex-col items-center gap-4">
      {error ? (
        <div className="flex items-center gap-2 text-red-400 p-4 bg-red-950 rounded-lg">
          <AlertCircle className="h-5 w-5" />{error}
        </div>
      ) : (
        <>
          {/* Guide overlay */}
          <div className="relative w-full max-w-lg bg-black rounded-xl overflow-hidden">
            {!captured ? (
              <>
                <video ref={videoRef} className="w-full rounded-xl" playsInline muted />
                {/* ID card guide rectangle */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div
                    className="border-2 border-blue-400 rounded-lg opacity-80"
                    style={{ width: "80%", aspectRatio: GUIDE_ASPECT }}
                  >
                    {/* Corner marks */}
                    {["top-0 left-0 border-t-2 border-l-2",
                      "top-0 right-0 border-t-2 border-r-2",
                      "bottom-0 left-0 border-b-2 border-l-2",
                      "bottom-0 right-0 border-b-2 border-r-2"].map((c, i) => (
                      <div key={i} className={`absolute w-5 h-5 border-blue-400 ${c}`} />
                    ))}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ScanLine className="h-6 w-6 text-blue-300 opacity-60" />
                    </div>
                  </div>
                </div>
                {/* Brightness indicator */}
                <div className="absolute bottom-2 left-0 right-0 flex justify-center">
                  <span className={`text-xs font-medium px-2 py-0.5 bg-black/60 rounded-full ${brightLabel.color}`}>
                    {brightLabel.text}
                  </span>
                </div>
              </>
            ) : (
              <img src={captured} alt="Captured" className="w-full rounded-xl" />
            )}
          </div>

          {/* Tips */}
          {!captured && (
            <div className="text-xs text-gray-400 space-y-0.5 text-center">
              <p>• Align ID card inside the blue frame</p>
              <p>• Keep card flat & avoid glare / reflections</p>
              <p>• Ensure all 4 corners are visible</p>
              <p>• Hold steady — camera stabilizes automatically</p>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />

          <div className="flex gap-3 flex-wrap justify-center">
            {!captured ? (
              <>
                <Button
                  onClick={capture}
                  disabled={!ready}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Camera className="h-4 w-4 mr-2" />Capture
                </Button>
                <Button
                  variant="outline"
                  className="border-gray-700 text-gray-300"
                  onClick={() => setFacingMode(f => f === "environment" ? "user" : "environment")}
                >
                  <FlipHorizontal className="h-4 w-4 mr-2" />Flip
                </Button>
              </>
            ) : (
              <>
                <Button onClick={confirmCapture} className="bg-green-600 hover:bg-green-700">
                  <CheckCircle className="h-4 w-4 mr-2" />Use This Photo
                </Button>
                <Button onClick={retake} variant="outline" className="border-gray-700 text-gray-300">
                  <RotateCcw className="h-4 w-4 mr-2" />Retake
                </Button>
              </>
            )}
            <Button onClick={onClose} variant="ghost" className="text-gray-500">
              <X className="h-4 w-4 mr-2" />Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Scan Dialog ────────────────────────────────────────────────────────────
function ScanVerifyDialog({
  record,
  onClose,
  onDone,
}: {
  record: KYCData;
  onClose: () => void;
  onDone: () => void;
}) {
  const [tab, setTab] = useState<"camera" | "file">("camera");
  const [idFile, setIdFile] = useState<File | null>(null);
  const [idPreview, setIdPreview] = useState<string | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState<"id" | "selfie" | null>(null);
  const [docType, setDocType] = useState("national_id");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: "id" | "selfie") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (type === "id") { setIdFile(file); setIdPreview(url); }
    else { setSelfieFile(file); setSelfiePreview(url); }
  };

  const handleScan = async () => {
    if (!idFile) { setError("ID card image is required"); return; }
    setScanning(true); setError(null); setResult(null);

    try {
      const form = new FormData();
      form.append("customer_id", record.customer_id);
      form.append("document_type", docType);
      form.append("id_image", idFile);
      if (selfieFile) form.append("selfie_image", selfieFile);

      const res = await api.post("/api/v1/kyc/scan-verify/file", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = res.data?.data ?? res.data;
      setResult(data);

      if (data?.ai_status === "VERIFIED") {
        toast({ title: "KYC Verified ✓", description: `Score: ${(data.overall_score * 100).toFixed(1)}%` });
        onDone();
      } else if (data?.ai_status === "REJECTED") {
        toast({ title: "KYC Rejected", description: data.reason, variant: "destructive" });
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? "Scan failed";
      setError(msg);
    } finally {
      setScanning(false);
    }
  };

  const ScoreBar = ({ label, value }: { label: string; value: number }) => (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-400">
        <span>{label}</span><span>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${value >= 0.8 ? "bg-green-500" : value >= 0.5 ? "bg-yellow-500" : "bg-red-500"}`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  );

  return (
    <DialogContent className="bg-gray-900 border-gray-800 max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-white flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-blue-400" />
          AI Scan & Verify — {record.first_name} {record.last_name}
        </DialogTitle>
        <DialogDescription className="text-gray-400">
          Customer ID: <span className="font-mono text-gray-300">{record.customer_id}</span>
        </DialogDescription>
      </DialogHeader>

      {showCamera ? (
        <IDCardCamera
          onCapture={(file, preview) => {
            if (showCamera === "id") { setIdFile(file); setIdPreview(preview); }
            else { setSelfieFile(file); setSelfiePreview(preview); }
            setShowCamera(null);
          }}
          onClose={() => setShowCamera(null)}
        />
      ) : (
        <div className="space-y-5 mt-2">
          {/* Document Type */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400 shrink-0">Document Type</span>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="w-44 bg-gray-800 border-gray-700 text-white h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="national_id">National ID</SelectItem>
                <SelectItem value="passport">Passport</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ID Card */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-300">ID Card / Passport <span className="text-red-400">*</span></p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setShowCamera("id")}
                className="bg-blue-600 hover:bg-blue-700 text-xs">
                <Camera className="h-3.5 w-3.5 mr-1" />Camera
              </Button>
              <label className="cursor-pointer">
                <Button size="sm" variant="outline" className="border-gray-700 text-gray-300 text-xs pointer-events-none">
                  <Upload className="h-3.5 w-3.5 mr-1" />Upload File
                </Button>
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => handleFileChange(e, "id")} />
              </label>
            </div>
            {idPreview && (
              <div className="relative">
                <img src={idPreview} alt="ID" className="w-full max-h-40 object-contain rounded-lg border border-gray-700 bg-gray-800" />
                <button onClick={() => { setIdFile(null); setIdPreview(null); }}
                  className="absolute top-1 right-1 bg-gray-900/80 rounded-full p-0.5 text-gray-400 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Selfie (optional) */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-300">Selfie <span className="text-gray-500 text-xs">(optional — for face match)</span></p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setShowCamera("selfie")}
                className="bg-purple-600 hover:bg-purple-700 text-xs">
                <Camera className="h-3.5 w-3.5 mr-1" />Camera
              </Button>
              <label className="cursor-pointer">
                <Button size="sm" variant="outline" className="border-gray-700 text-gray-300 text-xs pointer-events-none">
                  <Upload className="h-3.5 w-3.5 mr-1" />Upload File
                </Button>
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => handleFileChange(e, "selfie")} />
              </label>
            </div>
            {selfiePreview && (
              <div className="relative">
                <img src={selfiePreview} alt="Selfie" className="w-32 h-32 object-cover rounded-lg border border-gray-700 bg-gray-800" />
                <button onClick={() => { setSelfieFile(null); setSelfiePreview(null); }}
                  className="absolute top-1 right-1 bg-gray-900/80 rounded-full p-0.5 text-gray-400 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-950 border border-red-800 rounded-lg text-red-300 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />{error}
            </div>
          )}

          {/* Scan Button */}
          <Button onClick={handleScan} disabled={scanning || !idFile}
            className="w-full bg-blue-600 hover:bg-blue-700">
            {scanning
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scanning...</>
              : <><ScanLine className="h-4 w-4 mr-2" />Run AI Scan & Verify</>}
          </Button>

          {/* Results */}
          {result && (
            <div className="space-y-3 border border-gray-700 rounded-lg p-4 bg-gray-800/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">Scan Result</span>
                <Badge className={
                  result.ai_status === "VERIFIED" ? "bg-green-900 text-green-300" :
                  result.ai_status === "REJECTED" ? "bg-red-900 text-red-300" :
                  "bg-yellow-900 text-yellow-300"
                }>
                  {result.ai_status}
                </Badge>
              </div>

              {/* Overall score */}
              <div className="flex items-center gap-3">
                <div className="text-2xl font-bold text-white">
                  {(result.overall_score * 100).toFixed(1)}%
                </div>
                <span className="text-gray-400 text-sm">Overall Score</span>
              </div>

              {/* Score breakdown */}
              {result.score_breakdown && (
                <div className="space-y-2">
                  {Object.entries(result.score_breakdown).map(([k, v]) => (
                    <ScoreBar key={k} label={k.replace(/_/g, " ")} value={Number(v)} />
                  ))}
                </div>
              )}

              {/* Flags */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className={`px-2 py-0.5 rounded-full ${result.document_verified ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
                  {result.document_verified ? "✓" : "✗"} Document
                </span>
                {result.face_matched !== undefined && (
                  <span className={`px-2 py-0.5 rounded-full ${result.face_matched ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
                    {result.face_matched ? "✓" : "✗"} Face Match
                  </span>
                )}
              </div>

              {result.reason && (
                <p className="text-xs text-gray-400 italic">{result.reason}</p>
              )}

              {/* OCR fields */}
              {result.ocr_result && Object.keys(result.ocr_result).length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-400 hover:text-gray-300">OCR Extracted Fields</summary>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {Object.entries(result.ocr_result).map(([k, v]) => (
                      <div key={k} className="flex gap-1">
                        <span className="text-gray-500 capitalize">{k.replace(/_/g, " ")}:</span>
                        <span className="text-gray-300">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </DialogContent>
  );
}

// ─── Main KYC Page ───────────────────────────────────────────────────────────
export default function KYCPage() {
  const [records, setRecords] = useState<KYCData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [scanRecord, setScanRecord] = useState<KYCData | null>(null);
  const [viewRecord, setViewRecord] = useState<KYCData | null>(null);

  const fetchKYC = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== "ALL") params.status = statusFilter;
      const res = await api.get("/api/v1/kyc/list", { params });
      const payload = res.data?.data;
      const arr = payload?.records ?? payload?.data ?? payload ?? [];
      setRecords(Array.isArray(arr) ? arr : []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchKYC(); }, [statusFilter]);

  const filtered = records.filter((r) =>
    r.first_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.last_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.email?.toLowerCase().includes(search.toLowerCase()) ||
    r.customer_id?.toLowerCase().includes(search.toLowerCase())
  );

  const handleVerify = async (customerId: string) => {
    try {
      await api.post("/api/v1/kyc/verify", { customer_id: customerId });
      toast({ title: "KYC Verified" });
      fetchKYC();
    } catch (e: any) {
      toast({ title: e?.response?.data?.message ?? "Verify failed", variant: "destructive" });
    }
  };

  const handleReject = async (customerId: string) => {
    const reason = window.prompt("Reason for rejection:");
    if (!reason) return;
    try {
      await api.post("/api/v1/kyc/reject", { customer_id: customerId, reason });
      toast({ title: "KYC Rejected" });
      fetchKYC();
    } catch (e: any) {
      toast({ title: e?.response?.data?.message ?? "Reject failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">KYC Management</h1>
          <p className="text-gray-400 text-sm mt-1">Review, scan and verify customer KYC applications</p>
        </div>
        <Button onClick={fetchKYC} variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:bg-gray-800">
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input placeholder="Search by name, email or ID..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px] bg-gray-800 border-gray-700 text-white">
                <Filter className="h-4 w-4 mr-2" /><SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700 text-white">
                {["ALL","PENDING","VERIFIED","REJECTED","SUSPENDED","EXPIRED"].map(s => (
                  <SelectItem key={s} value={s}>{s === "ALL" ? "All Statuses" : s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-gray-800 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800">
                  <TableHead className="text-gray-400">Name</TableHead>
                  <TableHead className="text-gray-400">Email</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-gray-400">Risk</TableHead>
                  <TableHead className="text-gray-400">Scan</TableHead>
                  <TableHead className="text-gray-400">Created</TableHead>
                  <TableHead className="text-right text-gray-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i} className="border-gray-800">
                      {[...Array(7)].map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-800" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 py-10">
                      No KYC records found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((record) => (
                    <TableRow key={record.customer_id} className="border-gray-800 hover:bg-gray-800/50">
                      <TableCell className="text-white font-medium">
                        {record.first_name} {record.last_name}
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">{record.email}</TableCell>
                      <TableCell><KYCStatusBadge status={record.status} /></TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                          record.risk_level === "high" ? "bg-red-900 text-red-300" :
                          record.risk_level === "medium" ? "bg-yellow-900 text-yellow-300" :
                          "bg-green-900 text-green-300"}`}>
                          {record.risk_level || "low"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {record.scan_status ? (
                          <Badge className={
                            record.scan_status === "VERIFIED" ? "bg-green-900 text-green-300 text-xs" :
                            record.scan_status === "REJECTED" ? "bg-red-900 text-red-300 text-xs" :
                            "bg-yellow-900 text-yellow-300 text-xs"
                          }>
                            {record.scan_status} {record.scan_score ? `${(record.scan_score * 100).toFixed(0)}%` : ""}
                          </Badge>
                        ) : (
                          <span className="text-gray-600 text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        {record.created_at ? format(new Date(record.created_at * 1000), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost"
                            className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 h-7 px-2"
                            onClick={() => setScanRecord(record)}>
                            <ScanLine className="h-3.5 w-3.5 mr-1" />Scan
                          </Button>
                          {record.status === "PENDING" && (
                            <>
                              <Button size="sm" variant="ghost"
                                className="text-green-400 hover:text-green-300 hover:bg-green-900/20 h-7 px-2"
                                onClick={() => handleVerify(record.customer_id)}>
                                <CheckCircle className="h-3.5 w-3.5 mr-1" />Verify
                              </Button>
                              <Button size="sm" variant="ghost"
                                className="text-red-400 hover:text-red-300 hover:bg-red-900/20 h-7 px-2"
                                onClick={() => handleReject(record.customer_id)}>
                                <XCircle className="h-3.5 w-3.5 mr-1" />Reject
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="ghost"
                            className="text-gray-400 hover:text-gray-300 h-7 px-2"
                            onClick={() => setViewRecord(record)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {!loading && (
            <p className="text-gray-500 text-xs mt-3">
              {filtered.length} of {records.length} records
            </p>
          )}
        </CardContent>
      </Card>

      {/* Scan Dialog */}
      {scanRecord && (
        <Dialog open onOpenChange={() => setScanRecord(null)}>
          <ScanVerifyDialog
            record={scanRecord}
            onClose={() => setScanRecord(null)}
            onDone={() => { setScanRecord(null); fetchKYC(); }}
          />
        </Dialog>
      )}

      {/* View Dialog */}
      {viewRecord && (
        <Dialog open onOpenChange={() => setViewRecord(null)}>
          <DialogContent className="bg-gray-900 border-gray-800 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white">
                {viewRecord.first_name} {viewRecord.last_name}
              </DialogTitle>
              <DialogDescription className="text-gray-400 font-mono text-xs">
                {viewRecord.customer_id}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 text-sm mt-2">
              {[
                ["Email", viewRecord.email],
                ["Phone", viewRecord.phone],
                ["DOB", viewRecord.date_of_birth],
                ["Nationality", viewRecord.nationality],
                ["ID Type", viewRecord.id_type],
                ["ID Expiry", viewRecord.id_expiry_date],
                ["Bank ID", viewRecord.bank_id],
                ["Risk Level", viewRecord.risk_level],
                ["Status", viewRecord.status],
                ["Scan Status", viewRecord.scan_status ?? "—"],
              ].map(([label, val]) => (
                <div key={label}>
                  <p className="text-gray-500 text-xs">{label}</p>
                  <p className="text-gray-200">{val || "—"}</p>
                </div>
              ))}
              {viewRecord.address && (
                <div className="col-span-2">
                  <p className="text-gray-500 text-xs">Address</p>
                  <p className="text-gray-200 text-sm">
                    {viewRecord.address.street}, {viewRecord.address.city},{" "}
                    {viewRecord.address.state} {viewRecord.address.postal_code},{" "}
                    {viewRecord.address.country}
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}