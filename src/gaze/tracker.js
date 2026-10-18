// Camera + FaceMesh landmark tracking shared by calibration and the demo.
//
// - The detector is created once per page load and reused across screens
//   (it previously was re-created, and its weights re-initialized, on every
//   screen change).
// - Frames go straight from the <video> element to the detector; the old code
//   copied every 1280x720 frame into a canvas first.
// - The camera is requested at 640x480: FaceMesh crops and resizes the face to
//   192x192 internally, so higher resolutions only add upload cost.
// - Each new video frame is processed at most once, never concurrently.
// - The first inference compiles WebGL shaders (seconds on some machines), so
//   it runs once on the live video while "Preparing" is shown, not silently
//   inside calibration.

import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-cpu";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";

import { extractGazeFeatures, GAZE_REQUIRED_LANDMARK_COUNT, hasValidGazeLandmarks } from "./featureExtractor.js";

let detectorPromise = null;
let backendName = null;

export function getBackendName() {
  return backendName;
}

export function loadDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const started = performance.now();
      // setBackend resolves to false (it does not throw) when WebGL is missing.
      const webglOk = await tf.setBackend("webgl").catch(() => false);
      if (!webglOk) await tf.setBackend("cpu");
      await tf.ready();
      backendName = tf.getBackend();
      const detector = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        { runtime: "tfjs", maxFaces: 1, refineLandmarks: true },
      );
      return { detector, loadMs: performance.now() - started };
    })().catch((error) => {
      detectorPromise = null; // allow a retry
      throw new Error(`Could not load the face-landmark model. Check the internet connection on first run (the model is downloaded once, then cached by the browser). ${error?.message || error}`);
    });
  }
  return detectorPromise;
}

/**
 * tfjs-models reads the input size from `element.width/height`. For a <video>
 * those are the HTML attributes (0 unless set), not the frame size, so an
 * unsized video makes the detector crop a 0x0 image and never find a face.
 * Mirror the real frame size into the attributes before every inference.
 * Returns false while the video has no frame size yet.
 */
export function syncVideoSize(video) {
  const { videoWidth, videoHeight } = video;
  if (!videoWidth || !videoHeight) return false;
  if (video.width !== videoWidth) video.width = videoWidth;
  if (video.height !== videoHeight) video.height = videoHeight;
  return true;
}

let warmedUp = false;

/** Runs one inference on the live video so later frames are fast. Once per page load. */
export async function warmUpDetector(detector, video) {
  if (warmedUp) return 0;
  const started = performance.now();
  syncVideoSize(video);
  await detector.estimateFaces(video, { flipHorizontal: false });
  warmedUp = true;
  return performance.now() - started;
}

export function describeCameraError(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera permission was denied. Allow camera access in the browser's address bar (camera icon), then press Retry.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found. Connect a webcam, then press Retry.";
    case "NotReadableError":
    case "AbortError":
      return "The camera is in use by another application or browser tab. Close it, then press Retry.";
    default:
      return `The camera could not be started: ${error?.message || error}`;
  }
}

export async function requestCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support camera access. Use a current version of Chrome, Edge or Firefox over http://localhost or https.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: "user" },
      audio: false,
    });
  } catch (error) {
    throw new Error(describeCameraError(error));
  }
}

function waitForFrames(video, timeoutMs) {
  if (video.readyState >= 2 && video.videoWidth) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (value) => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", onData);
      resolve(value);
    };
    const onData = () => done(true);
    const timer = setTimeout(() => done(false), timeoutMs);
    video.addEventListener("loadeddata", onData);
  });
}

/** Attaches a stream to the video element and waits until frames arrive. */
export async function attachCamera(video, stream) {
  video.muted = true;
  video.playsInline = true;
  for (let attempt = 0; attempt < 2; attempt++) {
    video.srcObject = stream;
    video.play().catch(() => {}); // readiness is checked below
    if (await waitForFrames(video, 8000) && syncVideoSize(video)) return;
    video.srcObject = null; // re-attach once: recovers a stalled media pipeline
  }
  throw new Error("The camera started but no video frames arrived. Close other apps using the camera, then press Retry.");
}

export function stopCamera(stream, video) {
  stream?.getTracks().forEach((track) => track.stop());
  // Only detach our own stream: clearing srcObject on an element that is about
  // to receive a new stream can stall its media pipeline in Chrome.
  if (video && stream && video.srcObject === stream) {
    video.srcObject = null;
  }
}

/**
 * Runs face tracking on every new camera frame until the returned function is
 * called.
 * onFrame receives { ok, features, reason, timestamp, detectMs }.
 */
export function startFrameLoop(video, detector, onFrame) {
  let stopped = false;
  let busy = false;
  let lastMediaTime = -1;
  let handle = null;

  // requestAnimationFrame + currentTime check rather than
  // requestVideoFrameCallback: the latter only fires for frames that are
  // painted, and the preview is deliberately invisible during calibration.
  const schedule = () => {
    if (!stopped) handle = requestAnimationFrame(tick);
  };

  const tick = async () => {
    if (stopped) return;
    const mediaTime = video.currentTime;
    // syncVideoSize also follows a resolution change mid-stream.
    if (busy || mediaTime === lastMediaTime || video.readyState < 2 || video.paused || !syncVideoSize(video)) {
      schedule();
      return;
    }
    lastMediaTime = mediaTime;
    busy = true;
    const started = performance.now();
    let result;
    try {
      const faces = await detector.estimateFaces(video, { flipHorizontal: false });
      const keypoints = faces?.[0]?.keypoints;
      if (!keypoints) {
        result = { ok: false, reason: "no-face" };
      } else if (keypoints.length < GAZE_REQUIRED_LANDMARK_COUNT || !hasValidGazeLandmarks(keypoints)) {
        result = { ok: false, reason: "no-eyes" };
      } else {
        result = {
          ok: true,
          features: extractGazeFeatures(keypoints, { width: video.videoWidth, height: video.videoHeight }),
        };
      }
    } catch (error) {
      result = { ok: false, reason: "error", message: error?.message || String(error) };
    }
    busy = false;
    if (stopped) return;
    onFrame({ ...result, timestamp: performance.now(), detectMs: performance.now() - started });
    schedule();
  };

  schedule();
  return () => {
    stopped = true;
    if (handle !== null) cancelAnimationFrame(handle);
  };
}
