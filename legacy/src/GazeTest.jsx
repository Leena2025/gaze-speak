import { useEffect, useRef, useState } from "react";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";

export default function GazeTest() {
  const videoRef = useRef(null);
  const detectorRef = useRef(null);
  const animationRef = useRef(null);

  const [status, setStatus] = useState("Starting...");
  const [gaze, setGaze] = useState(null);

  useEffect(() => {
    let stream = null;
    let stopped = false;

    const start = async () => {
      try {
        setStatus("Starting TensorFlow...");

        await tf.setBackend("webgl");
        await tf.ready();

        console.log("TensorFlow ready");

        setStatus("Loading FaceMesh model...");

        const detector =
          await faceLandmarksDetection.createDetector(
            faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
            {
              runtime: "tfjs",
              refineLandmarks: true,
            }
          );

        detectorRef.current = detector;

        console.log("✅ FaceMesh model loaded");

        setStatus("Starting camera...");

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 640,
            height: 480,
            facingMode: "user",
          },
          audio: false,
        });

        const video = videoRef.current;

        video.srcObject = stream;

        await new Promise((resolve) => {
          video.onloadedmetadata = resolve;
        });

        await video.play();

        console.log("✅ Camera started");

        setStatus("Tracking eyes...");

        detectFace();

      } catch (error) {
        console.error("GAZE ERROR:", error);
        setStatus(`Error: ${error.message}`);
      }
    };

    const detectFace = async () => {
      if (stopped) return;

      const video = videoRef.current;
      const detector = detectorRef.current;

      if (
        !video ||
        !detector ||
        video.readyState < 2 ||
        video.videoWidth === 0
      ) {
        animationRef.current =
          requestAnimationFrame(detectFace);

        return;
      }

      try {
        const faces = await detector.estimateFaces(video);

        if (faces.length > 0) {
          const keypoints = faces[0].keypoints;

          const result = calculateEyePosition(keypoints);

          if (result) {
            setGaze(result);

            console.log(
              "GAZE:",
              result.x.toFixed(3),
              result.y.toFixed(3)
            );
          }
        }
      } catch (error) {
        console.error("Detection error:", error);
      }

      animationRef.current =
        requestAnimationFrame(detectFace);
    };

    start();

    return () => {
      stopped = true;

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      if (detectorRef.current) {
        detectorRef.current.dispose();
      }
    };
  }, []);

  return (
    <div className="gaze-page">

      <h1>Webcam Gaze Test</h1>

      <p>{status}</p>

      <video
        ref={videoRef}
        width="640"
        height="480"
        autoPlay
        muted
        playsInline
        style={{
          transform: "scaleX(-1)",
          borderRadius: "12px",
        }}
      />

      <div className="gaze-info">

        <h2>Eye Position</h2>

        {gaze ? (
          <>
            <p>
              X: {gaze.x.toFixed(3)}
            </p>

            <p>
              Y: {gaze.y.toFixed(3)}
            </p>

            <h2>
              {getDirection(gaze.x)}
            </h2>
          </>
        ) : (
          <p>Looking for face...</p>
        )}

      </div>

    </div>
  );
}


/* ------------------------------------------------ */
/* Calculate normalized iris position */
/* ------------------------------------------------ */

function calculateEyePosition(keypoints) {

  /*
    MediaPipe FaceMesh iris landmarks:

    Left iris: 468 - 472
    Right iris: 473 - 477

    Eye corners:

    Left eye:
      33  = outer corner
      133 = inner corner

    Right eye:
      362 = inner corner
      263 = outer corner
  */

  const leftIris = averagePoints(
    keypoints.slice(468, 473)
  );

  const rightIris = averagePoints(
    keypoints.slice(473, 478)
  );

  const leftOuter = keypoints[33];
  const leftInner = keypoints[133];

  const rightInner = keypoints[362];
  const rightOuter = keypoints[263];

  if (
    !leftIris ||
    !rightIris ||
    !leftOuter ||
    !leftInner ||
    !rightInner ||
    !rightOuter
  ) {
    return null;
  }

  /*
    Normalize iris position between
    the two eye corners.
  */

  const leftX =
    (leftIris.x - leftOuter.x) /
    (leftInner.x - leftOuter.x);

  const rightX =
    (rightIris.x - rightInner.x) /
    (rightOuter.x - rightInner.x);

  const x =
    (leftX + rightX) / 2;

  /*
    Iris vertical position.
  */

  const leftY =
    (leftIris.y -
      Math.min(leftOuter.y, leftInner.y)) /
    (
      Math.max(leftOuter.y, leftInner.y) -
      Math.min(leftOuter.y, leftInner.y)
    );

  const rightY =
    (rightIris.y -
      Math.min(rightInner.y, rightOuter.y)) /
    (
      Math.max(rightInner.y, rightOuter.y) -
      Math.min(rightInner.y, rightOuter.y)
    );

  const y =
    (leftY + rightY) / 2;

  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
  };
}


/* ------------------------------------------------ */
/* Average landmark points */
/* ------------------------------------------------ */

function averagePoints(points) {

  if (!points || points.length === 0) {
    return null;
  }

  let x = 0;
  let y = 0;
  let z = 0;

  points.forEach((point) => {
    x += point.x;
    y += point.y;
    z += point.z || 0;
  });

  return {
    x: x / points.length,
    y: y / points.length,
    z: z / points.length,
  };
}


/* ------------------------------------------------ */
/* Direction */
/* ------------------------------------------------ */

function getDirection(x) {

  if (x < 0.33) {
    return "LOOKING LEFT";
  }

  if (x > 0.66) {
    return "LOOKING RIGHT";
  }

  return "LOOKING CENTER";
}


/* ------------------------------------------------ */
/* Clamp */
/* ------------------------------------------------ */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}