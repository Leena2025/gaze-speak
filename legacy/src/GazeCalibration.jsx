import { useEffect, useRef, useState } from "react";

import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";

import { extractGazeFeatures, GAZE_FEATURE_COUNT, GAZE_FEATURE_VERSION, GAZE_REQUIRED_LANDMARK_COUNT, hasValidGazeLandmarks } from "./gaze/featureExtractor";
import { KEYBOARD_LAYOUT, createCalibrationTargets } from "./gaze/keyboardLayout";
import {
  ACTION_TARGET_COUNT,
  EXPECTED_ACTION_SAMPLE_COUNT,
  EXPECTED_LETTER_SAMPLE_COUNT,
  EXPECTED_TOTAL_SAMPLE_COUNT,
  LETTER_TARGET_COUNT,
  MIN_STABLE_SAMPLES,
  SAMPLE_INTERVAL_MS,
  SAMPLES_PER_TARGET,
  TARGET_WARMUP_MS,
  TOTAL_CALIBRATION_TARGET_COUNT,
} from "./gaze/calibrationConfig";
import { saveCalibrationDataset } from "./gaze/calibrationStorage";

const DETECTION_INTERVAL_MS = 120;
const SAMPLES_PER_POINT = SAMPLES_PER_TARGET;
const POINTS = createCalibrationTargets(KEYBOARD_LAYOUT);

export default function GazeCalibration() {
  const videoRef = useRef(null);
  const frameCanvasRef = useRef(null);
  const detectorRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const targetTimerRef = useRef(null);
  const transitionTimerRef = useRef(null);
  const runningRef = useRef(false);
  const systemGenerationRef = useRef(0);
  const detectingRef = useRef(false);
  const calibrationStartedRef = useRef(false);
  const cameraReadyRef = useRef(false);
  const calibratingRef = useRef(false);
  const completedRef = useRef(false);
  const samplingRef = useRef(false);
  const warmupRef = useRef(false);
  const pointIndexRef = useRef(0);
  const pointSamplesRef = useRef([]);
  const samplesRef = useRef([]);
  const lastSampleTimeRef = useRef(0);
  const lastSampleVideoTimeRef = useRef(-1);
  const lastVideoTimeRef = useRef(-1);
  const stalledFrameChecksRef = useRef(0);
  const lastFaceStateRef = useRef(false);

  const [status, setStatus] = useState("Starting TensorFlow...");
  const [faceDetected, setFaceDetected] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [pointIndex, setPointIndex] = useState(0);
  const [sampleCount, setSampleCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const clearDetectionLoop = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startCalibration = () => {
    if (!runningRef.current) {
      return;
    }

    if (!cameraReadyRef.current) {
      setStatus("Waiting for camera and detector to initialize.");
      return;
    }

    if (calibrationStartedRef.current && calibratingRef.current) {
      return;
    }

    calibrationStartedRef.current = true;
    samplesRef.current = [];
    pointSamplesRef.current = [];
    pointIndexRef.current = 0;
    lastSampleTimeRef.current = 0;
    warmupRef.current = false;
    samplingRef.current = false;
    calibratingRef.current = true;
    completedRef.current = false;

    setPointIndex(0);
    setSampleCount(0);
    setCompleted(false);
    setCalibrating(true);
    setStatus("Calibration ready. Look at the camera.");

    beginPoint(0);
  };

  const beginPoint = (index) => {
    window.clearTimeout(targetTimerRef.current);
    window.clearTimeout(transitionTimerRef.current);

    if (!runningRef.current || index < 0 || index >= POINTS.length) {
      finishCalibration();
      return;
    }

    pointIndexRef.current = index;
    pointSamplesRef.current = [];
    lastSampleTimeRef.current = 0;
    lastSampleVideoTimeRef.current = -1;
    warmupRef.current = true;
    samplingRef.current = false;

    setPointIndex(index);
    setSampleCount(0);
    calibratingRef.current = true;
    setCalibrating(true);

    const target = POINTS[index];
    console.log(`CALIBRATION → Target ${index + 1}/${POINTS.length} → ${target.label}`);
    setStatus(`Look at ${target.label}`);

    targetTimerRef.current = window.setTimeout(() => {
      if (!runningRef.current || pointIndexRef.current !== index) {
        return;
      }

      warmupRef.current = false;
      samplingRef.current = true;
      lastSampleTimeRef.current = 0;
      setStatus(`Look at ${target.label} and hold steady`);
    }, TARGET_WARMUP_MS);
  };

  const finishPoint = () => {
    if (!samplingRef.current) {
      return;
    }

    samplingRef.current = false;
    warmupRef.current = false;

    const currentIndex = pointIndexRef.current;
    const target = POINTS[currentIndex];

    samplesRef.current.push({
      point: currentIndex + 1,
      id: target.id,
      letter: target.type === "letter" ? target.label : null,
      type: target.type,
      target: { id: target.id, type: target.type, x: target.x, y: target.y },
      features: pointSamplesRef.current,
    });

    console.log(`CALIBRATION → ${target.label} complete (${pointSamplesRef.current.length} valid samples)`);

    if (currentIndex >= POINTS.length - 1) {
      finishCalibration();
      return;
    }

    const nextIndex = currentIndex + 1;
    setStatus(`${target.label} complete`);

    transitionTimerRef.current = window.setTimeout(() => {
      if (runningRef.current) {
        beginPoint(nextIndex);
      }
    }, 350);
  };

  const finishCalibration = () => {
    const incompleteTarget = samplesRef.current.find(
      (item) => item.features?.length !== SAMPLES_PER_POINT
    );
    if (samplesRef.current.length !== POINTS.length || incompleteTarget) {
      setStatus("Calibration is incomplete. Each letter and action target needs 50 valid samples.");
      return;
    }

    samplingRef.current = false;
    warmupRef.current = false;
    calibratingRef.current = false;
    completedRef.current = true;
    setCalibrating(false);
    setCompleted(true);

    const totalSamples = samplesRef.current.reduce((total, item) => total + (item.features?.length || 0), 0);
    console.log("CALIBRATION → COMPLETE", samplesRef.current);
    window.gazeCalibrationData = samplesRef.current;
    window.gazeCalibrationMetadata = {
      format: "gazespeak-calibration",
      featureVersion: GAZE_FEATURE_VERSION,
      featureCount: GAZE_FEATURE_COUNT,
      keyboardLayout: KEYBOARD_LAYOUT,
      targetCount: POINTS.length,
      letterTargetCount: LETTER_TARGET_COUNT,
      actionTargetCount: ACTION_TARGET_COUNT,
      samplesPerTarget: SAMPLES_PER_POINT,
      expectedLetterSamples: EXPECTED_LETTER_SAMPLE_COUNT,
      expectedActionSamples: EXPECTED_ACTION_SAMPLE_COUNT,
      expectedTotalSamples: EXPECTED_TOTAL_SAMPLE_COUNT,
      targetIds: POINTS.map((target) => target.id),
    };
    let saved = true;
    try {
      saveCalibrationDataset(samplesRef.current, window.gazeCalibrationMetadata);
    } catch (error) {
      saved = false;
      console.error("CALIBRATION → Could not persist dataset:", error);
    }
    setStatus(saved
      ? "26 letters and 2 action targets calibrated. Dataset saved."
      : "Calibration complete, but local dataset storage failed. Keep this tab open for training.");
    window.dispatchEvent(new CustomEvent("gaze-calibration-complete", { detail: samplesRef.current }));
    console.log(`CALIBRATION → ${samplesRef.current.length} targets | ${totalSamples} valid samples`);
  };

  const resetCalibration = () => {
    window.clearTimeout(targetTimerRef.current);
    window.clearTimeout(transitionTimerRef.current);
    samplingRef.current = false;
    warmupRef.current = false;
    calibrationStartedRef.current = false;
    calibratingRef.current = false;
    completedRef.current = false;
    cameraReadyRef.current = Boolean(cameraReady);
    pointIndexRef.current = 0;
    pointSamplesRef.current = [];
    samplesRef.current = [];
    lastSampleTimeRef.current = 0;
    lastSampleVideoTimeRef.current = -1;

    setPointIndex(0);
    setSampleCount(0);
    setCalibrating(false);
    setCompleted(false);
    setStatus("Calibration reset. Camera ready. Searching for face...");

    if (cameraReadyRef.current) {
      startCalibration();
    }
  };

  const repeatCurrentTarget = () => {
    if (!calibratingRef.current) {
      return;
    }

    pointSamplesRef.current = [];
    lastSampleTimeRef.current = 0;
    lastSampleVideoTimeRef.current = -1;
    setSampleCount(0);
    setStatus(`Repeating ${POINTS[pointIndexRef.current].letter}. Settle, then hold your gaze.`);
    beginPoint(pointIndexRef.current);
  };

  const collectSample = (keypoints, videoTime) => {
    if (!samplingRef.current || warmupRef.current) {
      return;
    }

    if (!hasValidGazeLandmarks(keypoints)) {
      return;
    }

    if (!Number.isFinite(videoTime) || videoTime <= lastSampleVideoTimeRef.current) {
      return;
    }

    lastSampleVideoTimeRef.current = videoTime;

    const now = performance.now();
    if (now - lastSampleTimeRef.current < SAMPLE_INTERVAL_MS) {
      return;
    }

    lastSampleTimeRef.current = now;

    try {
      const normalized = keypoints.map((point) => ({
        x: Number(point.x),
        y: Number(point.y),
        z: Number.isFinite(point.z) ? Number(point.z) : 0,
      }));

      if (!normalized.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z))) {
        return;
      }

      const features = extractGazeFeatures(normalized);
      if (!isValidFeatureVector(features)) {
        return;
      }

      if (isFeatureOutlier(features, pointSamplesRef.current)) {
        return;
      }

      pointSamplesRef.current.push(features);
      const count = pointSamplesRef.current.length;
      setSampleCount(count);

      if (count >= SAMPLES_PER_POINT) {
        finishPoint();
      }
    } catch (error) {
      console.warn("Calibration sample rejected:", error?.message || String(error));
    }
  };

  const scheduleDetection = () => {
    if (!runningRef.current) {
      return;
    }

    clearDetectionLoop();
    timerRef.current = window.setTimeout(() => {
      detectFace();
    }, DETECTION_INTERVAL_MS);
  };

  const detectFace = async () => {
    if (!runningRef.current) {
      return;
    }

    if (detectingRef.current) {
      scheduleDetection();
      return;
    }

    const video = videoRef.current;
    const detector = detectorRef.current;

    if (!video || !detector || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      setFaceDetected(false);
      lastFaceStateRef.current = false;
      setStatus("Waiting for video frames...");
      scheduleDetection();
      return;
    }

    if (video.paused || video.ended) {
      setFaceDetected(false);
      lastFaceStateRef.current = false;
      setStatus(video.ended ? "Camera stream ended. Retry camera / detection." : "Camera video is paused. Waiting for live frames...");
      scheduleDetection();
      return;
    }

    const videoTime = video.currentTime;
    if (videoTime > lastVideoTimeRef.current) {
      lastVideoTimeRef.current = videoTime;
      stalledFrameChecksRef.current = 0;
    } else if (++stalledFrameChecksRef.current >= 25) {
      setFaceDetected(false);
      lastFaceStateRef.current = false;
      setStatus("Camera frames are not advancing. Check the camera, then retry detection.");
      scheduleDetection();
      return;
    }

    detectingRef.current = true;

    try {
      const frameCanvas = frameCanvasRef.current || document.createElement("canvas");
      frameCanvasRef.current = frameCanvas;
      if (frameCanvas.width !== video.videoWidth || frameCanvas.height !== video.videoHeight) {
        frameCanvas.width = video.videoWidth;
        frameCanvas.height = video.videoHeight;
      }

      const frameContext = frameCanvas.getContext("2d");
      if (!frameContext) {
        throw new Error("Unable to prepare a canvas for camera frames.");
      }

      frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
      const faces = await detector.estimateFaces(frameCanvas, { flipHorizontal: false });
      if (!Array.isArray(faces)) {
        throw new Error("Face detector returned an invalid result.");
      }

      console.log("FACE DEBUG", {
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        currentTime: video.currentTime,
        faceCount: Array.isArray(faces) ? faces.length : "invalid result",
      });

      if (faces.length === 0) {
        setFaceDetected(false);
        lastFaceStateRef.current = false;
        setStatus(calibratingRef.current ? "Face lost - return to the camera. Your valid samples are preserved." : "Searching for face...");
        detectingRef.current = false;
        scheduleDetection();
        return;
      }

      const keypoints = Array.isArray(faces[0]?.keypoints) ? faces[0].keypoints : [];
      if (!Array.isArray(keypoints) || keypoints.length < GAZE_REQUIRED_LANDMARK_COUNT) {
        setFaceDetected(false);
        lastFaceStateRef.current = false;
        setStatus(`Face found, but only ${keypoints.length} of ${GAZE_REQUIRED_LANDMARK_COUNT} required landmarks were returned. Check detector configuration.`);
        detectingRef.current = false;
        scheduleDetection();
        return;
      }

      if (!hasValidGazeLandmarks(keypoints)) {
        setFaceDetected(false);
        lastFaceStateRef.current = false;
        setStatus("Face found, but required eye or iris landmarks are invalid. Improve lighting and keep both eyes visible.");
        detectingRef.current = false;
        scheduleDetection();
        return;
      }

      const detected = true;
      setFaceDetected(detected);
      if (lastFaceStateRef.current !== detected) {
        lastFaceStateRef.current = detected;
        console.log(`FACE → Detected: ${keypoints.length} landmarks`);
        if (calibratingRef.current) {
          const target = POINTS[pointIndexRef.current];
          setStatus(warmupRef.current ? `Face detected. Look at ${target.label}.` : `Face detected. Hold your gaze at ${target.label}.`);
        } else {
          setStatus("Face detected.");
        }
      }

      if (!calibrationStartedRef.current && !completedRef.current) {
        startCalibration();
      }

      if (calibratingRef.current && samplingRef.current) {
        collectSample(keypoints, video.currentTime);
      }
    } catch (error) {
      console.error("FACE DETECTION ERROR:", error);
      setFaceDetected(false);
      lastFaceStateRef.current = false;
      setStatus(`Detection error: ${error?.message || String(error)}. Retrying...`);
    } finally {
      detectingRef.current = false;
      scheduleDetection();
    }
  };

  const initializeSystem = async () => {
    const generation = ++systemGenerationRef.current;
    const isCurrentAttempt = () => runningRef.current && systemGenerationRef.current === generation;

    try {
      runningRef.current = true;
      cameraReadyRef.current = false;
      setCameraReady(false);
      setStatus("Starting TensorFlow...");

      await tf.setBackend("webgl");
      await tf.ready();
      if (!isCurrentAttempt()) {
        return;
      }
      setStatus("Loading FaceMesh detector...");

      const detector = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        {
          runtime: "tfjs",
          maxFaces: 1,
          refineLandmarks: true,
        }
      );

      if (!isCurrentAttempt()) {
        detector.dispose?.();
        return;
      }
      detectorRef.current = detector;

      setStatus("Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false,
      });

      if (!isCurrentAttempt()) {
        stream.getTracks().forEach((track) => track.stop());
        detector.dispose?.();
        return;
      }
      streamRef.current = stream;

      setStatus("Starting camera video...");
      const video = videoRef.current;
      if (!video) {
        throw new Error("Video element not found.");
      }

      video.srcObject = stream;
      await video.play();
      if (!isCurrentAttempt()) {
        return;
      }

      if (video.videoWidth === 0 || video.videoHeight === 0) {
        throw new Error("Camera is connected but no video frames are arriving.");
      }

      cameraReadyRef.current = true;
      lastVideoTimeRef.current = video.currentTime;
      stalledFrameChecksRef.current = 0;
      setCameraReady(true);
      setStatus("Camera ready. Calibration ready.");
      startCalibration();
      scheduleDetection();
    } catch (error) {
      console.error("SYSTEM ERROR:", error);
      if (isCurrentAttempt()) {
        setStatus(`Error: ${error?.message || String(error)}`);
      }
    }
  };

  const retryCamera = async () => {
    clearDetectionLoop();
    window.clearTimeout(targetTimerRef.current);
    window.clearTimeout(transitionTimerRef.current);
    stopStream();

    if (detectorRef.current?.dispose) {
      detectorRef.current.dispose();
      detectorRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setFaceDetected(false);
    setCalibrating(false);
    setCompleted(false);
    setSampleCount(0);
    cameraReadyRef.current = false;
    calibratingRef.current = false;
    completedRef.current = false;
    setCameraReady(false);
    calibrationStartedRef.current = false;
    samplingRef.current = false;
    warmupRef.current = false;
    pointIndexRef.current = 0;
    pointSamplesRef.current = [];
    samplesRef.current = [];

    setStatus("Retrying camera and detection...");
    await initializeSystem();
  };

  useEffect(() => {
    initializeSystem();

    return () => {
      runningRef.current = false;
      systemGenerationRef.current += 1;
      cameraReadyRef.current = false;
      clearDetectionLoop();
      window.clearTimeout(targetTimerRef.current);
      window.clearTimeout(transitionTimerRef.current);
      stopStream();
      if (detectorRef.current?.dispose) {
        detectorRef.current.dispose();
      }
    };
  }, []);

  const currentTarget = POINTS[pointIndex] || POINTS[0];
  const completedSamples = pointIndex * SAMPLES_PER_POINT + sampleCount;
  const calibrationProgress = Math.min(100, completedSamples / EXPECTED_TOTAL_SAMPLE_COUNT * 100);
  const targetCounter = currentTarget.type === "letter"
    ? `Letter ${pointIndex + 1}/${LETTER_TARGET_COUNT} · Overall ${pointIndex + 1}/${TOTAL_CALIBRATION_TARGET_COUNT}`
    : `Action ${pointIndex - LETTER_TARGET_COUNT + 1}/${ACTION_TARGET_COUNT} · Overall ${pointIndex + 1}/${TOTAL_CALIBRATION_TARGET_COUNT}`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        background: "#080d14",
        color: "#fff",
        overflow: "hidden",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          position: "fixed",
          top: "18px",
          left: "18px",
          width: "260px",
          height: "195px",
          objectFit: "cover",
          borderRadius: "14px",
          border: "2px solid rgba(255,255,255,0.25)",
          background: "#000",
          zIndex: 40,
        }}
      />

      <div
        style={{
          position: "fixed",
          top: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
          zIndex: 50,
        }}
      >
        <div style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.8 }}>
          GazeSpeak Calibration
        </div>
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
          {faceDetected ? "Face detected" : cameraReady ? "Camera ready · center your face" : "Initializing camera"}
        </div>
      </div>

      {!completed && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: 18,
            padding: 28,
            zIndex: 20,
          }}
        >
          <h1 style={{ margin: 0, fontSize: "clamp(26px, 4vw, 42px)" }}>Gaze calibration</h1>
          <p style={{ margin: 0, maxWidth: 700, color: "#dbeafe", fontSize: 18 }}>{status}</p>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            Face: {faceDetected ? "Detected ✓" : cameraReady ? "Not detected - center your face" : "Waiting for camera"}
          </div>
          <div style={{ width: "min(520px, 88vw)", textAlign: "left" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span>Overall valid samples</span>
              <span>{completedSamples} / {EXPECTED_TOTAL_SAMPLE_COUNT} · {calibrationProgress.toFixed(0)}%</span>
            </div>
            <div style={{ height: 8, background: "rgba(255,255,255,0.16)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ width: `${calibrationProgress}%`, height: "100%", background: "#28c2b7" }} />
            </div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
              A-Z: {EXPECTED_LETTER_SAMPLE_COUNT} samples · Space and Alert: {EXPECTED_ACTION_SAMPLE_COUNT} additional samples
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={startCalibration}
              style={{
                padding: "14px 22px",
                borderRadius: 12,
                border: "none",
                background: "#00a8c7",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              Start calibration
            </button>

            <button
              onClick={retryCamera}
              style={{
                padding: "14px 22px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.04)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              Retry camera / detection
            </button>
          </div>
        </div>
      )}

      {calibrating && currentTarget && (
        <>
          <div
            style={{
              position: "fixed",
              left: `${currentTarget.x}%`,
              top: `${currentTarget.y}%`,
              width: 40,
              height: 40,
              borderRadius: "50%",
              transform: "translate(-50%, -50%)",
              background: "#ef4444",
              border: "4px solid #fff",
              boxShadow: "0 0 28px rgba(239, 68, 68, 0.9)",
              zIndex: 60,
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "fixed",
              top: "20px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 70,
              width: "min(420px, 80vw)",
              background: "rgba(15, 23, 42, 0.85)",
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: 14,
              padding: "14px 18px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800 }}>{currentTarget.label}</div>
            <div style={{ marginTop: 2, fontSize: 14, opacity: 0.8 }}>{targetCounter}</div>
            <div style={{ marginTop: 4, fontSize: 14, opacity: 0.8 }}>Valid samples: {sampleCount} / {SAMPLES_PER_POINT}</div>
            <button
              onClick={repeatCurrentTarget}
              style={{
                marginTop: 10,
                padding: "7px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.24)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Repeat target
            </button>
            <button
              onClick={resetCalibration}
              style={{
                marginTop: 10,
                marginLeft: 8,
                padding: "7px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.24)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Restart calibration
            </button>
          </div>

          <div
            style={{
              position: "fixed",
              left: "50%",
              bottom: "24px",
              transform: "translateX(-50%)",
              padding: "10px 18px",
              background: "rgba(0,0,0,0.7)",
              borderRadius: 10,
              zIndex: 70,
              fontSize: 15,
            }}
          >
            {faceDetected ? "Look at the red dot and hold steady" : "Keep your full face centered in the camera frame."}
          </div>
        </>
      )}

      {completed && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 18,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 800 }}>Calibration complete</div>
          <div style={{ fontSize: 18, color: "#dbeafe" }}>{status}</div>
          <div style={{ maxWidth: 560, color: "#cbd5e1" }}>
            Run calibration again after a significant change in lighting, seating, camera placement, or display geometry.
          </div>
          <button
            onClick={resetCalibration}
            style={{
              padding: "12px 22px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "#111827",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Run again
          </button>
        </div>
      )}
    </div>
  );
}

function isValidFeatureVector(features) {
  return Array.isArray(features) && features.length === GAZE_FEATURE_COUNT && features.every((value) => Number.isFinite(value));
}

function isFeatureOutlier(features, previousSamples) {
  if (previousSamples.length < MIN_STABLE_SAMPLES) {
    return false;
  }

  const recentSamples = previousSamples.slice(-15);

  return features.some((value, featureIndex) => {
    const values = recentSamples.map((sample) => sample[featureIndex]).sort((a, b) => a - b);
    const center = median(values);
    const deviations = values.map((sampleValue) => Math.abs(sampleValue - center)).sort((a, b) => a - b);
    const robustScale = 1.4826 * median(deviations);
    const tolerance = Math.max(0.12, robustScale * 4.5);
    return Math.abs(value - center) > tolerance;
  });
}

function median(sortedValues) {
  const middle = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2
    ? sortedValues[middle]
    : (sortedValues[middle - 1] + sortedValues[middle]) / 2;
}
