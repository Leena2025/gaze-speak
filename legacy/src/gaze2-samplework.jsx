import { useEffect, useRef, useState } from "react";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";

const TOTAL_POINTS = 9;
const SAMPLES_PER_POINT = 30;

const POINTS = [
  { x: 15, y: 15 },
  { x: 50, y: 15 },
  { x: 85, y: 15 },

  { x: 15, y: 50 },
  { x: 50, y: 50 },
  { x: 85, y: 50 },

  { x: 15, y: 85 },
  { x: 50, y: 85 },
  { x: 85, y: 85 },
];

export default function GazeCalibration() {
  const videoRef = useRef(null);
  const detectorRef = useRef(null);
  const streamRef = useRef(null);

  const runningRef = useRef(false);
  const detectingRef = useRef(false);

  const timerRef = useRef(null);

  const samplingRef = useRef(false);
  const samplesRef = useRef([]);

  const pointIndexRef = useRef(0);
  const pointSamplesRef = useRef([]);

  const lastFaceStateRef = useRef(null);

  const [status, setStatus] =
    useState("Starting system...");

  const [faceDetected, setFaceDetected] =
    useState(false);

  const [calibrating, setCalibrating] =
    useState(false);

  const [pointIndex, setPointIndex] =
    useState(0);

  const [sampleCount, setSampleCount] =
    useState(0);

  const [completed, setCompleted] =
    useState(false);

  // =====================================================
  // START SYSTEM
  // =====================================================

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        runningRef.current = true;

        console.log(
          "SYSTEM → Starting TensorFlow"
        );

        setStatus(
          "Starting TensorFlow..."
        );

        await tf.setBackend("webgl");
        await tf.ready();

        if (cancelled) return;

        console.log(
          "SYSTEM → TensorFlow ready"
        );

        // -----------------------------------------------
        // FACEMESH
        // -----------------------------------------------

        console.log(
          "SYSTEM → Loading FaceMesh"
        );

        setStatus(
          "Loading FaceMesh..."
        );

        const detector =
          await faceLandmarksDetection.createDetector(
            faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
            {
              runtime: "tfjs",
              refineLandmarks: true,
            }
          );

        if (cancelled) return;

        detectorRef.current = detector;

        console.log(
          "SYSTEM → FaceMesh loaded successfully"
        );

        // -----------------------------------------------
        // CAMERA
        // -----------------------------------------------

        console.log(
          "SYSTEM → Requesting camera"
        );

        setStatus(
          "Requesting camera..."
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

        if (cancelled) {
          stream
            .getTracks()
            .forEach((track) =>
              track.stop()
            );

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
            video.onloadedmetadata =
              resolve;
          }
        });

        if (cancelled) return;

        await video.play();

        await waitForVideo(video);

        if (cancelled) return;

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
        if (cancelled) return;

        console.error(
          "SYSTEM ERROR:",
          error
        );

        setStatus(
          `Error: ${error?.message || error}`
        );
      }
    };

    start();

    return () => {
      cancelled = true;
      runningRef.current = false;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      if (streamRef.current) {
        streamRef.current
          .getTracks()
          .forEach((track) =>
            track.stop()
          );

        streamRef.current = null;
      }
    };
  }, []);

  // =====================================================
  // WAIT FOR VIDEO
  // =====================================================

  const waitForVideo = async (video) => {
    const startTime = Date.now();

    while (
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      if (
        Date.now() - startTime >
        5000
      ) {
        throw new Error(
          "Camera video dimensions unavailable."
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
        await detector.estimateFaces(
          video
        );

      const hasFace =
        faces.length > 0;

      setFaceDetected(hasFace);

      // Log ONLY when state changes
      if (
        lastFaceStateRef.current !==
        hasFace
      ) {
        lastFaceStateRef.current =
          hasFace;

        if (hasFace) {
          console.log(
            `FACE → Detected: ${faces[0].keypoints.length} landmarks`
          );

          setStatus(
            "Face detected. Ready for calibration."
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

      // -----------------------------------------------
      // CALIBRATION SAMPLE
      // -----------------------------------------------

      if (
        hasFace &&
        samplingRef.current
      ) {
        collectSample(
          faces[0].keypoints
        );
      }

    } catch (error) {
      console.error(
        "FACE DETECTION ERROR:",
        error
      );
    }

    detectingRef.current = false;

    scheduleDetection();
  };

  // =====================================================
  // DETECTION TIMER
  // =====================================================

  const scheduleDetection = () => {
    if (!runningRef.current) {
      return;
    }

    timerRef.current =
      setTimeout(() => {
        detectFace();
      }, 150);
  };

  // =====================================================
  // START CALIBRATION
  // =====================================================

  const startCalibration = () => {
    if (!faceDetected) {
      console.log(
        "CALIBRATION → Cannot start: no face"
      );

      setStatus(
        "Please look at the camera first."
      );

      return;
    }

    samplesRef.current = [];

    pointSamplesRef.current = [];

    pointIndexRef.current = 0;

    setPointIndex(0);
    setSampleCount(0);
    setCompleted(false);

    samplingRef.current = false;
    setCalibrating(false);

    console.log(
      "CALIBRATION → Started"
    );

    setStatus(
      "Get ready..."
    );

    setTimeout(() => {
      if (!runningRef.current) {
        return;
      }

      beginPoint(0);
    }, 1000);
  };

  // =====================================================
  // BEGIN POINT
  // =====================================================

  const beginPoint = (index) => {
    pointIndexRef.current = index;

    pointSamplesRef.current = [];

    setPointIndex(index);
    setSampleCount(0);

    samplingRef.current = true;

    setCalibrating(true);

    setStatus(
      `Look at the red dot — Point ${index + 1}`
    );

    console.log(
      `CALIBRATION → Point ${index + 1}/9 → sampling started`
    );
  };

  // =====================================================
  // COLLECT SAMPLE
  // =====================================================

  const collectSample = (keypoints) => {
    if (!samplingRef.current) {
      return;
    }

    if (
      pointSamplesRef.current.length >=
      SAMPLES_PER_POINT
    ) {
      return;
    }

    const sample =
      keypoints.map((point) => ({
        x: point.x,
        y: point.y,
        z: point.z ?? 0,
      }));

    pointSamplesRef.current.push(
      sample
    );

    const count =
      pointSamplesRef.current.length;

    setSampleCount(count);

    // Only a few console messages
    if (
      count === 1 ||
      count === 10 ||
      count === 20 ||
      count === 30
    ) {
      console.log(
        `CALIBRATION → Point ${
          pointIndexRef.current + 1
        }/9 → ${count}/30`
      );
    }

    if (count >= SAMPLES_PER_POINT) {
      finishPoint();
    }
  };

  // =====================================================
  // FINISH POINT
  // =====================================================

  const finishPoint = () => {
    samplingRef.current = false;

    const current =
      pointIndexRef.current;

    samplesRef.current.push({
      point: current + 1,

      target:
        POINTS[current],

      landmarks:
        pointSamplesRef.current,
    });

    console.log(
      `CALIBRATION → Point ${current + 1}/9 → COMPLETE`
    );

    // -----------------------------------------------
    // ALL POINTS COMPLETE
    // -----------------------------------------------

    if (current === TOTAL_POINTS - 1) {
      finishCalibration();
      return;
    }

    // -----------------------------------------------
    // NEXT POINT
    // -----------------------------------------------

    const next = current + 1;

    setStatus(
      `Point ${current + 1} complete.`
    );

    setTimeout(() => {
      if (!runningRef.current) {
        return;
      }

      beginPoint(next);
    }, 700);
  };

  // =====================================================
  // FINISH CALIBRATION
  // =====================================================

  const finishCalibration = () => {
    samplingRef.current = false;

    setCalibrating(false);

    setCompleted(true);

    setStatus(
      "9-point calibration complete!"
    );

    console.log(
      "CALIBRATION → ALL 9 POINTS COMPLETE"
    );

    console.log(
      "CALIBRATION → Total samples: 270"
    );

    console.log(
      "CALIBRATION → SUCCESS"
    );

    console.log(
      "CALIBRATION DATA:",
      samplesRef.current
    );
  };

  // =====================================================
  // RESET
  // =====================================================

  const resetCalibration = () => {
    samplesRef.current = [];

    pointSamplesRef.current = [];

    pointIndexRef.current = 0;

    samplingRef.current = false;

    setPointIndex(0);
    setSampleCount(0);
    setCalibrating(false);
    setCompleted(false);

    setStatus(
      faceDetected
        ? "Face detected. Ready."
        : "Waiting for face..."
    );

    console.log(
      "CALIBRATION → Reset"
    );
  };

  // =====================================================
  // CURRENT POINT
  // =====================================================

  const currentPoint =
    POINTS[pointIndex];

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
          background: "#000",
          borderRadius: "10px",
          zIndex: 10,
        }}
      />

      {/* NORMAL SCREEN */}

      {!calibrating && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            top: "50%",
            transform:
              "translate(-50%, -50%)",
            textAlign: "center",
            width: "90%",
            maxWidth: "700px",
          }}
        >
          <h1>
            9-Point Gaze Calibration
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
              fontSize: "22px",
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
                    "14px 28px",
                  fontSize: "17px",
                  cursor: "pointer",
                  border: "none",
                  borderRadius: "8px",
                }}
              >
                Start Calibration
              </button>
            )}

          {completed && (
            <>
              <p
                style={{
                  fontSize: "25px",
                  fontWeight: "bold",
                }}
              >
                ✓ Calibration Complete
              </p>

              <p>
                9 points × 30 samples =
                270 samples
              </p>

              <button
                onClick={
                  resetCalibration
                }
                style={{
                  padding:
                    "12px 24px",
                  cursor: "pointer",
                  border: "none",
                  borderRadius: "8px",
                }}
              >
                Run Again
              </button>
            </>
          )}
        </div>
      )}

      {/* CALIBRATION */}

      {calibrating && (
        <>
          {/* RED DOT */}

          <div
            style={{
              position: "fixed",

              left:
                `${currentPoint.x}%`,

              top:
                `${currentPoint.y}%`,

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

          {/* INFORMATION */}

          <div
            style={{
              position: "fixed",

              left: "50%",
              top: "25px",

              transform:
                "translateX(-50%)",

              background:
                "rgba(0,0,0,0.8)",

              padding:
                "12px 20px",

              borderRadius: "8px",

              textAlign: "center",

              zIndex: 999999,
            }}
          >
            <div
              style={{
                fontSize: "20px",
                fontWeight: "bold",
              }}
            >
              Point {pointIndex + 1} / 9
            </div>

            <div>
              Samples:{" "}
              {sampleCount} / 30
            </div>
          </div>
        </>
      )}
    </div>
  );
}