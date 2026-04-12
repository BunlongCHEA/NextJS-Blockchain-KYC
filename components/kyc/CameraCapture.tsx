"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Camera, RefreshCw, CheckCircle2, AlertTriangle, Loader2, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CaptureMode = "file" | "base64";

export interface CaptureResult {
  file?: File;
  base64?: string; // without data-url prefix, pure base64
  dataUrl: string; // for preview
}

interface CameraGuidance {
  ok: boolean;
  message: string;
  color: "green" | "yellow" | "red";
}

interface CameraCaptureProps {
  /** What the camera is for — shown as overlay label */
  label: string;
  /** "id_document" shows a landscape rect guide, "selfie" shows an oval face guide */
  mode: "id_document" | "selfie";
  /** Whether to return a File or base64 string (default: file) */
  captureMode?: CaptureMode;
  /** Called when user confirms the capture */
  onCapture: (result: CaptureResult) => void;
  /** Called when user wants to cancel / go back */
  onCancel?: () => void;
}

// ── Brightness helper (sample canvas pixels) ────────────────────────────────
function measureBrightness(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): number {
  const { width, height } = canvas;
  const imageData = ctx.getImageData(
    Math.floor(width * 0.25),
    Math.floor(height * 0.25),
    Math.floor(width * 0.5),
    Math.floor(height * 0.5)
  );
  const data = imageData.data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    // perceived luminance
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / (data.length / 4);
}

// ── Sharpness helper (Laplacian variance approximation) ─────────────────────
function measureSharpness(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): number {
  const { width, height } = canvas;
  const imageData = ctx.getImageData(
    Math.floor(width * 0.2),
    Math.floor(height * 0.2),
    Math.floor(width * 0.6),
    Math.floor(height * 0.6)
  );
  const data = imageData.data;
  const w = Math.floor(width * 0.6);
  const h = Math.floor(height * 0.6);
  let laplacianSum = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      const idxL = (y * w + (x - 1)) * 4;
      const idxR = (y * w + (x + 1)) * 4;
      const idxT = ((y - 1) * w + x) * 4;
      const idxB = ((y + 1) * w + x) * 4;
      const gL = 0.299 * data[idxL] + 0.587 * data[idxL + 1] + 0.114 * data[idxL + 2];
      const gR = 0.299 * data[idxR] + 0.587 * data[idxR + 1] + 0.114 * data[idxR + 2];
      const gT = 0.299 * data[idxT] + 0.587 * data[idxT + 1] + 0.114 * data[idxT + 2];
      const gB = 0.299 * data[idxB] + 0.587 * data[idxB + 1] + 0.114 * data[idxB + 2];
      const lap = Math.abs(-gL - gR - gT - gB + 4 * gray);
      laplacianSum += lap;
      count++;
    }
  }
  return count > 0 ? laplacianSum / count : 0;
}

// ── Derive real-time guidance from metrics ───────────────────────────────────
function deriveGuidance(
  brightness: number,
  sharpness: number,
  mode: "id_document" | "selfie"
): CameraGuidance {
  if (brightness < 40)
    return { ok: false, message: "Too dark — move to brighter light", color: "red" };
  if (brightness > 220)
    return { ok: false, message: "Too bright — avoid direct light / glare", color: "red" };
  if (sharpness < 3)
    return { ok: false, message: "Blurry — hold steady and focus", color: "yellow" };
  if (mode === "id_document" && brightness < 80)
    return { ok: false, message: "Low light — improve lighting for document", color: "yellow" };
  return {
    ok: true,
    message: mode === "selfie" ? "Good — look straight at camera" : "Good — align document in the frame",
    color: "green",
  };
}

export default function CameraCapture({
  label,
  mode,
  captureMode = "file",
  onCapture,
  onCancel,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const facingModeRef = useRef<"user" | "environment">(
    mode === "selfie" ? "user" : "environment"
  );
  const mountedRef  = useRef(true);   // tracks whether component is still in the DOM

  const [camError, setCamError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<CameraGuidance>({
    ok: false,
    message: "Starting camera…",
    color: "yellow",
  });
  const [starting, setStarting] = useState(true);

  // ── Stop stream ──────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // ── Start stream ─────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    // Guard: reset error + preview only if still mounted
    if (!mountedRef.current) return;
    setStarting(true);
    setCamError(null);
    setPreview(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingModeRef.current, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (err: any) {
      if (!mountedRef.current) return;          // unmounted while waiting for permission
      setStarting(false);
      if (err?.name === "NotAllowedError")
        setCamError("Camera access denied. Please allow camera in your browser settings.");
      else if (err?.name === "NotFoundError")
        setCamError("No camera found on this device.");
      else
        setCamError("Could not access camera: " + (err?.message ?? "unknown error"));
      return;
    }

    // Bail out if component unmounted while getUserMedia was resolving
    if (!mountedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;

    const video = videoRef.current;
    if (!video) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    video.srcObject = stream;

    // ── Play without await — handle AbortError silently ───────────────────
    // "play() interrupted because media was removed" = AbortError.
    // This happens when the component unmounts before play() resolves (e.g.
    // transitioning from ID step → selfie step). We ignore it rather than
    // showing a spurious error to the user.
    video.play().then(() => {
      if (mountedRef.current) setStarting(false);
    }).catch((err: DOMException) => {
      if (err?.name === "AbortError") {
        // Component was unmounted or stream stopped mid-play — safe to ignore
        return;
      }
      if (mountedRef.current) {
        setStarting(false);
        setCamError("Could not start camera playback. Please try again.");
      }
    });

  }, []);

//   // ── Start camera stream ──────────────────────────────────────────────────
//   const startCamera = useCallback(async () => {
//     setStarting(true);
//     setCamError(null);
//     setPreview(null);
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({
//         video: {
//           facingMode: facingModeRef.current,
//           width: { ideal: 1280 },
//           height: { ideal: 720 },
//         },
//         audio: false,
//       });
//       streamRef.current = stream;
//       if (videoRef.current) {
//         videoRef.current.srcObject = stream;
//         await videoRef.current.play();
//       }
//       setStarting(false);
//     } catch (err: any) {
//       setStarting(false);
//       if (err?.name === "NotAllowedError")
//         setCamError("Camera access denied. Please allow camera in your browser settings.");
//       else if (err?.name === "NotFoundError")
//         setCamError("No camera found on this device.");
//       else
//         setCamError("Could not open camera: " + (err?.message ?? "unknown error"));
//     }
//   }, []);

//   // ── Stop camera stream ───────────────────────────────────────────────────
//   const stopCamera = useCallback(() => {
//     cancelAnimationFrame(animFrameRef.current);
//     streamRef.current?.getTracks().forEach((t) => t.stop());
//     streamRef.current = null;
//   }, []);

  // ── Flip camera ──────────────────────────────────────────────────────────
  const flipCamera = () => {
    facingModeRef.current = facingModeRef.current === "user" ? "environment" : "user";
    stopCamera();
    startCamera();
  };

  // ── Real-time guidance loop ──────────────────────────────────────────────
  useEffect(() => {
    if (starting || camError || preview) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const tick = () => {
      if (video.readyState >= 2) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const brightness = measureBrightness(canvas, ctx);
          const sharpness = measureSharpness(canvas, ctx);
          setGuidance(deriveGuidance(brightness, sharpness, mode));
        }
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [starting, camError, preview, mode]);

  // ── Mount / unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;    // mark as mounted
    startCamera();
    return () => {
      mountedRef.current = false; // mark as unmounted BEFORE stopCamera
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // ── Capture snapshot ────────────────────────────────────────────────────
  const captureSnapshot = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror horizontally for selfie mode
    if (facingModeRef.current === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setPreview(dataUrl);
    stopCamera();
  };

  // ── Retake ───────────────────────────────────────────────────────────────
  const retake = () => {
    setPreview(null);
    startCamera();
  };

  // ── Confirm capture ──────────────────────────────────────────────────────
  const confirmCapture = () => {
    if (!preview) return;
    const base64 = preview.replace(/^data:image\/\w+;base64,/, "");

    if (captureMode === "base64") {
      onCapture({ base64, dataUrl: preview });
    } else {
      // Convert to File
      const byteStr = atob(base64);
      const arr = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
      const blob = new Blob([arr], { type: "image/jpeg" });
      const fileName =
        mode === "selfie" ? "selfie.jpg" : "id_document.jpg";
      const file = new File([blob], fileName, { type: "image/jpeg" });
      onCapture({ file, base64, dataUrl: preview });
    }
  };

  // ── Guidance badge style ─────────────────────────────────────────────────
  const guidanceBg = {
    green: "bg-green-900/80 text-green-300 border-green-700",
    yellow: "bg-yellow-900/80 text-yellow-300 border-yellow-700",
    red: "bg-red-900/80 text-red-300 border-red-700",
  }[guidance.color];

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Label */}
      <p className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{label}</p>

      {/* Camera error */}
      {camError && (
        <div className="w-full rounded-lg bg-red-950 border border-red-800 p-4 text-red-300 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {camError}
        </div>
      )}

      {/* Starting spinner */}
      {starting && !camError && (
        <div className="w-full aspect-video bg-gray-800 rounded-xl flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
        </div>
      )}

      {/* Live camera view OR preview */}
      {!camError && (
        <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
          {/* Video */}
          {!preview && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${
                facingModeRef.current === "user" ? "scale-x-[-1]" : ""
              }`}
            />
          )}

          {/* Preview image after capture */}
          {preview && (
            <img src={preview} alt="Captured" className="w-full h-full object-cover" />
          )}

          {/* Overlay guide frame */}
          {!preview && !starting && (
            <>
              {mode === "id_document" ? (
                // Landscape card frame
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div
                    className="border-2 border-blue-400 rounded-lg"
                    style={{ width: "72%", height: "58%", boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }}
                  />
                  {/* Corner accents */}
                  {["top-[21%] left-[14%]", "top-[21%] right-[14%]", "bottom-[21%] left-[14%]", "bottom-[21%] right-[14%]"].map(
                    (pos, i) => (
                      <div
                        key={i}
                        className={`absolute ${pos} w-5 h-5 border-blue-300 ${
                          i < 2 ? "border-t-2" : "border-b-2"
                        } ${i % 2 === 0 ? "border-l-2" : "border-r-2"}`}
                      />
                    )
                  )}
                </div>
              ) : (
                // Oval face guide
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div
                    className="border-2 border-blue-400 rounded-full"
                    style={{
                      width: "42%",
                      paddingBottom: "56%",
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                      position: "absolute",
                    }}
                  />
                </div>
              )}

              {/* Guidance badge */}
              <div
                className={`absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full border text-xs font-medium flex items-center gap-1.5 ${guidanceBg}`}
              >
                {guidance.color === "green" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                {guidance.message}
              </div>
            </>
          )}

          {/* Flip button */}
          {!preview && !starting && (
            <button
              onClick={flipCamera}
              className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 rounded-full p-2 text-white"
              title="Flip camera"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}

          {/* Zoom hint */}
          {!preview && !starting && mode === "id_document" && (
            <div className="absolute top-3 left-3 bg-black/50 rounded-full px-2 py-1 text-gray-300 text-xs flex items-center gap-1">
              <ZoomIn className="h-3 w-3" /> Fill the frame
            </div>
          )}
        </div>
      )}

      {/* Hidden canvas for pixel analysis & capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Action buttons */}
      <div className="flex gap-3 w-full">
        {!preview ? (
          <>
            <Button
              type="button"
              onClick={captureSnapshot}
              disabled={starting || !!camError || !guidance.ok}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              <Camera className="mr-2 h-4 w-4" />
              {guidance.ok ? "Capture" : "Waiting for good angle…"}
            </Button>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel} className="border-gray-700 text-gray-300">
                Cancel
              </Button>
            )}
          </>
        ) : (
          <>
            <Button
              type="button"
              onClick={confirmCapture}
              className="flex-1 bg-green-700 hover:bg-green-600"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Use This Photo
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={retake}
              className="border-gray-700 text-gray-300"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retake
            </Button>
          </>
        )}
      </div>
    </div>
  );
}