import { useEffect, useRef, useState } from "react";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";

const TOTAL_SAMPLES = 30;

export default function GazeCalibration() {
  const videoRef = useRef(null);
  const detectorRef = useRef(null);
  const streamRef = useRef(null);

  const runningRef = useRef(false);
  const detectingRef = useRef(false);

  const samplingRef = useRef(false);
  const samplesRef = useRef([]);

  const timerRef = useRef(null);
  const lastFaceRef = useRef(null);

  const [status, setStatus] =
    useState("Starting system...");

  const [faceDetected, setFaceDetected] =
    useState(false);

  const [sampling, setSampling] =
    useState(false);

  const [sampleCount, setSampleCount] =
    useState(0);

  const [completed, setCompleted] =
    useState(false);

  // =====================================================
  // START
  // =====================================================

  useEffect(() => {
    let mounted = true;

    const startSystem = async () => {
      try {
        runningRef.current = true;

        console.log(
          "SYSTEM → Starting TensorFlow"
        );

        await tf.setBackend("webgl");
        await tf.ready();

        console.log(
          "SYSTEM → TensorFlow ready"
        );

        console.log(
          "SYSTEM → Loading FaceMesh"
        );

        const detector =
          await faceLandmarksDetection.createDetector(
            faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
            {
              runtime: "tfjs",
              refineLandmarks: true,
            }
          );

        if (!mounted) return;

        detectorRef.current = detector;

        console.log(
          "SYSTEM → FaceMesh loaded successfully"
        );

        console.log(
          "SYSTEM → Requesting camera"
        );

        const stream =
          await navigator.mediaDevices.getUserMedia({
            video: {
              width: 640,
              height: 480,
              facingMode: "user",
            },
            audio: false,
          });

        if (!mounted) {
          stream
            .getTracks()
            .forEach((track) => track.stop());

          return;
        }

        streamRef.current = stream;

        const video = videoRef.current;

        if (!video) {
          throw new Error(
            "Video element not found."
          );
        }

        video.srcObject = stream;

        await new Promise((resolve) => {
          if (video.readyState >= 1) {
            resolve();
          } else {
            video.onloadedmetadata = resolve;
          }
        });

        await video.play();

        await waitForVideo(video);

        console.log(
          `SYSTEM → Camera ready: ${video.videoWidth}x${video.videoHeight}`
        );

        setStatus(
          "Camera ready. Detecting face..."
        );

        console.log(
          "SYSTEM → Starting face detection"
        );

        detectFace();

      } catch (error) {
        console.error(
          "SYSTEM ERROR:",
          error
        );

        setStatus(
          `Error: ${error?.message || error}`
        );
      }
    };

    startSystem();

    return () => {
      mounted = false;
      runningRef.current = false;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      if (streamRef.current) {
        streamRef.current
          .getTracks()
          .forEach((track) => track.stop());
      }

      // Don't dispose here during development.
      // This avoids React StrictMode conflicts.
    };
  }, []);

  // =====================================================
  // WAIT FOR VIDEO
  // =====================================================

  const waitForVideo = async (video) => {
    const start = Date.now();

    while (
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      if (Date.now() - start > 5000) {
        throw new Error(
          "Camera video dimensions not available."
        );
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 100)
      );
    }
  };

  // =====================================================
  // FACE DETECTION
  // =====================================================

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

    if (
      !video ||
      !detector ||
      video.readyState < 2 ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      scheduleDetection();
      return;
    }

    detectingRef.current = true;

    try {
      const faces =
        await detector.estimateFaces(video);

      const hasFace =
        faces.length > 0;

      setFaceDetected(hasFace);

      // -------------------------------------------------
      // Log only when face state changes
      // -------------------------------------------------

      if (
        lastFaceRef.current !==
        hasFace
      ) {
        lastFaceRef.current =
          hasFace;

        if (hasFace) {
          console.log(
            `FACE → Detected → ${faces[0].keypoints.length} landmarks`
          );

          setStatus(
            "Face detected. Ready."
          );
        } else {
          console.log(
            "FACE → No face detected"
          );

          setStatus(
            "No face detected. Look at the camera."
          );
        }
      }

      // -------------------------------------------------
      // CALIBRATION SAMPLING
      // -------------------------------------------------

      if (
        hasFace &&
        samplingRef.current
      ) {
        const face = faces[0];

        collectCalibrationSample(
          face.keypoints
        );
      }

    } catch (error) {
      console.error(
        "DETECTION ERROR:",
        error
      );
    }

    detectingRef.current = false;

    scheduleDetection();
  };

  // =====================================================
  // DETECTION LOOP
  // =====================================================

  const scheduleDetection = () => {
    if (!runningRef.current) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current =
      setTimeout(
        detectFace,
        150
      );
  };

  // =====================================================
  // START CALIBRATION
  // =====================================================

  const startCalibration = () => {
    if (!faceDetected) {
      setStatus(
        "Please make sure your face is detected first."
      );

      console.log(
        "CALIBRATION → Cannot start: no face"
      );

      return;
    }

    // Clear previous samples
    samplesRef.current = [];

    setSampleCount(0);
    setCompleted(false);

    // Show dot immediately
    samplingRef.current = true;
    setSampling(true);

    setStatus(
      "Look at the red dot and keep your head still."
    );

    console.log(
      "CALIBRATION → Started"
    );

    console.log(
      "CALIBRATION → ONE DOT → Sampling started"
    );
  };

  // =====================================================
  // COLLECT CALIBRATION SAMPLE
  // =====================================================

  const collectCalibrationSample = (
    keypoints
  ) => {
    if (!samplingRef.current) {
      return;
    }

    if (
      samplesRef.current.length >=
      TOTAL_SAMPLES
    ) {
      return;
    }

    // Store the complete 478 landmark set.
    // This is what we'll later use for
    // actual gaze feature extraction.
    samplesRef.current.push(
      keypoints.map((point) => ({
        x: point.x,
        y: point.y,
        z: point.z ?? 0,
      }))
    );

    const count =
      samplesRef.current.length;

    setSampleCount(count);

    // Only log every 5 samples
    if (
      count === 1 ||
      count % 5 === 0 ||
      count === TOTAL_SAMPLES
    ) {
      console.log(
        `CALIBRATION → ONE DOT → ${count}/${TOTAL_SAMPLES}`
      );
    }

    // ---------------------------------------------------
    // COMPLETE
    // ---------------------------------------------------

    if (
      count >= TOTAL_SAMPLES
    ) {
      samplingRef.current = false;

      setSampling(false);
      setCompleted(true);

      setStatus(
        "One-dot calibration successful!"
      );

      console.log(
        "CALIBRATION → ONE DOT → COMPLETE"
      );

      console.log(
        `CALIBRATION → ${count} samples collected`
      );

      console.log(
        "CALIBRATION → SUCCESS"
      );
    }
  };

  // =====================================================
  // RESET
  // =====================================================

  const resetCalibration = () => {
    samplingRef.current = false;

    samplesRef.current = [];

    setSampling(false);
    setSampleCount(0);
    setCompleted(false);

    setStatus(
      faceDetected
        ? "Ready for calibration."
        : "Waiting for face..."
    );

    console.log(
      "CALIBRATION → Reset"
    );
  };

  // =====================================================
  // UI
  // =====================================================

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#111",
        color: "white",
        overflow: "hidden",
      }}
    >
      {/* CAMERA */}

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        width={640}
        height={480}
        style={{
          position: "fixed",
          top: "20px",
          left: "20px",

          width: "320px",
          height: "240px",

          objectFit: "cover",

          borderRadius: "10px",

          background: "#000",

          zIndex: 10,
        }}
      />

      {/* CENTER INFORMATION */}

      {!sampling && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            top: "50%",

            transform:
              "translate(-50%, -50%)",

            textAlign: "center",

            zIndex: 5,
          }}
        >
          <h1>
            One-Point Calibration Test
          </h1>

          <p
            style={{
              fontSize: "18px",
            }}
          >
            {status}
          </p>

          <p
            style={{
              fontSize: "20px",
              fontWeight: "bold",
            }}
          >
            Face:{" "}
            {faceDetected
              ? "Detected ✓"
              : "Not detected"}
          </p>

          {!completed &&
            faceDetected && (
              <button
                onClick={
                  startCalibration
                }
                style={{
                  padding:
                    "12px 24px",
                  fontSize: "16px",
                  cursor: "pointer",
                  borderRadius: "8px",
                  border: "none",
                }}
              >
                Start One-Dot Calibration
              </button>
            )}

          {completed && (
            <>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: "bold",
                  marginBottom:
                    "15px",
                }}
              >
                ✓ TEST SUCCESS
              </div>

              <button
                onClick={
                  resetCalibration
                }
                style={{
                  padding:
                    "10px 20px",
                  cursor: "pointer",
                  borderRadius: "8px",
                  border: "none",
                }}
              >
                Test Again
              </button>
            </>
          )}
        </div>
      )}

      {/* CALIBRATION SCREEN */}

      {sampling && (
        <>
          {/* RED DOT */}

          <div
            style={{
              position: "fixed",

              left: "50%",
              top: "50%",

              transform:
                "translate(-50%, -50%)",

              width: "42px",
              height: "42px",

              borderRadius: "50%",

              backgroundColor: "red",

              border:
                "4px solid white",

              boxShadow:
                "0 0 25px rgba(255,0,0,0.9)",

              zIndex: 999999,

              pointerEvents: "none",
            }}
          />

          {/* SAMPLE COUNTER */}

          <div
            style={{
              position: "fixed",

              left: "50%",
              bottom: "40px",

              transform:
                "translateX(-50%)",

              fontSize: "22px",

              fontWeight: "bold",

              zIndex: 999999,

              background:
                "rgba(0,0,0,0.7)",

              padding:
                "10px 18px",

              borderRadius: "8px",
            }}
          >
            Samples:{" "}
            {sampleCount}/
            {TOTAL_SAMPLES}
          </div>
        </>
      )}
    </div>
  );
}