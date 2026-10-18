import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useGazeTracker } from "../hooks/useGazeTracker.js";
import { useViewport } from "../hooks/useViewport.js";
import { EYE_OPENNESS_INDEX } from "../gaze/featureExtractor.js";
import { predictRaw } from "../gaze/ridgeModel.js";
import { isBlink } from "../gaze/calibrationData.js";
import { createDwellSelector, PointFilter } from "../gaze/filters.js";
import {
  buildTargets,
  DIRECT_KEYS,
  hitTest,
  KEYBOARD_MODES,
  LETTER_GROUPS,
  REGIONS,
  rectToStyle,
  viewportChanged,
} from "../gaze/layout.js";
import { formatMs } from "../ui/format.js";
import { createGazeDebug, gazeDebugEnabled } from "../gaze/diagnostics.js";

const DWELL_OPTIONS = [600, 800, 1000, 1300, 1600];
const DEFAULT_DWELL_MS = 1000;
const FILTER_OPTIONS = { minCutoff: 0.8, beta: 2.5 };
const LOST_AFTER_MS = 400;
const RECENTER = { settleMs: 600, collectMs: 1500, maxOffset: 0.2 };
const TEST_TRIALS = 10;
const TEST_TIMEOUT_MS = 15000;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function beep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    [0, 0.35, 0.7].forEach((offset) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.15;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + offset);
      oscillator.stop(context.currentTime + offset + 0.2);
    });
    setTimeout(() => context.close(), 1500);
  } catch {
    // Audio is optional; the visual alert is always shown.
  }
}

function speak(text) {
  if (!window.speechSynthesis || !text.trim()) return false;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  return true;
}

export default function Demo({ modelDoc, onExit, onRecalibrate }) {
  const params = modelDoc.params;
  const viewport = useViewport();
  const calibratedViewport = modelDoc.calibration.viewport;
  const sizeMismatch = viewportChanged(viewport, calibratedViewport);

  const [mode, setMode] = useState(modelDoc.recommendedMode === KEYBOARD_MODES.direct ? KEYBOARD_MODES.direct : KEYBOARD_MODES.grouped);
  const [groupIndex, setGroupIndex] = useState(null);
  const [dwellMs, setDwellMs] = useState(DEFAULT_DWELL_MS);
  const [showCursor, setShowCursor] = useState(true);
  const [text, setText] = useState("");
  const [gaze, setGaze] = useState({ point: null, activeId: null, progress: 0, lost: true });
  const [flashId, setFlashId] = useState(null);
  const [alertOn, setAlertOn] = useState(false);
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [recenter, setRecenter] = useState(null); // { stage, startedAt, raws }
  const [test, setTest] = useState(null);
  const [testSummary, setTestSummary] = useState(null);

  const targets = useMemo(() => buildTargets(mode, mode === KEYBOARD_MODES.grouped ? groupIndex : null), [mode, groupIndex]);

  const targetsRef = useRef(targets);
  const selectorRef = useRef(createDwellSelector({ dwellMs: DEFAULT_DWELL_MS }));
  const filterRef = useRef(new PointFilter(FILTER_OPTIONS));
  const lastGoodRef = useRef(0);
  const opennessRef = useRef([]);
  const offsetRef = useRef(offset);
  const recenterRef = useRef(null);
  const debugRef = useRef(null);
  if (debugRef.current === null) debugRef.current = gazeDebugEnabled() ? createGazeDebug("classic", ".gaze-cursor") : false;
  useEffect(() => () => debugRef.current?.dispose?.(), []);
  const pausedRef = useRef(false);
  const testRef = useRef(null);
  const handleSelectRef = useRef(null);
  const flashTimerRef = useRef(null);
  const textPanelRef = useRef(null);

  useEffect(() => {
    targetsRef.current = targets;
    selectorRef.current.reset();
  }, [targets]);
  useEffect(() => selectorRef.current.setDwell(dwellMs), [dwellMs]);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);
  useEffect(() => {
    pausedRef.current = menuOpen || alertOn || Boolean(testSummary);
    if (pausedRef.current) selectorRef.current.reset();
  }, [menuOpen, alertOn, testSummary]);
  useEffect(() => {
    const panel = textPanelRef.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [text]);
  useEffect(() => () => {
    clearTimeout(flashTimerRef.current);
    window.speechSynthesis?.cancel();
  }, []);

  // -------------------------------------------------------------------------
  // Accuracy test
  // -------------------------------------------------------------------------

  const finishTrial = useCallback((success) => {
    const current = testRef.current;
    if (!current) return;
    const trial = {
      letter: current.letters[current.index],
      success,
      timeMs: success ? performance.now() - current.startedAt : null,
      falseSelections: current.falseSelections,
    };
    const results = [...current.results, trial];
    if (current.index + 1 >= current.letters.length) {
      testRef.current = null;
      setTest(null);
      const hits = results.filter((r) => r.success);
      setTestSummary({
        trials: results.length,
        hits: hits.length,
        medianTimeMs: hits.length ? median(hits.map((r) => r.timeMs)) : null,
        falseSelections: results.reduce((sum, r) => sum + r.falseSelections, 0),
        mode,
        dwellMs,
      });
      return;
    }
    const next = { ...current, index: current.index + 1, results, falseSelections: 0, startedAt: performance.now() };
    testRef.current = next;
    setTest(next);
  }, [mode, dwellMs]);

  useEffect(() => {
    if (!test) return undefined;
    const timer = setTimeout(() => finishTrial(false), TEST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [test, finishTrial]);

  const startTest = () => {
    const pool = DIRECT_KEYS.filter((key) => /[A-Z]/.test(key));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const letters = pool.slice(0, TEST_TRIALS);
    const next = { letters, index: 0, results: [], falseSelections: 0, startedAt: performance.now() };
    testRef.current = next;
    setTest(next);
    setTestSummary(null);
    setGroupIndex(null);
    setMenuOpen(false);
  };

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  const handleSelect = (target) => {
    clearTimeout(flashTimerRef.current);
    setFlashId(target.id);
    flashTimerRef.current = setTimeout(() => setFlashId(null), 350);

    const activeTest = testRef.current;
    if (activeTest) {
      const wanted = activeTest.letters[activeTest.index];
      if (target.kind === "group") {
        if (!LETTER_GROUPS[target.value].includes(wanted)) activeTest.falseSelections += 1;
        setGroupIndex(target.value);
      } else if (target.kind === "back") {
        setGroupIndex(null);
      } else if (target.kind === "letter" && target.value === wanted) {
        setGroupIndex(null);
        finishTrial(true);
      } else {
        activeTest.falseSelections += 1;
        if (target.kind === "letter") setGroupIndex(null);
      }
      return;
    }

    switch (target.kind) {
      case "letter":
        setText((previous) => previous + target.value);
        setGroupIndex(null);
        break;
      case "group":
        setGroupIndex(target.value);
        break;
      case "back":
        setGroupIndex(null);
        break;
      default:
        switch (target.value) {
          case "SPACE":
            setText((previous) => previous + " ");
            break;
          case "DELETE":
            setText((previous) => previous.slice(0, -1));
            break;
          case "CLEAR":
            setText("");
            break;
          case "SPEAK":
            if (!speak(text)) setNotice(text.trim() ? "Speech is not available in this browser." : "Nothing to speak yet.");
            break;
          case "ALERT":
            setAlertOn(true);
            beep();
            speak("I need help");
            break;
          default:
            break;
        }
    }
  };
  useEffect(() => {
    handleSelectRef.current = handleSelect;
  });

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  // -------------------------------------------------------------------------
  // Per-frame gaze pipeline: features -> model -> offset -> filter -> hit test -> dwell
  // -------------------------------------------------------------------------

  const onFrame = useCallback((frame) => {
    const now = frame.timestamp;
    const selector = selectorRef.current;

    let raw = null;
    if (frame.ok) {
      const recent = opennessRef.current;
      const baseline = recent.length >= 10 ? median(recent) : NaN;
      recent.push(frame.features[EYE_OPENNESS_INDEX]);
      if (recent.length > 90) recent.shift();
      if (!isBlink(frame.features, baseline)) {
        raw = predictRaw(params, frame.features);
      }
    }

    const recenterState = recenterRef.current;
    if (recenterState) {
      if (raw && now - recenterState.startedAt >= RECENTER.settleMs) recenterState.raws.push(raw);
      if (now - recenterState.startedAt >= RECENTER.settleMs + RECENTER.collectMs) {
        recenterRef.current = null;
        setRecenter(null);
        if (recenterState.raws.length >= 8) {
          const limit = (value) => Math.max(-RECENTER.maxOffset, Math.min(RECENTER.maxOffset, value));
          const next = {
            x: limit(0.5 - median(recenterState.raws.map((p) => p.x))),
            y: limit(0.5 - median(recenterState.raws.map((p) => p.y))),
          };
          setOffset(next);
          setNotice(`Recentered (offset ${Math.round(next.x * 100)}%, ${Math.round(next.y * 100)}%).`);
        } else {
          setNotice("Recentering failed: the face was not visible long enough.");
        }
      }
      return;
    }

    if (!raw) {
      const lost = now - lastGoodRef.current > LOST_AFTER_MS;
      const state = selector.update(undefined, now);
      if (lost) filterRef.current.reset();
      setGaze((previous) => ({ ...previous, activeId: state.activeId, progress: state.progress, lost }));
      if (debugRef.current) debugRef.current.record({ now, raw: null, calibratedViewport: modelDoc.calibration?.viewport });
      return;
    }

    lastGoodRef.current = now;
    const corrected = { x: raw.x + offsetRef.current.x, y: raw.y + offsetRef.current.y };
    const point = filterRef.current.filter(corrected, now);
    if (debugRef.current) {
      debugRef.current.record({
        now, raw, corrected, filtered: point, features: frame.features, params,
        offset: offsetRef.current, calibratedViewport: modelDoc.calibration?.viewport, calibratedAt: modelDoc.createdAt,
      });
    }

    if (pausedRef.current) {
      setGaze({ point, activeId: null, progress: 0, lost: false });
      return;
    }

    const currentTargets = targetsRef.current;
    const id = hitTest(point, currentTargets, selector.activeId);
    const target = id ? currentTargets.find((t) => t.id === id) : null;
    const state = selector.update(id, now, target?.dwellScale ?? 1);
    if (state.selectedId) {
      const selected = currentTargets.find((t) => t.id === state.selectedId);
      if (selected) handleSelectRef.current?.(selected);
    }
    setGaze({ point, activeId: state.activeId, progress: state.progress, lost: false });
  }, [params, modelDoc]);

  const { videoRef, ...tracker } = useGazeTracker(onFrame);

  const startRecenter = () => {
    setMenuOpen(false);
    const state = { startedAt: performance.now(), raws: [] };
    recenterRef.current = state;
    setRecenter(state);
  };

  // Keyboard shortcuts for the helper/caregiver (gaze typing itself needs no keys).
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setAlertOn(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const wanted = test ? test.letters[test.index] : null;
  const cursor = gaze.point ? { x: clamp01(gaze.point.x), y: clamp01(gaze.point.y) } : null;

  return (
    <div className="stage demo">
      {/* Selected text: fixed region, never a gaze target */}
      <section className="text-panel" style={rectToStyle(REGIONS.textPanel)} aria-label="Selected text">
        {test ? (
          <div className="text-panel__test" role="status">
            Test {test.index + 1}/{test.letters.length}: look at <strong className="text-panel__wanted">{wanted}</strong>
            <button type="button" className="btn btn--small" onClick={() => { testRef.current = null; setTest(null); }}>Stop test</button>
          </div>
        ) : (
          <div className="text-panel__text" ref={textPanelRef} aria-live="polite">
            {text ? <span>{text}</span> : <span className="text-panel__placeholder">Look at a key to type…</span>}
            <span className="text-panel__caret" aria-hidden="true" />
          </div>
        )}
      </section>

      {/* Mouse-only toolbar */}
      <section className="demo-toolbar" style={rectToStyle(REGIONS.toolbar)}>
        <video ref={videoRef} className="camera camera--thumb" muted playsInline />
        <div className="demo-toolbar__status">
          {tracker.phase === "ready" ? (
            <span className={`pill ${tracker.face === "ok" ? "pill--success" : "pill--warn"}`} title={tracker.faceMessage}>
              {tracker.face === "ok" ? "Tracking" : tracker.face === "no-eyes" ? "Eyes not visible" : "No face"}
            </span>
          ) : tracker.phase === "error" ? (
            <span className="pill pill--danger">Camera error</span>
          ) : (
            <span className="pill">Starting…</span>
          )}
          {sizeMismatch && <span className="pill pill--warn" title={`Calibrated at ${calibratedViewport.width}×${calibratedViewport.height}`}>Size changed</span>}
          <div className="demo-toolbar__buttons">
            <button type="button" className="btn btn--small" onClick={() => setMenuOpen(true)}>Menu</button>
            <button type="button" className="btn btn--small" onClick={onExit}>Exit</button>
          </div>
        </div>
      </section>

      {/* Gaze targets */}
      {targets.map((target) => {
        const active = gaze.activeId === target.id;
        const isWanted = wanted && (target.value === wanted || (target.kind === "group" && LETTER_GROUPS[target.value].includes(wanted)));
        return (
          <button
            type="button"
            key={target.id}
            className={[
              "key",
              `key--${target.kind}`,
              target.value === "ALERT" ? "key--alert" : "",
              active ? "key--active" : "",
              flashId === target.id ? "key--flash" : "",
              isWanted ? "key--wanted" : "",
            ].join(" ")}
            style={{ ...rectToStyle(target.rect), "--progress": active ? gaze.progress : 0 }}
            onClick={() => handleSelect(target)}
            aria-label={target.kind === "group" ? `Letters ${target.label}` : target.label}
          >
            <span className="key__label">{target.label}</span>
            <span className="key__progress" aria-hidden="true" />
          </button>
        );
      })}

      {showCursor && cursor && !gaze.lost && (
        <div className="gaze-cursor" style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }} aria-hidden="true" />
      )}

      {sizeMismatch && !menuOpen && (
        <div className="size-banner" role="status">
          Screen area is {viewport.width}×{viewport.height}, calibrated at {calibratedViewport.width}×{calibratedViewport.height}.
          {calibratedViewport.fullscreen && !viewport.fullscreen ? " Return to full screen" : " Restore the window size"} or recalibrate.
        </div>
      )}

      {tracker.phase === "error" && (
        <div className="overlay overlay--dim">
          <div className="dialog">
            <h1 className="dialog__title">Camera problem</h1>
            <p className="notice notice--danger" role="alert">{tracker.message}</p>
            <div className="toolbar-row toolbar-row--end">
              <button type="button" className="btn" onClick={onExit}>Exit</button>
              <button type="button" className="btn btn--primary" onClick={tracker.retry}>Retry</button>
            </div>
          </div>
        </div>
      )}

      {tracker.phase === "loading" && (
        <div className="overlay">
          <div className="dialog dialog--center" role="status">
            <div className="spinner" aria-hidden="true" />
            <p>{tracker.message}</p>
          </div>
        </div>
      )}

      {recenter && (
        <div className="overlay overlay--dim recenter">
          <div className="cal-dot cal-dot--settle" style={{ left: "50%", top: "50%", "--settle-ms": `${RECENTER.settleMs}ms` }} aria-hidden="true">
            <span className="cal-dot__core" />
          </div>
          <p className="recenter__text">Look at the center of the dot</p>
        </div>
      )}

      {alertOn && (
        <div className="alert-banner" role="alert">
          <strong>ALERT — help requested</strong>
          <span>This is a local alert only. No emergency service or contact was notified.</span>
          <button type="button" className="btn btn--primary" onClick={() => setAlertOn(false)} autoFocus>Dismiss</button>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}

      {testSummary && !menuOpen && (
        <div className="overlay overlay--dim">
          <div className="dialog">
            <h1 className="dialog__title">Accuracy test result</h1>
            <dl className="facts">
              <div><dt>Correct letters</dt><dd>{testSummary.hits} of {testSummary.trials} ({Math.round((testSummary.hits / testSummary.trials) * 100)}%)</dd></div>
              <div><dt>Median time per letter</dt><dd>{formatMs(testSummary.medianTimeMs)}</dd></div>
              <div><dt>Wrong selections</dt><dd>{testSummary.falseSelections}</dd></div>
              <div><dt>Settings</dt><dd>{testSummary.mode === "direct" ? "All keys" : "Large tiles"}, dwell {formatMs(testSummary.dwellMs)}</dd></div>
            </dl>
            <p className="muted small">A letter counts as missed after {TEST_TIMEOUT_MS / 1000} s. Try the other layout or a longer dwell time if many letters were missed or wrong.</p>
            <div className="toolbar-row toolbar-row--end">
              <button type="button" className="btn btn--primary" onClick={() => setTestSummary(null)} autoFocus>Close</button>
            </div>
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="overlay overlay--dim" role="dialog" aria-modal="true" aria-label="Demo settings">
          <div className="dialog">
            <h1 className="dialog__title">Settings</h1>
            <p className="muted small">Gaze selection is paused while this menu is open.</p>

            <fieldset className="field">
              <legend>Keyboard layout</legend>
              <label><input type="radio" name="mode" checked={mode === "direct"} onChange={() => { setMode("direct"); setGroupIndex(null); }} /> All keys at once (faster, needs good accuracy)</label>
              <label><input type="radio" name="mode" checked={mode === "grouped"} onChange={() => { setMode("grouped"); setGroupIndex(null); }} /> Two steps with large tiles (more reliable)</label>
              <span className="muted small">Recommended for this calibration: {modelDoc.recommendedMode === "direct" ? "all keys" : "two steps"}.</span>
            </fieldset>

            <fieldset className="field">
              <legend>Dwell time (how long to look at a key to select it)</legend>
              <div className="segmented">
                {DWELL_OPTIONS.map((ms) => (
                  <button type="button" key={ms} className={`btn btn--small${dwellMs === ms ? " btn--accent" : ""}`} aria-pressed={dwellMs === ms} onClick={() => setDwellMs(ms)}>
                    {(ms / 1000).toFixed(1)} s
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="field field--inline">
              <input type="checkbox" checked={showCursor} onChange={(event) => setShowCursor(event.target.checked)} /> Show gaze point
            </label>

            <div className="toolbar-row">
              <button type="button" className="btn" onClick={startRecenter}>Recenter (look at a dot for 2 s)</button>
              {(offset.x !== 0 || offset.y !== 0) && <button type="button" className="btn" onClick={() => setOffset({ x: 0, y: 0 })}>Remove recenter offset</button>}
              <button type="button" className="btn" onClick={startTest} disabled={tracker.phase !== "ready"}>Accuracy test ({TEST_TRIALS} letters)</button>
              <button type="button" className="btn" onClick={onRecalibrate}>Full recalibration</button>
            </div>

            <p className="muted small">
              {tracker.stats.backend ? `TF.js ${tracker.stats.backend}` : ""}
              {tracker.stats.fps > 0 ? ` · ${tracker.stats.fps.toFixed(0)} fps · ${formatMs(tracker.stats.detectMs)} per frame` : ""}
              {Number.isFinite(tracker.stats.detectorLoadMs) ? ` · model load ${formatMs(tracker.stats.detectorLoadMs)}` : ""}
              {Number.isFinite(tracker.stats.cameraStartMs) ? ` · camera start ${formatMs(tracker.stats.cameraStartMs)}` : ""}
            </p>

            <div className="toolbar-row toolbar-row--end">
              <button type="button" className="btn btn--primary" onClick={() => setMenuOpen(false)} autoFocus>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
