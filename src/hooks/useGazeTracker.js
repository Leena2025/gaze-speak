import { useCallback, useEffect, useRef, useState } from "react";

// TF.js and the face model code (about 1 MB) load only when a camera
// screen opens, so the rest of the app starts quickly.
const loadTracker = () => import("../gaze/tracker.js");

const FACE_MESSAGES = {
  ok: "Face and eyes detected",
  "no-face": "Face not detected — center your face in the camera and check the lighting",
  "no-eyes": "Eyes not clearly visible — remove glare, face the screen, keep both eyes in view",
  error: "Tracking error — retrying",
};

/**
 * Owns the camera stream and the tracking loop for one screen. Exactly one
 * stream exists per mounted screen; it is stopped on unmount or retry.
 * `onFrame` is read through a ref so callers can pass a fresh closure.
 */
export function useGazeTracker(onFrame) {
  const videoRef = useRef(null);
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  });

  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState("loading"); // loading | ready | error
  const [message, setMessage] = useState("Loading the face-tracking model…");
  const [face, setFace] = useState("unknown");
  const [frameError, setFrameError] = useState("");
  const [stats, setStats] = useState({ fps: 0, detectMs: 0, backend: null, detectorLoadMs: null, cameraStartMs: null, warmupMs: null });

  useEffect(() => {
    let cancelled = false;
    let stream = null;
    let stopLoop = null;
    const video = videoRef.current;
    let lastFace = "unknown";
    let frames = 0;
    let detectTotal = 0;
    let windowStart = performance.now();
    const timings = {};

    const handleFrame = (frame) => {
      const faceState = frame.ok ? "ok" : frame.reason;
      if (faceState !== lastFace) {
        lastFace = faceState;
        setFace(faceState);
        if (faceState === "error") setFrameError(frame.message || "");
      }
      frames += 1;
      detectTotal += frame.detectMs;
      const now = performance.now();
      if (now - windowStart >= 1000) {
        const fps = (frames * 1000) / (now - windowStart);
        const detectMs = detectTotal / frames;
        setStats((previous) => ({ ...previous, fps, detectMs }));
        frames = 0;
        detectTotal = 0;
        windowStart = now;
      }
      onFrameRef.current?.(frame);
    };

    let stopCamera = (activeStream) => activeStream?.getTracks().forEach((track) => track.stop());

    (async () => {
      if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("simulate")) {
        const { startSimulatedLoop } = await import("../gaze/simulator.js");
        if (cancelled) return;
        setStats((previous) => ({ ...previous, backend: "simulator" }));
        setPhase("ready");
        setMessage("");
        windowStart = performance.now();
        stopLoop = startSimulatedLoop(handleFrame);
        return;
      }
      try {
        setPhase("loading");
        const tracker = await loadTracker();
        if (cancelled) return;
        const { attachCamera, getBackendName, loadDetector, requestCamera, startFrameLoop, warmUpDetector } = tracker;
        stopCamera = tracker.stopCamera;
        setMessage("Starting the camera and loading the face-tracking model…");
        // Camera and model start in parallel: camera warm-up overlaps the
        // model download, and opening the camera before WebGL initializes
        // avoided a capture failure observed in testing.
        const started = performance.now();
        const cameraPromise = requestCamera();
        const detectorPromise = loadDetector();
        const [cameraResult, detectorResult] = await Promise.allSettled([cameraPromise, detectorPromise]);
        if (cameraResult.status === "fulfilled") {
          if (cancelled) {
            stopCamera(cameraResult.value, null);
            return;
          }
          stream = cameraResult.value; // from here on, cleanup stops it
        }
        if (cancelled) return;
        if (cameraResult.status === "rejected") throw cameraResult.reason;
        if (detectorResult.status === "rejected") throw detectorResult.reason;
        const { detector, loadMs } = detectorResult.value;
        timings.detectorLoadMs = loadMs;

        let cameraEnded = false;
        const onEnded = () => {
          cameraEnded = true;
          if (cancelled) return;
          stopLoop?.();
          stopLoop = null;
          setFace("unknown");
          setPhase("error");
          // A dead camera keeps video.currentTime advancing on a frozen frame,
          // which would feed identical features to the model. Stop instead.
          setMessage("The camera stopped (disconnected, or taken by another app). Reconnect it, then press Retry.");
        };
        stream.getVideoTracks()[0]?.addEventListener("ended", onEnded);

        await attachCamera(video, stream);
        timings.cameraStartMs = performance.now() - started;
        if (cancelled || cameraEnded) return;
        setMessage("Preparing face tracking (first run takes a few seconds)…");
        timings.warmupMs = await warmUpDetector(detector, video);
        if (cancelled || cameraEnded) return;
        setStats((previous) => ({ ...previous, ...timings, backend: getBackendName() }));
        setPhase("ready");
        setMessage("");
        windowStart = performance.now();
        stopLoop = startFrameLoop(video, detector, handleFrame);
      } catch (error) {
        if (cancelled) return;
        stopCamera(stream, video);
        stream = null;
        setPhase("error");
        setMessage(error?.message || String(error));
      }
    })();

    return () => {
      cancelled = true;
      stopLoop?.();
      stopCamera(stream, video);
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    videoRef,
    phase,
    message,
    face,
    faceMessage: face === "error" && frameError
      ? `Tracking error (${frameError}) — retrying`
      : FACE_MESSAGES[face] ?? "Waiting for the camera…",
    stats,
    retry,
  };
}
