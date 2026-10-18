import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useGazeTracker } from "../hooks/useGazeTracker.js";
import { EYE_OPENNESS_INDEX } from "../gaze/featureExtractor.js";
import {
  buildTargets,
  createCalibrationPlan,
  KEYBOARD_MODES,
  readViewport,
  rectToStyle,
  viewportChanged,
} from "../gaze/layout.js";
import {
  CALIBRATION_SETTINGS,
  isBlink,
  removeOutliers,
  trainFromCalibration,
} from "../gaze/calibrationData.js";
import { formatMs } from "../ui/format.js";

const { settleMs, minCollectMs, minSamples } = CALIBRATION_SETTINGS;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const LAYOUT_PREVIEW = buildTargets(KEYBOARD_MODES.direct);

export default function Calibration({ onCancel, onComplete }) {
  const plan = useMemo(() => createCalibrationPlan(), []);
  const trainCount = plan.filter((point) => point.pass === "train").length;

  // phase: intro | running | paused | invalid | training | error
  const [phase, setPhase] = useState("intro");
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState("settle");
  const [collected, setCollected] = useState(0);
  const [notice, setNotice] = useState("");
  const [trainingError, setTrainingError] = useState("");

  const phaseRef = useRef("intro");
  const indexRef = useRef(0);
  const stageRef = useRef({ name: "settle", startedAt: 0, frames: [] });
  const samplesRef = useRef([]);
  const opennessRef = useRef([]);
  const sessionRef = useRef(null);
  // Counts for the results page: how many frames were usable, and which points stayed unsteady.
  const qualityRef = useRef(null);

  const setPhaseBoth = useCallback((next) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const beginTarget = useCallback((targetIndex) => {
    indexRef.current = targetIndex;
    stageRef.current = { name: "settle", startedAt: performance.now(), frames: [], retries: 0 };
    setIndex(targetIndex);
    setStage("settle");
    setCollected(0);
  }, []);

  const finishSession = useCallback(() => {
    setPhaseBoth("training");
    const session = sessionRef.current;
    const finishedAt = performance.now();
    // Let the "Training…" state paint before the (short) synchronous fit.
    setTimeout(() => {
      try {
        const q = qualityRef.current;
        const seen = Math.max(1, q.frames);
        const tracked = Math.max(1, q.frames - q.lost);
        const quality = {
          frames: q.frames,
          lostShare: q.lost / seen,
          rejectedShare: (q.blinks + q.outliers) / tracked,
          retries: q.retries,
          lowQualityPoints: q.lowPoints.length,
          lowQualityPointIds: q.lowPoints,
        };
        const result = trainFromCalibration({
          quality,
          samples: samplesRef.current,
          viewport: session.viewport,
          startedAt: session.startedAtIso,
          durationMs: finishedAt - session.startedAt,
        });
        onComplete({
          ...result,
          timings: {
            calibrationMs: finishedAt - session.startedAt,
            pausedMs: session.pausedMs,
            trainingMs: result.trainingMs,
          },
        });
      } catch (error) {
        setTrainingError(error?.message || String(error));
        setPhaseBoth("error");
      }
    }, 30);
  }, [onComplete, setPhaseBoth]);

  const completeTarget = useCallback(() => {
    const stageState = stageRef.current;
    const cleaned = removeOutliers(stageState.frames);
    const quality = qualityRef.current;
    quality.outliers += stageState.frames.length - cleaned.length;
    const unsteady = cleaned.length < Math.ceil(minSamples * 0.6);
    if (unsteady && stageState.retries < 2) {
      // Too many frames disagreed (eyes wandered): collect this point again.
      quality.retries += 1;
      stageRef.current = { name: "collect", startedAt: performance.now(), frames: [], retries: stageState.retries + 1 };
      setCollected(0);
      setNotice("Keep looking at the center of the dot.");
      return;
    }
    const target = plan[indexRef.current];
    if (unsteady) quality.lowPoints.push(target.id);
    for (const frame of cleaned) {
      samplesRef.current.push({
        features: frame.features,
        target: { x: target.x, y: target.y },
        group: target.id,
        pass: target.pass,
        t: frame.t,
      });
    }
    setNotice("");
    if (indexRef.current + 1 >= plan.length) {
      finishSession();
    } else {
      beginTarget(indexRef.current + 1);
    }
  }, [beginTarget, finishSession, plan]);

  const onFrame = useCallback((frame) => {
    if (phaseRef.current !== "running") return;
    const now = frame.timestamp;
    const capturedAt = frame.timestamp - frame.detectMs;
    const stageState = stageRef.current;

    if (stageState.name === "settle") {
      if (now - stageState.startedAt >= settleMs) {
        stageRef.current = { ...stageState, name: "collect", startedAt: now, frames: [] };
        setStage("collect");
      }
      return;
    }

    // Collect: only frames captured after this collection window opened, so
    // nothing from before a pause or from the previous target can leak in.
    if (capturedAt >= stageState.startedAt) {
      qualityRef.current.frames += 1;
      if (!frame.ok) qualityRef.current.lost += 1;
    }
    if (frame.ok && capturedAt >= stageState.startedAt) {
      const openness = frame.features[EYE_OPENNESS_INDEX];
      const recent = opennessRef.current;
      const baseline = recent.length >= 10 ? median(recent) : NaN;
      recent.push(openness);
      if (recent.length > 90) recent.shift();
      if (isBlink(frame.features, baseline)) {
        qualityRef.current.blinks += 1;
      } else {
        stageState.frames.push({ features: frame.features, t: capturedAt - sessionRef.current.startedAt });
        setCollected(stageState.frames.length);
      }
    }
    if (stageState.frames.length >= minSamples && now - stageState.startedAt >= minCollectMs) {
      completeTarget();
    }
  }, [completeTarget]);

  const { videoRef, ...tracker } = useGazeTracker(onFrame);

  const start = useCallback(() => {
    samplesRef.current = [];
    opennessRef.current = [];
    qualityRef.current = { frames: 0, lost: 0, blinks: 0, outliers: 0, retries: 0, lowPoints: [] };
    sessionRef.current = {
      viewport: readViewport(),
      startedAt: performance.now(),
      startedAtIso: new Date().toISOString(),
      pausedMs: 0,
      pausedAt: null,
    };
    setNotice("");
    beginTarget(0);
    setPhaseBoth("running");
  }, [beginTarget, setPhaseBoth]);

  const pause = useCallback(() => {
    if (phaseRef.current !== "running") return;
    sessionRef.current.pausedAt = performance.now();
    // Partial samples of the current point are discarded; completed points are kept.
    stageRef.current = { ...stageRef.current, frames: [] };
    setCollected(0);
    setPhaseBoth("paused");
  }, [setPhaseBoth]);

  const resume = useCallback(() => {
    if (phaseRef.current !== "paused") return;
    const session = sessionRef.current;
    if (session.pausedAt !== null) {
      session.pausedMs += performance.now() - session.pausedAt;
      session.pausedAt = null;
    }
    beginTarget(indexRef.current); // restart the current point with a fresh settle period
    setPhaseBoth("running");
  }, [beginTarget, setPhaseBoth]);

  const togglePause = useCallback(() => {
    if (phaseRef.current === "running") pause();
    else if (phaseRef.current === "paused") resume();
  }, [pause, resume]);

  // Space: start / pause / resume. Handled in the capture phase and suppressed
  // on keyup too, so it never activates a focused button or scrolls the page.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code !== "Space" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (phaseRef.current === "intro") {
        if (tracker.phase === "ready") start();
      } else if (phaseRef.current === "running" || tracker.phase === "ready") {
        togglePause(); // resuming needs a working camera
      }
    };
    const onKeyUp = (event) => {
      if (event.code === "Space" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [start, togglePause, tracker.phase]);

  // A camera failure mid-session pauses (completed points are kept).
  useEffect(() => {
    if (tracker.phase === "error") pause();
  }, [tracker.phase, pause]);

  // Leaving the tab/window pauses; a different screen size invalidates the session.
  useEffect(() => {
    const onBlur = () => pause();
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    const onResize = () => {
      const session = sessionRef.current;
      if (!session || !["running", "paused"].includes(phaseRef.current)) return;
      if (viewportChanged(readViewport(), session.viewport, 0.01)) {
        setPhaseBoth("invalid");
      }
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
    };
  }, [pause, setPhaseBoth]);

  const target = plan[index];
  const showPreview = phase !== "running";
  const isValidationPass = target.pass === "validation";
  const hudAtBottom = target.y < 0.35;
  const faceProblem = tracker.phase === "ready" && tracker.face !== "ok";

  return (
    <div className="stage calibration">
      {(phase === "intro" || phase === "invalid") && (
        <div className="layout-ghost" aria-hidden="true">
          {LAYOUT_PREVIEW.map((key) => <div key={key.id} className="layout-ghost__key" style={rectToStyle(key.rect)} />)}
        </div>
      )}

      {(phase === "running" || phase === "paused") && (
        <>
          <div
            className={`cal-dot cal-dot--${stage}${phase === "paused" ? " cal-dot--paused" : ""}`}
            style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%`, "--settle-ms": `${settleMs}ms` }}
            key={`${index}-${phase}`}
            aria-hidden="true"
          >
            <svg className="cal-dot__progress" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="21" pathLength="1" style={{ strokeDashoffset: 1 - Math.min(1, collected / minSamples) }} />
            </svg>
            <span className="cal-dot__core" />
          </div>
          {phase === "running" && faceProblem && (
            <div className="cal-face-warning" style={{ left: `${Math.min(80, Math.max(20, target.x * 100))}%`, top: `${target.y > 0.5 ? target.y * 100 - 14 : target.y * 100 + 10}%` }} role="status">
              {tracker.faceMessage}
            </div>
          )}
          {phase === "running" && (
            <div className={`cal-hud ${hudAtBottom ? "cal-hud--bottom" : "cal-hud--top"}`}>
              <span>{isValidationPass ? `Check point ${index - trainCount + 1} of ${plan.length - trainCount}` : `Learning point ${index + 1} of ${trainCount}`}</span>
              <span className="cal-hud__sep">·</span>
              <span className={`cal-hud__track ${faceProblem ? "cal-hud__track--bad" : "cal-hud__track--ok"}`} role="status">
                {faceProblem ? "Face lost: these frames do not count" : "Face tracked"}
              </span>
              <span className="cal-hud__sep">·</span>
              <span>{notice || (stage === "settle" ? "Look at the dot" : "Hold your gaze")}</span>
              <span className="cal-hud__sep">·</span>
              <span><kbd>Space</kbd> pause</span>
              <button type="button" className="btn btn--small" onClick={pause}>Pause</button>
            </div>
          )}
        </>
      )}

      <video ref={videoRef} className={`camera ${showPreview ? "camera--visible" : "camera--hidden"}`} muted playsInline />

      {phase === "intro" && (
        <div className="overlay">
          <div className="dialog">
            <h1 className="dialog__title">Calibration</h1>
            <ol className="list list--numbered">
              <li>A dot appears at {plan.length} positions. Look at its center until the ring fills — about 1.5 s per point.</li>
              <li>The first {trainCount} points teach the model; the last {plan.length - trainCount} check its accuracy at new positions.</li>
              <li>Keep your head still and move only your eyes. Blinking normally is fine. If you can, rest your head or arms: even a slow sinking of the head during the minute spoils the check.</li>
              <li>The dots jump around the screen in a mixed order on purpose. Follow each one with your eyes only.</li>
              <li>Press <kbd>Space</kbd> at any time to pause and rest. Progress is kept.</li>
            </ol>
            <TrackerStatus tracker={tracker} />
            <div className="toolbar-row toolbar-row--end">
              <button type="button" className="btn" onClick={onCancel}>Cancel</button>
              {tracker.phase === "error"
                ? <button type="button" className="btn btn--primary" onClick={tracker.retry}>Retry camera</button>
                : <button type="button" className="btn btn--primary" onClick={start} disabled={tracker.phase !== "ready"}>Start (Space)</button>}
            </div>
          </div>
        </div>
      )}

      {phase === "paused" && (
        <div className="overlay overlay--dim">
          <div className="dialog">
            <h1 className="dialog__title">Paused</h1>
            <p>
              {index} of {plan.length} points done. Rest, blink and adjust your posture. When you resume, the
              current point restarts with a short settling time.
            </p>
            <TrackerStatus tracker={tracker} />
            <div className="toolbar-row toolbar-row--end">
              <button type="button" className="btn" onClick={onCancel}>Exit calibration</button>
              <button type="button" className="btn" onClick={start}>Restart from the first point</button>
              {tracker.phase === "error"
                ? <button type="button" className="btn btn--primary" onClick={tracker.retry}>Retry camera</button>
                : <button type="button" className="btn btn--primary" onClick={resume} disabled={tracker.phase !== "ready"}>Resume (Space)</button>}
            </div>
          </div>
        </div>
      )}

      {phase === "invalid" && (
        <div className="overlay overlay--dim">
          <div className="dialog">
            <h1 className="dialog__title">Screen size changed</h1>
            <p>
              The browser window changed size (for example, full screen was turned on or off). Points
              recorded so far belong to the old screen area and cannot be mixed with new ones, so
              calibration has to start again at the current size.
            </p>
            <div className="toolbar-row toolbar-row--end">
              <button type="button" className="btn" onClick={onCancel}>Exit</button>
              <button type="button" className="btn btn--primary" onClick={start}>Restart calibration</button>
            </div>
          </div>
        </div>
      )}

      {phase === "training" && (
        <div className="overlay">
          <div className="dialog dialog--center" role="status">
            <div className="spinner" aria-hidden="true" />
            <p>Training and validating the model…</p>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="overlay overlay--dim">
          <div className="dialog">
            <h1 className="dialog__title">Training failed</h1>
            <p className="notice notice--danger">{trainingError}</p>
            <p>Your current model has not been changed.</p>
            <div className="toolbar-row toolbar-row--end">
              <button type="button" className="btn" onClick={onCancel}>Exit</button>
              <button type="button" className="btn btn--primary" onClick={start}>Calibrate again</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TrackerStatus({ tracker }) {
  if (tracker.phase === "loading") {
    return <p className="status-line"><span className="spinner spinner--inline" aria-hidden="true" /> {tracker.message}</p>;
  }
  if (tracker.phase === "error") {
    return <p className="notice notice--danger" role="alert">{tracker.message}</p>;
  }
  return (
    <p className={`status-line ${tracker.face === "ok" ? "status-line--ok" : "status-line--warn"}`} role="status">
      {tracker.faceMessage}
      {tracker.stats.fps > 0 && <span className="muted small"> · {tracker.stats.fps.toFixed(0)} fps · {formatMs(tracker.stats.detectMs)} per frame</span>}
    </p>
  );
}
