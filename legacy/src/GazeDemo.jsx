// src/GazeDemo.jsx

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";

import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";

import {
  extractGazeFeatures,
  GAZE_FEATURE_COUNT,
  GAZE_FEATURE_VERSION,
  hasValidGazeLandmarks,
} from "./gaze/featureExtractor";
import { GAZE_OUTPUT_COUNT } from "./gaze/gazeModel";
import {
  ACTION_TARGET_COUNT,
  GAZE_MODEL_VERSION,
  LETTER_TARGET_COUNT,
  SAMPLES_PER_TARGET,
  TOTAL_CALIBRATION_TARGET_COUNT,
} from "./gaze/calibrationConfig";
import {
  KEYBOARD_LAYOUT,
  createLetterTargets,
  createAlertTarget,
  createSpaceTarget,
} from "./gaze/keyboardLayout";

// ============================================================
// GAZESPEAK
// 26-LETTER GAZE KEYBOARD
// ============================================================

// ------------------------------------------------------------
// LETTERS
// ------------------------------------------------------------

// ============================================================
// KEYBOARD
// ============================================================

// ============================================================
// GAZE SETTINGS
// ============================================================

// Prediction frequency
const DETECTION_INTERVAL = 70;

// EMA smoothing.
// Higher = faster response.
// Lower = smoother.
const SMOOTH_ALPHA = 0.32;

// Recent target predictions.
const VOTE_WINDOW = 7;

// Required votes for a stable candidate.
const REQUIRED_VOTES = 5;

// Time required to select.
const DWELL_TIME = 900;
const TARGET_TEST_TRIALS = 10;
const TARGET_TEST_TIMEOUT_MS = 10000;

// After selecting a key, it must be left before
// the same key can be selected again.
const REARM_DISTANCE = 0.055;

// Maximum normalized distance allowed from a key.
const MAX_KEY_DISTANCE = 0.13;

// Small hysteresis to prevent neighboring-key jumping.
const HYSTERESIS_DISTANCE = 0.035;

// ============================================================
// HELPERS
// ============================================================

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;

  return Math.sqrt(
    dx * dx +
    dy * dy
  );
}

function shuffleItems(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const otherIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }
  return shuffled;
}

function monotonicNow() {
  return performance.now();
}

// ============================================================
// COMPONENT
// ============================================================

export default function GazeDemo({ onBack }) {

  // ==========================================================
  // REFS
  // ==========================================================

  const videoRef =
    useRef(null);

  const frameCanvasRef =
    useRef(null);

  const detectorRef =
    useRef(null);

  const modelRef =
    useRef(null);

  const streamRef =
    useRef(null);

  const timerRef =
    useRef(null);

  const selectionTimerRef = useRef(null);

  const alertTimerRef = useRef(null);

  const testTimeoutRef =
    useRef(null);

  const targetTestRef =
    useRef(null);

  const runningRef =
    useRef(false);

  const detectingRef =
    useRef(false);

  // ==========================================================
  // GAZE REFS
  // ==========================================================

  const smoothedRef =
    useRef(null);

  const voteHistoryRef =
    useRef([]);

  const candidateRef =
    useRef(null);

  const candidateStartRef =
    useRef(0);

  const lockedKeyRef =
    useRef(null);

  const lastPredictionRef =
    useRef(null);

  const lastVideoTimeRef = useRef(-1);

  const stalledFrameChecksRef = useRef(0);

  // ==========================================================
  // STATE
  // ==========================================================

  const [
    status,
    setStatus,
  ] = useState(
    "Starting system..."
  );

  const [
    faceDetected,
    setFaceDetected,
  ] = useState(false);

  const [
    predictedPosition,
    setPredictedPosition,
  ] = useState(null);

  const [
    candidateKey,
    setCandidateKey,
  ] = useState(null);

  const [
    selectedKey,
    setSelectedKey,
  ] = useState(null);

  const [
    dwellProgress,
    setDwellProgress,
  ] = useState(0);

  const [
    voteCount,
    setVoteCount,
  ] = useState(0);

  const [
    text,
    setText,
  ] = useState("");

  const [
    speaking,
    setSpeaking,
  ] = useState(false);

  const [targetTest, setTargetTest] = useState(null);
  const [targetTestSummary, setTargetTestSummary] = useState(null);
  const [modelReady, setModelReady] = useState(false);
  const [alertNotice, setAlertNotice] = useState("");

  // ==========================================================
  // TARGETS
  // ==========================================================

  const letterTargets =
    useMemo(
      () =>
        createLetterTargets(),
      []
    );

  const spaceTarget =
    useMemo(
      () =>
        createSpaceTarget(),
      []
    );

  const alertTarget =
    useMemo(
      () => createAlertTarget(),
      []
    );

  const allTargets =
    useMemo(
      () => [
        ...letterTargets,
        spaceTarget,
        alertTarget,
      ],
      [
        letterTargets,
        spaceTarget,
        alertTarget,
      ]
    );

  const finishTestTrial = (success, selectedId = null) => {
    const activeTest = targetTestRef.current;
    if (!activeTest) {
      return;
    }

    window.clearTimeout(testTimeoutRef.current);
    const expected = activeTest.targets[activeTest.index];
    const trial = {
      target: expected.id,
      selected: selectedId,
      success,
      missed: !success,
      falseSelections: activeTest.falseSelections,
      selectionTimeMs: success ? monotonicNow() - activeTest.startedAt : null,
      repeated: activeTest.index > 0 && expected.id === activeTest.targets[activeTest.index - 1].id,
    };
    const results = [...activeTest.results, trial];

    if (activeTest.index + 1 >= activeTest.targets.length) {
      targetTestRef.current = null;
      setTargetTest(null);
      setTargetTestSummary(results);
      return;
    }

    const nextTest = {
      ...activeTest,
      index: activeTest.index + 1,
      results,
      falseSelections: 0,
      startedAt: monotonicNow(),
    };
    targetTestRef.current = nextTest;
    setTargetTest(nextTest);
    testTimeoutRef.current = window.setTimeout(
      () => finishTestTrial(false),
      TARGET_TEST_TIMEOUT_MS
    );
  };

  const startTargetTest = () => {
    const randomizedTargets = shuffleItems(letterTargets).slice(0, TARGET_TEST_TRIALS);
    if (randomizedTargets.length > 5) {
      randomizedTargets[5] = randomizedTargets[4];
    }

    const nextTest = {
      targets: randomizedTargets,
      index: 0,
      results: [],
      falseSelections: 0,
      startedAt: monotonicNow(),
    };

    window.clearTimeout(testTimeoutRef.current);
    targetTestRef.current = nextTest;
    setTargetTest(nextTest);
    setTargetTestSummary(null);
    lockedKeyRef.current = null;
    voteHistoryRef.current = [];
    candidateRef.current = null;
    setCandidateKey(null);
    setVoteCount(0);
    setDwellProgress(0);
    testTimeoutRef.current = window.setTimeout(
      () => finishTestTrial(false),
      TARGET_TEST_TIMEOUT_MS
    );
  };

  const cancelTargetTest = () => {
    window.clearTimeout(testTimeoutRef.current);
    targetTestRef.current = null;
    setTargetTest(null);
    voteHistoryRef.current = [];
    candidateRef.current = null;
    setCandidateKey(null);
    setVoteCount(0);
    setDwellProgress(0);
  };

  // ==========================================================
  // SELECT KEY
  // ==========================================================

  const selectKey = (
    target
  ) => {

    if (!target) {
      return;
    }

    if (targetTestRef.current) {
      const activeTest = targetTestRef.current;
      const expected = activeTest.targets[activeTest.index];
      const correct = target.id === expected.id;
      const updatedTest = {
        ...activeTest,
        falseSelections: activeTest.falseSelections + (correct ? 0 : 1),
      };

      targetTestRef.current = updatedTest;
      setTargetTest(updatedTest);
      lockedKeyRef.current = target.id;
      voteHistoryRef.current = [];
      candidateRef.current = null;
      setCandidateKey(null);
      setVoteCount(0);
      setDwellProgress(0);

      if (correct) {
        finishTestTrial(true, target.id);
      }
      return;
    }

    // --------------------------------------------------------
    // SPACE
    // --------------------------------------------------------

    if (
      target.type ===
      "space"
    ) {
      setText(
        (previous) =>
          previous + " "
      );
    }

    else if (target.type === "alert") {
      const notice = "Demo alert activated locally. No emergency service was contacted.";
      setAlertNotice(notice);
      setText("I need help");
      window.clearTimeout(alertTimerRef.current);
      alertTimerRef.current = window.setTimeout(() => setAlertNotice(""), 5000);
    }

    // --------------------------------------------------------
    // LETTER
    // --------------------------------------------------------

    else {
      setText(
        (previous) =>
          previous +
          target.label
      );
    }

    setSelectedKey(
      target.id
    );

    lockedKeyRef.current =
      target.id;

    console.log(
      `GAZE → Selected: ${target.label}`
    );

    // Reset gaze selection state.
    voteHistoryRef.current = [];

    candidateRef.current =
      null;

    candidateStartRef.current =
      0;

    setCandidateKey(null);

    setVoteCount(0);

    setDwellProgress(0);

    // --------------------------------------------------------
    // Unlock after the user looks away.
    // --------------------------------------------------------

    window.clearTimeout(selectionTimerRef.current);
    selectionTimerRef.current = window.setTimeout(() => {
      if (
        lockedKeyRef.current ===
        target.id
      ) {
        setSelectedKey(null);
      }
    }, 400);
  };

  // ==========================================================
  // FIND TARGET
  // ==========================================================

  const findTarget = (
    gaze
  ) => {

    if (!gaze) {
      return null;
    }

    let best =
      null;

    let bestDistance =
      Infinity;

    // --------------------------------------------------------
    // Find nearest target.
    // --------------------------------------------------------

    for (
      const target of
      allTargets
    ) {

      const d =
        distance(
          gaze,
          {
            x:
              target.x /
              100,

            y:
              target.y /
              100,
          }
        );

      if (
        d <
        bestDistance
      ) {
        bestDistance =
          d;

        best =
          target;
      }
    }

    if (!best) {
      return null;
    }

    // --------------------------------------------------------
    // Don't select keys that are too far away.
    // --------------------------------------------------------

    if (
      bestDistance >
      MAX_KEY_DISTANCE
    ) {
      return null;
    }

    // --------------------------------------------------------
    // HYSTERESIS
    // --------------------------------------------------------

    const current =
      candidateRef.current;

    if (
      current &&
      current.id !==
        best.id
    ) {

      const currentDistance =
        distance(
          gaze,
          {
            x:
              current.x /
              100,

            y:
              current.y /
              100,
          }
        );

      // Keep current candidate while
      // gaze remains reasonably close.
      if (
        currentDistance <
        bestDistance +
          HYSTERESIS_DISTANCE
      ) {
        return current;
      }
    }

    return best;
  };

  // ==========================================================
  // STABILITY VOTING
  // ==========================================================

  const updateSelection =
    (target) => {

      const lockedTarget = allTargets.find(
        (item) => item.id === lockedKeyRef.current
      );

      if (lockedTarget && lastPredictionRef.current) {
        const distanceFromLocked = distance(
          lastPredictionRef.current,
          { x: lockedTarget.x / 100, y: lockedTarget.y / 100 }
        );

        if (distanceFromLocked > REARM_DISTANCE) {
          lockedKeyRef.current = null;
        }
      }

      if (!target) {

        voteHistoryRef.current =
          [];

        setVoteCount(0);

        candidateRef.current =
          null;

        candidateStartRef.current =
          0;

        setCandidateKey(null);

        setDwellProgress(0);

        return;
      }

      if (lockedKeyRef.current === target.id) {
        setCandidateKey(target.id);
        setVoteCount(0);
        setDwellProgress(0);
        return;
      }

      // ------------------------------------------------------
      // ADD VOTE
      // ------------------------------------------------------

      voteHistoryRef.current.push(
        target.id
      );

      if (
        voteHistoryRef.current
          .length >
        VOTE_WINDOW
      ) {
        voteHistoryRef.current.shift();
      }

      const votes =
        voteHistoryRef.current;

      const count =
        votes.filter(
          (id) =>
            id ===
            target.id
        ).length;

      setVoteCount(count);

      // ------------------------------------------------------
      // CHANGE CANDIDATE
      // ------------------------------------------------------

      if (
        candidateRef.current?.id !==
        target.id
      ) {

        candidateRef.current =
          target;

        candidateStartRef.current =
          performance.now();

        setCandidateKey(
          target.id
        );

        setDwellProgress(
          0
        );

        return;
      }

      // ------------------------------------------------------
      // NOT ENOUGH VOTES
      // ------------------------------------------------------

      if (
        count <
        REQUIRED_VOTES
      ) {

        setDwellProgress(
          0
        );

        return;
      }

      // ------------------------------------------------------
      // DWELL
      // ------------------------------------------------------

      const now =
        performance.now();

      const elapsed =
        now -
        candidateStartRef.current;

      const progress =
        clamp(
          elapsed /
            DWELL_TIME,
          0,
          1
        );

      setDwellProgress(
        progress
      );

      // ------------------------------------------------------
      // SELECT
      // ------------------------------------------------------

      if (
        elapsed >=
        DWELL_TIME
      ) {

        selectKey(
          target
        );
      }
    };

  // ==========================================================
  // PREDICT GAZE
  // ==========================================================

  const processFace =
    async (face) => {

      const keypoints =
        face?.keypoints;

      if (!hasValidGazeLandmarks(keypoints)) {
        return false;
      }

      // ------------------------------------------------------
      // Extract features
      // ------------------------------------------------------

      let features;

      try {

        features =
          extractGazeFeatures(
            keypoints
          );

      } catch (error) {

        console.error(
          "GAZE → Feature extraction error",
          error
        );

        return false;
      }

      if (
        !Array.isArray(
          features
        ) ||
        features.length !== GAZE_FEATURE_COUNT ||
        !features.every(Number.isFinite)
      ) {
        return false;
      }

      // ------------------------------------------------------
      // Model
      // ------------------------------------------------------

      const model =
        modelRef.current;

      if (!model) {
        return false;
      }

      let prediction;

      try {

        const input = tf.tensor2d([features], [1, features.length]);
        let output;
        try {
          output = model.predict(input);
          const tensor = Array.isArray(output) ? output[0] : output;
          const values = await tensor.data();
          prediction = [values[0], values[1]];
        } finally {
          input.dispose();
          if (Array.isArray(output)) {
            output.forEach((item) => item.dispose?.());
          } else {
            output?.dispose?.();
          }
        }

      } catch (error) {

        console.error(
          "GAZE → Model prediction error",
          error
        );

        return false;
      }

      if (
        !prediction ||
        !finite(prediction[0]) ||
        !finite(prediction[1])
      ) {
        return;
      }

      // ------------------------------------------------------
      // Normalize prediction
      // ------------------------------------------------------

      let x =
        prediction[0];

      let y =
        prediction[1];

      // Some models may output
      // values slightly outside 0..1.

      x =
        clamp(
          x,
          0,
          1
        );

      y =
        clamp(
          y,
          0,
          1
        );

      const raw = {
        x,
        y,
      };

      // ------------------------------------------------------
      // EMA
      // ------------------------------------------------------

      if (
        !smoothedRef.current
      ) {

        smoothedRef.current =
          raw;

      } else {

        smoothedRef.current = {
          x:
            smoothedRef.current.x *
              (1 -
                SMOOTH_ALPHA) +
            x *
              SMOOTH_ALPHA,

          y:
            smoothedRef.current.y *
              (1 -
                SMOOTH_ALPHA) +
            y *
              SMOOTH_ALPHA,
        };
      }

      const gaze =
        smoothedRef.current;

      lastPredictionRef.current =
        gaze;

      setPredictedPosition(
        gaze
      );

      // ------------------------------------------------------
      // TARGET
      // ------------------------------------------------------

      const target =
        findTarget(
          gaze
        );

      updateSelection(
        target
      );

      return true;
    };

  // ==========================================================
  // FACE DETECTION
  // ==========================================================

  const clearTracking = (message) => {
    setFaceDetected(false);
    setStatus(message);
    smoothedRef.current = null;
    lastPredictionRef.current = null;
    setPredictedPosition(null);
    updateSelection(null);
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
    if (!video || !detector || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      clearTracking("Waiting for live camera frames...");
      scheduleDetection();
      return;
    }

    if (video.paused || video.ended) {
      clearTracking(video.ended ? "Camera stream ended. Retry the camera." : "Camera video is paused. Waiting for frames...");
      scheduleDetection();
      return;
    }

    if (video.currentTime > lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      stalledFrameChecksRef.current = 0;
    } else if (++stalledFrameChecksRef.current >= 25) {
      clearTracking("Camera frames stopped advancing. Retry the camera.");
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

      if (!faces.length || !hasValidGazeLandmarks(faces[0]?.keypoints)) {
        clearTracking(faces.length ? "Face found, but required eye landmarks are invalid." : "Face lost - return to the camera.");
        return;
      }

      const processed = await processFace(faces[0]);
      if (!processed) {
        clearTracking("Gaze model could not use these landmarks. Center your face and keep both eyes visible.");
        return;
      }

      setFaceDetected(true);
      setStatus("Tracking gaze");
    } catch (error) {
      console.error("GAZE → Face detection error", error);
      clearTracking(`Detection error. Retrying: ${error?.message || String(error)}`);
    } finally {
      detectingRef.current = false;
      scheduleDetection();
    }
  };

  // ==========================================================
  // SCHEDULE
  // ==========================================================

  const scheduleDetection =
    () => {

      if (
        !runningRef.current
      ) {
        return;
      }

      if (
        timerRef.current
      ) {
        clearTimeout(
          timerRef.current
        );
      }

      timerRef.current =
        setTimeout(
          () => {
            detectFace();
          },
          DETECTION_INTERVAL
        );
    };

  // ==========================================================
  // START SYSTEM
  // ==========================================================

  useEffect(() => {

    let cancelled =
      false;

    const start =
      async () => {

        try {

          runningRef.current =
            true;

          // --------------------------------------------------
          // TensorFlow
          // --------------------------------------------------

          setStatus(
            "Starting TensorFlow..."
          );

          if (
            tf.getBackend() !==
            "webgl"
          ) {
            await tf.setBackend(
              "webgl"
            );
          }

          await tf.ready();

          if (cancelled) {
            return;
          }

          console.log(
            "GAZE → TensorFlow:",
            tf.getBackend()
          );

          // --------------------------------------------------
          // MODEL
          // --------------------------------------------------

          setStatus(
            "Loading gaze model..."
          );

          let model;

          try {
            model = await tf.loadLayersModel(
              "/models/gaze-model.json"
            );
          } catch (error) {
            throw new Error(
              `Could not load /models/gaze-model.json. Deploy both exported model files into public/models/. ${error?.message || String(error)}`
            );
          }

          if (cancelled) {

            model.dispose();

            return;
          }

          const inputShape = model.inputs?.[0]?.shape;
          const outputShape = model.outputs?.[0]?.shape;
          const inputFeatures = inputShape?.[inputShape.length - 1];
          const outputValues = outputShape?.[outputShape.length - 1];

          if (
            inputFeatures !== GAZE_FEATURE_COUNT ||
            outputValues !== GAZE_OUTPUT_COUNT
          ) {
            model.dispose();
            throw new Error(
              `Incompatible gaze model. Expected ${GAZE_FEATURE_COUNT} inputs and ${GAZE_OUTPUT_COUNT} outputs; received ${inputFeatures} and ${outputValues}.`
            );
          }

          const metadata = model.getUserDefinedMetadata?.();
          const matchingLayout =
            JSON.stringify(metadata?.keyboardLayout) === JSON.stringify(KEYBOARD_LAYOUT);

          if (
            metadata?.format !== "gazespeak-personalized-gaze-model" ||
            metadata?.modelVersion !== GAZE_MODEL_VERSION ||
            metadata?.featureVersion !== GAZE_FEATURE_VERSION ||
            metadata?.featureCount !== GAZE_FEATURE_COUNT ||
            metadata?.outputCount !== GAZE_OUTPUT_COUNT ||
            metadata?.targetCount !== TOTAL_CALIBRATION_TARGET_COUNT ||
            metadata?.letterTargetCount !== LETTER_TARGET_COUNT ||
            metadata?.actionTargetCount !== ACTION_TARGET_COUNT ||
            metadata?.samplesPerTarget !== SAMPLES_PER_TARGET ||
            !matchingLayout
          ) {
            model.dispose();
            throw new Error(
              "The deployed model is unverified or uses a different feature/layout contract. Recalibrate, train, export, and replace both model files in public/models/."
            );
          }

          modelRef.current =
            model;
          setModelReady(true);

          console.log(
            "GAZE → Model loaded"
          );

          console.log(
            "GAZE → Input shape:",
            model.inputs
              ?.map(
                (item) =>
                  item.shape
              )
          );

          console.log(
            "GAZE → Output shape:",
            model.outputs
              ?.map(
                (item) =>
                  item.shape
              )
          );

          // --------------------------------------------------
          // FACEMESH
          // --------------------------------------------------

          setStatus(
            "Loading FaceMesh..."
          );

          const detector =
            await faceLandmarksDetection.createDetector(
              faceLandmarksDetection
                .SupportedModels
                .MediaPipeFaceMesh,
              {
                runtime:
                  "tfjs",

                maxFaces:
                  1,

                refineLandmarks:
                  true,
              }
            );

          if (cancelled) {

            detector.dispose?.();

            return;
          }

          detectorRef.current =
            detector;

          console.log(
            "GAZE → FaceMesh loaded"
          );

          // --------------------------------------------------
          // CAMERA
          // --------------------------------------------------

          setStatus(
            "Requesting camera..."
          );

          if (
            !navigator
              .mediaDevices
              ?.getUserMedia
          ) {
            throw new Error(
              "Camera access is not supported."
            );
          }

          const stream =
            await navigator.mediaDevices
              .getUserMedia({
                video: {
                  width: {
                    ideal: 640,
                  },

                  height: {
                    ideal: 480,
                  },

                  facingMode:
                    "user",
                },

                audio: false,
              });

          if (cancelled) {

            stream
              .getTracks()
              .forEach(
                (track) =>
                  track.stop()
              );

            return;
          }

          streamRef.current =
            stream;

          const video =
            videoRef.current;

          if (!video) {
            throw new Error(
              "Video element not found."
            );
          }

          video.srcObject =
            stream;

          await new Promise(
            (resolve) => {

              if (
                video.readyState >=
                1
              ) {
                resolve();
              } else {
                video.onloadedmetadata =
                  resolve;
              }
            }
          );

          await video.play();

          setStatus(
            "Detecting face..."
          );

          console.log(
            "GAZE → Camera ready:",
            video.videoWidth,
            video.videoHeight
          );

          detectFace();

        } catch (error) {

          if (
            cancelled
          ) {
            return;
          }

          console.error(
            "GAZE → SYSTEM ERROR:",
            error
          );

          setStatus(
            `Error: ${
              error?.message ||
              String(error)
            }`
          );
        }
      };

    start();

    return () => {

      cancelled =
        true;

      runningRef.current =
        false;

      if (
        timerRef.current
      ) {
        clearTimeout(
          timerRef.current
        );
      }

      window.clearTimeout(testTimeoutRef.current);
      window.clearTimeout(selectionTimerRef.current);
      window.clearTimeout(alertTimerRef.current);
      targetTestRef.current = null;

      if (
        detectorRef.current
      ) {
        detectorRef.current.dispose?.();

        detectorRef.current =
          null;
      }

      if (
        modelRef.current
      ) {
        modelRef.current.dispose?.();

        modelRef.current =
          null;
      }

      if (
        streamRef.current
      ) {

        streamRef.current
          .getTracks()
          .forEach(
            (track) =>
              track.stop()
          );

        streamRef.current =
          null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

  }, []);

  // ==========================================================
  // CLEAR TEXT
  // ==========================================================

  const clearText =
    () => {

      setText("");

      setSelectedKey(
        null
      );
      setAlertNotice("");
    };

  const resetDemo = () => {
    clearText();
    cancelTargetTest();
    setTargetTestSummary(null);
    window.clearTimeout(alertTimerRef.current);
    lockedKeyRef.current = null;
    smoothedRef.current = null;
    voteHistoryRef.current = [];
    candidateRef.current = null;
    candidateStartRef.current = 0;
    setPredictedPosition(null);
    setCandidateKey(null);
    setVoteCount(0);
    setDwellProgress(0);
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  };

  const sendAlert = () => {
    setText("I need help");
    setAlertNotice("Demo alert activated locally. No emergency service was contacted.");
    window.clearTimeout(alertTimerRef.current);
    alertTimerRef.current = window.setTimeout(() => setAlertNotice(""), 5000);
  };

  // ==========================================================
  // BACKSPACE
  // ==========================================================

  const backspace =
    () => {

      setText(
        (previous) =>
          previous.slice(
            0,
            -1
          )
      );
    };

  // ==========================================================
  // SPEAK
  // ==========================================================

  const speak =
    () => {

      if (
        !text.trim()
      ) {
        return;
      }

      if (
        !window.speechSynthesis
      ) {
        return;
      }

      window.speechSynthesis.cancel();

      const utterance =
        new SpeechSynthesisUtterance(
          text
        );

      utterance.rate =
        0.9;

      utterance.pitch =
        1;

      utterance.onstart =
        () => {
          setSpeaking(
            true
          );
        };

      utterance.onend =
        () => {
          setSpeaking(
            false
          );
        };

      utterance.onerror =
        () => {
          setSpeaking(
            false
          );
        };

      window.speechSynthesis.speak(
        utterance
      );
    };

  // ==========================================================
  // KEYBOARD POSITION
  // ==========================================================

  const getKeyPosition =
    (target) => {

      if (
        target.type ===
        "space"
      ) {
        const space = KEYBOARD_LAYOUT.space;

        return {
          left: `${space.left}%`,
          width: `${space.width}%`,
          top: `${space.top}%`,
          height: `${space.height}%`,
        };
      }

      if (target.type === "alert") {
        const alert = KEYBOARD_LAYOUT.alert;
        return {
          left: `${alert.left}%`,
          width: `${alert.width}%`,
          top: `${alert.top}%`,
          height: `${alert.height}%`,
        };
      }

      const cellWidth =
        KEYBOARD_LAYOUT.width /
        KEYBOARD_LAYOUT.columns;

      const rowHeight =
        KEYBOARD_LAYOUT.height /
        KEYBOARD_LAYOUT.rows;

      return {
        left:
          `${
            KEYBOARD_LAYOUT.left +
            target.column *
              cellWidth
          }%`,

        top:
          `${
            KEYBOARD_LAYOUT.top +
            target.row *
              rowHeight
          }%`,

        width:
          `${cellWidth}%`,

        height:
          `${rowHeight}%`,
      };
    };

  const spacePosition = getKeyPosition(spaceTarget);
  const alertPosition = getKeyPosition(alertTarget);
  const targetTestMetrics = targetTestSummary
    ? (() => {
        const successes = targetTestSummary.filter((trial) => trial.success);
        const repeatedTrials = targetTestSummary.filter((trial) => trial.repeated);
        return {
          successCount: successes.length,
          falseSelections: targetTestSummary.reduce((total, trial) => total + trial.falseSelections, 0),
          missed: targetTestSummary.filter((trial) => trial.missed).length,
          meanSelectionTimeMs: successes.length
            ? successes.reduce((total, trial) => total + trial.selectionTimeMs, 0) / successes.length
            : null,
          repeatedSuccess: repeatedTrials.filter((trial) => trial.success).length,
          repeatedCount: repeatedTrials.length,
        };
      })()
    : null;

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div
      style={{
        position:
          "fixed",

        inset: 0,

        width: "100vw",

        height: "100vh",

        overflow:
          "hidden",

        background:
          "#080b12",

        color:
          "white",

        fontFamily:
          "Inter, system-ui, sans-serif",
      }}
    >

      {/* =====================================================
          CAMERA
      ====================================================== */}

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          position:
            "fixed",

          right:
            "14px",

          top:
            "14px",

          width:
            "150px",

          height:
            "112px",

          objectFit:
            "cover",

          borderRadius:
            "12px",

          border:
            "2px solid rgba(255,255,255,0.25)",

          zIndex: 100,

          background:
            "#000",

          transform:
            "scaleX(-1)",
        }}
      />

      <button
        onClick={onBack}
        style={{
          position: "fixed",
          left: 14,
          top: 14,
          zIndex: 110,
          padding: "8px 12px",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 8,
          background: "rgba(0,0,0,0.7)",
          color: "white",
          cursor: "pointer",
        }}
      >
        Home
      </button>

      {/* =====================================================
          HEADER
      ====================================================== */}

      <div
        style={{
          position:
            "fixed",

          left:
            "50%",

          top:
            "12px",

          transform:
            "translateX(-50%)",

          zIndex: 90,

          textAlign:
            "center",

          pointerEvents:
            "none",
        }}
      >

        <div
          style={{
            fontSize:
              "14px",

            fontWeight:
              700,

            letterSpacing:
              "0.08em",

            textTransform:
              "uppercase",

            opacity:
              0.9,
          }}
        >
          GazeSpeak
        </div>

        <div
          style={{
            fontSize:
              "12px",

            opacity:
              0.55,

            marginTop:
              "3px",
          }}
        >
          {status}
        </div>
      </div>

      {alertNotice && (
        <div
          role="status"
          style={{
            position: "fixed",
            left: "50%",
            top: "22%",
            transform: "translateX(-50%)",
            zIndex: 280,
            width: "min(520px, 88vw)",
            padding: "12px 16px",
            border: "1px solid rgba(248,113,113,0.7)",
            borderRadius: 8,
            background: "rgba(70,15,15,0.94)",
            color: "white",
            textAlign: "center",
          }}
        >
          {alertNotice}
        </div>
      )}

      {targetTest && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            top: "17%",
            transform: "translateX(-50%)",
            zIndex: 260,
            padding: "12px 20px",
            borderRadius: 10,
            background: "rgba(0,0,0,0.82)",
            border: "1px solid rgba(255,255,255,0.2)",
            textAlign: "center",
          }}
        >
          <div>Test target {targetTest.index + 1} / {targetTest.targets.length}</div>
          <div style={{ marginTop: 4, fontSize: 24, fontWeight: 800 }}>
            Look at {targetTest.targets[targetTest.index].label}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
            Time limit: 10 seconds per target
          </div>
        </div>
      )}

      {targetTestMetrics && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            top: "17%",
            transform: "translateX(-50%)",
            zIndex: 260,
            width: "min(420px, 84vw)",
            padding: "16px 20px",
            borderRadius: 10,
            background: "rgba(0,0,0,0.9)",
            border: "1px solid rgba(255,255,255,0.2)",
          }}
        >
          <div style={{ fontWeight: 800 }}>Live target test results</div>
          <div>Correct selections: {targetTestMetrics.successCount} / {targetTestSummary.length}</div>
          <div>False selections: {targetTestMetrics.falseSelections}</div>
          <div>Missed targets: {targetTestMetrics.missed}</div>
          <div>
            Mean selection time: {targetTestMetrics.meanSelectionTimeMs === null
              ? "not available"
              : `${(targetTestMetrics.meanSelectionTimeMs / 1000).toFixed(2)} seconds`}
          </div>
          <div>Repeated-letter success: {targetTestMetrics.repeatedSuccess} / {targetTestMetrics.repeatedCount}</div>
          <button onClick={() => setTargetTestSummary(null)} style={{ marginTop: 8 }}>Dismiss</button>
        </div>
      )}

      {/* =====================================================
          TEXT DISPLAY
      ====================================================== */}

      <div
        style={{
          position:
            "fixed",

          left:
            "3%",

          right:
            "3%",

          top:
            "5%",

          height:
            "10%",

          zIndex:
            50,

          display:
            "flex",

          alignItems:
            "center",

          justifyContent:
            "center",

          pointerEvents:
            "none",
        }}
      >

        <div
          style={{
            width:
              "100%",

            maxWidth:
              "1100px",

            minHeight:
              "54px",

            padding:
              "10px 18px",

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "center",

            textAlign:
              "center",

            borderRadius:
              "16px",

            background:
              "rgba(255,255,255,0.07)",

            border:
              "1px solid rgba(255,255,255,0.12)",

            fontSize:
              "clamp(20px, 3vw, 34px)",

            fontWeight:
              600,

            wordBreak:
              "break-word",
          }}
        >
          {text || (
            <span
              style={{
                opacity:
                  0.35,

                fontSize:
                  "0.65em",
              }}
            >
              Look at a key to type
            </span>
          )}
        </div>
      </div>

      {/* =====================================================
          GAZE CURSOR
      ====================================================== */}

      {predictedPosition && (
        <div
          style={{
            position:
              "fixed",

            left:
              `${predictedPosition.x * 100}%`,

            top:
              `${predictedPosition.y * 100}%`,

            width:
              "18px",

            height:
              "18px",

            borderRadius:
              "50%",

            background:
              "#00e5ff",

            border:
              "3px solid white",

            boxShadow:
              "0 0 20px rgba(0,229,255,0.9)",

            transform:
              "translate(-50%, -50%)",

            zIndex:
              200,

            pointerEvents:
              "none",
          }}
        />
      )}

      {/* =====================================================
          KEYBOARD
      ====================================================== */}

      <div
        style={{
          position:
            "fixed",

          inset:
            0,

          zIndex:
            20,
        }}
      >

        {letterTargets.map(
          (target) => {

            const position =
              getKeyPosition(
                target
              );

            const isCandidate =
              candidateKey ===
              target.id;

            const isSelected =
              selectedKey ===
              target.id;

            return (
              <button
                type="button"
                key={target.id}
                onClick={() => selectKey(target)}
                aria-label={`Select letter ${target.label}`}
                style={{
                  color: "inherit",
                  border: 0,
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "inherit",
                  position:
                    "absolute",

                  left:
                    position.left,

                  top:
                    position.top,

                  width:
                    position.width,

                  height:
                    position.height,

                  padding:
                    "4px",

                  boxSizing:
                    "border-box",
                }}
              >

                <div
                  style={{
                    width:
                      "100%",

                    height:
                      "100%",

                    borderRadius:
                      "12px",

                    display:
                      "flex",

                    alignItems:
                      "center",

                    justifyContent:
                      "center",

                    fontSize:
                      "clamp(20px, 3.2vw, 38px)",

                    fontWeight:
                      800,

                    background:
                      isSelected
                        ? "rgba(0,229,255,0.8)"
                        : isCandidate
                        ? "rgba(255,60,60,0.75)"
                        : "rgba(255,255,255,0.055)",

                    border:
                      isCandidate
                        ? "3px solid #ff3b3b"
                        : "1px solid rgba(255,255,255,0.12)",

                    boxShadow:
                      isCandidate
                        ? "0 0 30px rgba(255,50,50,0.45)"
                        : "none",

                    transition:
                      "all 80ms linear",

                    position:
                      "relative",
                  }}
                >

                  {target.label}

                  {/* DWELL BAR */}

                  {isCandidate && (
                    <div
                      style={{
                        position:
                          "absolute",

                        left:
                          "8%",

                        right:
                          "8%",

                        bottom:
                          "7px",

                        height:
                          "4px",

                        borderRadius:
                          "10px",

                        background:
                          "rgba(255,255,255,0.15)",

                        overflow:
                          "hidden",
                      }}
                    >

                      <div
                        style={{
                          width:
                            `${
                              dwellProgress *
                              100
                            }%`,

                          height:
                            "100%",

                          background:
                            "#ff3b3b",

                          transition:
                            "width 50ms linear",
                        }}
                      />

                    </div>
                  )}

                </div>

              </button>
            );
          }
        )}

        {/* ===================================================
            SPACE
        ==================================================== */}

        <button
          type="button"
          onClick={() => selectKey(spaceTarget)}
          aria-label="Insert a space"
          style={{
            color: "inherit",
            border: 0,
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            textAlign: "inherit",
            position:
              "absolute",

            left: spacePosition.left,

            top: spacePosition.top,

            width: spacePosition.width,

            height: spacePosition.height,

            padding:
              "4px",

            boxSizing:
              "border-box",
          }}
        >

          <div
            style={{
              width:
                "100%",

              height:
                "100%",

              borderRadius:
                "14px",

              display:
                "flex",

              alignItems:
                "center",

              justifyContent:
                "center",

              background:
                selectedKey === "SPACE"
                  ? "rgba(0,229,255,0.8)"
                  : candidateKey ===
                "SPACE"
                  ? "rgba(255,60,60,0.75)"
                  : "rgba(255,255,255,0.07)",

              border:
                candidateKey ===
                "SPACE"
                  ? "3px solid #ff3b3b"
                  : "1px solid rgba(255,255,255,0.15)",

              fontSize:
                "clamp(16px, 2vw, 25px)",

              fontWeight:
                700,

              letterSpacing:
                "0.1em",
            }}
          >
            SPACE

            {candidateKey ===
              "SPACE" && (
              <div
                style={{
                  position:
                    "absolute",

                  left:
                    "25%",

                  right:
                    "25%",

                  marginTop:
                    "45px",

                  height:
                    "4px",

                  background:
                    "rgba(255,255,255,0.15)",

                  borderRadius:
                    "10px",

                  overflow:
                    "hidden",
                }}
              >
                <div
                  style={{
                    width:
                      `${
                        dwellProgress *
                        100
                      }%`,

                    height:
                      "100%",

                    background:
                      "#ff3b3b",
                  }}
                />
              </div>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={() => selectKey(alertTarget)}
          aria-label="Activate local demo alert"
          style={{
            position: "absolute",
            left: alertPosition.left,
            top: alertPosition.top,
            width: alertPosition.width,
            height: alertPosition.height,
            padding: 4,
            boxSizing: "border-box",
            border: candidateKey === "ALERT" ? "3px solid #ff3b3b" : "1px solid rgba(248,113,113,0.65)",
            borderRadius: 10,
            background: selectedKey === "ALERT" ? "rgba(0,229,255,0.8)" : candidateKey === "ALERT" ? "rgba(127,29,29,0.92)" : "rgba(127,29,29,0.68)",
            color: "white",
            cursor: "pointer",
            fontSize: "clamp(12px, 1.5vw, 20px)",
            fontWeight: 800,
          }}
        >
          ALERT
        </button>
      </div>

      {/* =====================================================
          CONTROLS
      ====================================================== */}

      <div
        style={{
          position:
            "fixed",

          left:
            "50%",

          bottom:
            "1.5%",

          transform:
            "translateX(-50%)",

          zIndex:
            300,

          display:
            "flex",

          gap:
            "8px",

          alignItems:
            "center",

          justifyContent:
            "center",

          flexWrap:
            "wrap",
        }}
      >

        <button
          onClick={sendAlert}
          style={{
            padding: "9px 15px",
            border: "1px solid rgba(248,113,113,0.55)",
            borderRadius: "10px",
            background: "rgba(127,29,29,0.72)",
            color: "white",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Alert (demo only)
        </button>

        <button
          onClick={
            backspace
          }
          style={{
            padding:
              "9px 15px",

            border:
              "1px solid rgba(255,255,255,0.15)",

            borderRadius:
              "10px",

            background:
              "rgba(0,0,0,0.65)",

            color:
              "white",

            cursor:
              "pointer",

            fontWeight:
              700,
          }}
        >
          ⌫
        </button>

        <button
          onClick={
            clearText
          }
          style={{
            padding:
              "9px 15px",

            border:
              "1px solid rgba(255,255,255,0.15)",

            borderRadius:
              "10px",

            background:
              "rgba(0,0,0,0.65)",

            color:
              "white",

            cursor:
              "pointer",

            fontWeight:
              700,
          }}
        >
          Clear
        </button>

        <button
          onClick={resetDemo}
          style={{
            padding: "9px 15px",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "10px",
            background: "rgba(0,0,0,0.65)",
            color: "white",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Reset
        </button>

        <button
          onClick={targetTest ? cancelTargetTest : startTargetTest}
          disabled={!modelReady}
          style={{
            padding: "9px 15px",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: "10px",
            background: modelReady ? "rgba(0,0,0,0.65)" : "#444",
            color: "white",
            cursor: modelReady ? "pointer" : "not-allowed",
            fontWeight: 700,
          }}
        >
          {targetTest ? "Cancel test" : "Run 10-target test"}
        </button>

        <button
          onClick={
            speak
          }
          disabled={
            speaking ||
            !text.trim()
          }
          style={{
            padding:
              "9px 18px",

            border:
              "none",

            borderRadius:
              "10px",

            background:
              speaking
                ? "#555"
                : "#00a8c7",

            color:
              "white",

            cursor:
              "pointer",

            fontWeight:
              700,
          }}
        >
          {speaking
            ? "Speaking..."
            : "🔊 Speak"}
        </button>

      </div>

      {/* =====================================================
          DEBUG INFO
      ====================================================== */}

      <div
        style={{
          position:
            "fixed",

          left:
            "12px",

          bottom:
            "12px",

          zIndex:
            300,

          fontSize:
            "10px",

          opacity:
            0.35,

          pointerEvents:
            "none",
        }}
      >
        Face:{" "}
        {faceDetected
          ? "YES"
          : "NO"}
        {" • "}
        Candidate:{" "}
        {candidateKey ||
          "-"}
        {" • "}
        Votes:{" "}
        {voteCount}/
        {REQUIRED_VOTES}
        {" • "}
        Dwell:{" "}
        {Math.round(
          dwellProgress *
            100
        )}
        %
      </div>

    </div>
  );
}