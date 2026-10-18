// The one gaze-selection engine for the whole app.
//
//   camera frames (useGazeTracker) or pointer position
//     -> model prediction (ridgeModel) -> recenter offset -> One Euro filter
//     -> hit test against every visible [data-gaze] element (targets.js)
//     -> dwell selector with re-arm lock and cooldown (filters.js)
//     -> element.click()
//
// Pages never run their own dwell logic: they render ordinary buttons with
// `data-gaze` (see components/GazeButton.jsx), and this provider shows dwell
// progress on them through the `--dwell` CSS variable and `data-gaze-state`.
// Per-frame visuals are written to the DOM directly so the app does not
// re-render 30 times a second.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useGazeTracker } from "../hooks/useGazeTracker.js";
import { useViewport } from "../hooks/useViewport.js";
import { useSettings } from "../app/SettingsContext.jsx";
import { INPUT_MODES } from "../app/settingsModel.js";
import { EYE_OPENNESS_INDEX } from "./featureExtractor.js";
import { predictRaw } from "./ridgeModel.js";
import { isBlink } from "./calibrationData.js";
import { createDwellSelector, PointFilter } from "./filters.js";
import { viewportChanged } from "./layout.js";
import { collectDomTargets, pickTarget } from "./targets.js";
import { createGazeDebug, gazeDebugEnabled } from "./diagnostics.js";

const FILTER_OPTIONS = { minCutoff: 0.8, beta: 2.5 };
const LOST_AFTER_MS = 400;
const POINTER_INTERVAL_MS = 33;
const FLASH_MS = 450;
export const RECENTER = { settleMs: 600, collectMs: 1500, maxOffset: 0.2 };

const GazeContext = createContext(null);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

let audioContext = null;
function playTick() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext ??= new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.08, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.12);
  } catch {
    // Sound feedback is optional; the visual flash always shows.
  }
}

/** Mounted only while camera tracking runs; reports tracker state upward. */
function CameraRuntime({ onFrame, onTracker, previewSlot }) {
  const { videoRef, phase, message, face, faceMessage, stats, retry } = useGazeTracker(onFrame);
  useEffect(() => {
    onTracker({ phase, message, face, faceMessage, stats, retry });
  }, [phase, message, face, faceMessage, stats, retry, onTracker]);
  usePreviewPlacement(videoRef, previewSlot);
  return <video ref={videoRef} className={`camera ${previewSlot ? "camera--preview" : "camera--hidden"}`} muted playsInline aria-hidden="true" />;
}

/**
 * Camera preview: draws the tracker's own video over a placeholder box (the
 * slot) that a page provides, for example Settings, Eye control. The video
 * element is never moved or restarted, so tracking is not affected; only its
 * on-screen position and size follow the slot. Hidden when the slot is
 * scrolled partly out of view.
 */
function usePreviewPlacement(videoRef, slot) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !slot) return undefined;
    let frame = 0;
    const place = () => {
      const box = slot.getBoundingClientRect();
      const clip = slot.closest(".content")?.getBoundingClientRect();
      const visible = box.width > 0 && (!clip || (box.top >= clip.top && box.bottom <= clip.bottom));
      video.style.left = `${box.left}px`;
      video.style.top = `${box.top}px`;
      video.style.width = `${box.width}px`;
      video.style.height = `${box.height}px`;
      video.style.visibility = visible ? "visible" : "hidden";
      frame = requestAnimationFrame(place);
    };
    place();
    return () => {
      cancelAnimationFrame(frame);
      for (const key of ["left", "top", "width", "height", "visibility"]) video.style.removeProperty(key);
    };
  }, [videoRef, slot]);
}

export function GazeProvider({ modelDoc, enabled, children }) {
  const { settings } = useSettings();
  const mode = settings.inputMode;
  const viewport = useViewport();

  const [started, setStarted] = useState(false);
  const [paused, setPausedState] = useState(false);
  const [tracker, setTracker] = useState(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [recentering, setRecentering] = useState(false);
  const [recenterResult, setRecenterResult] = useState(null);
  const [previewSlot, setPreviewSlot] = useState(null);

  const cursorRef = useRef(null);
  const pausedRef = useRef(false);
  const offsetRef = useRef(offset);
  const settingsRef = useRef(settings);
  const engine = useRef(null);
  if (!engine.current) {
    engine.current = {
      selector: createDwellSelector({ dwellMs: settings.dwellMs }),
      filter: new PointFilter(FILTER_OPTIONS),
      ids: new WeakMap(),
      elements: new Map(),
      nextId: 1,
      lastGood: 0,
      openness: [],
      painted: { active: null, locked: null },
      recenter: null,
      debug: gazeDebugEnabled() ? createGazeDebug("app", ".gaze-dot") : null,
    };
  }

  useEffect(() => {
    settingsRef.current = settings;
    engine.current.selector.setDwell(settings.dwellMs);
  }, [settings]);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const idFor = useCallback((element) => {
    const state = engine.current;
    let id = state.ids.get(element);
    if (!id) {
      id = `g${state.nextId++}`;
      state.ids.set(element, id);
    }
    state.elements.set(id, element);
    return id;
  }, []);

  const clearPaint = useCallback(() => {
    const { painted } = engine.current;
    for (const key of ["active", "locked"]) {
      const element = painted[key];
      if (element) {
        element.removeAttribute("data-gaze-state");
        element.style.removeProperty("--dwell");
      }
      painted[key] = null;
    }
  }, []);

  const hideCursor = useCallback(() => {
    if (cursorRef.current) cursorRef.current.hidden = true;
  }, []);

  /** One step of the engine: point is normalized, or undefined when gaze is unreliable this frame. */
  const step = useCallback((point, now) => {
    const state = engine.current;
    const selector = state.selector;
    state.elements.clear();
    const targets = collectDomTargets(idFor, { paused: pausedRef.current });

    let result;
    if (point === undefined) {
      result = selector.update(undefined, now);
    } else {
      const id = pickTarget(point, targets, selector.activeId);
      const target = id ? targets.find((t) => t.id === id) : null;
      result = selector.update(id, now, target?.dwellScale ?? 1);
    }

    const activeElement = result.activeId ? state.elements.get(result.activeId) ?? null : null;
    const lockedElement = result.lockedId ? state.elements.get(result.lockedId) ?? null : null;
    const { painted } = state;
    if (painted.active && painted.active !== activeElement) {
      painted.active.removeAttribute("data-gaze-state");
      painted.active.style.removeProperty("--dwell");
    }
    if (painted.locked && painted.locked !== lockedElement && painted.locked !== activeElement) {
      painted.locked.removeAttribute("data-gaze-state");
    }
    if (activeElement) {
      activeElement.setAttribute("data-gaze-state", "dwell");
      activeElement.style.setProperty("--dwell", result.progress.toFixed(3));
    }
    if (lockedElement && lockedElement !== activeElement) lockedElement.setAttribute("data-gaze-state", "locked");
    painted.active = activeElement;
    painted.locked = lockedElement;

    if (result.selectedId) {
      const element = state.elements.get(result.selectedId);
      if (element && element.isConnected) {
        if (settingsRef.current.feedbackSound) playTick();
        element.setAttribute("data-gaze-flash", "");
        setTimeout(() => element.removeAttribute("data-gaze-flash"), FLASH_MS);
        element.setAttribute("data-gaze-state", "locked");
        painted.locked = element;
        element.click();
      }
    }

    const cursor = cursorRef.current;
    if (cursor) {
      const show = point !== undefined && settingsRef.current.showGazeCursor && settingsRef.current.inputMode === INPUT_MODES.gaze;
      cursor.hidden = !show;
      if (show) {
        const x = Math.min(1, Math.max(0, point.x)) * window.innerWidth;
        const y = Math.min(1, Math.max(0, point.y)) * window.innerHeight;
        cursor.style.transform = `translate(${x}px, ${y}px)`;
      }
    }
  }, [idFor]);

  // Camera frames -> gaze point.
  const onFrame = useCallback((frame) => {
    const state = engine.current;
    const now = frame.timestamp;
    let raw = null;
    if (frame.ok && modelDoc) {
      const recent = state.openness;
      const baseline = recent.length >= 10 ? median(recent) : NaN;
      recent.push(frame.features[EYE_OPENNESS_INDEX]);
      if (recent.length > 90) recent.shift();
      if (!isBlink(frame.features, baseline)) raw = predictRaw(modelDoc.params, frame.features);
    }

    const recenter = state.recenter;
    if (recenter) {
      if (raw && now - recenter.startedAt >= RECENTER.settleMs) recenter.raws.push(raw);
      if (now - recenter.startedAt >= RECENTER.settleMs + RECENTER.collectMs) {
        state.recenter = null;
        setRecentering(false);
        if (recenter.raws.length >= 8) {
          const limit = (value) => Math.max(-RECENTER.maxOffset, Math.min(RECENTER.maxOffset, value));
          const next = {
            x: limit(0.5 - median(recenter.raws.map((p) => p.x))),
            y: limit(0.5 - median(recenter.raws.map((p) => p.y))),
          };
          setOffset(next);
          setRecenterResult({ ok: true, offset: next });
        } else {
          setRecenterResult({ ok: false });
        }
      }
      hideCursor();
      return;
    }

    if (!raw) {
      if (now - state.lastGood > LOST_AFTER_MS) state.filter.reset();
      step(undefined, now);
      if (now - state.lastGood > LOST_AFTER_MS) hideCursor();
      state.debug?.record({ now, raw: null, calibratedViewport: modelDoc?.calibration?.viewport });
      return;
    }
    state.lastGood = now;
    const corrected = { x: raw.x + offsetRef.current.x, y: raw.y + offsetRef.current.y };
    const filtered = state.filter.filter(corrected, now);
    step(filtered, now);
    state.debug?.record({
      now, raw, corrected, filtered, features: frame.features, params: modelDoc.params,
      offset: offsetRef.current, calibratedViewport: modelDoc.calibration?.viewport, calibratedAt: modelDoc.createdAt, model: modelDoc,
    });
  }, [modelDoc, step, hideCursor]);

  const cameraOn = enabled && started && mode === INPUT_MODES.gaze && Boolean(modelDoc);
  useEffect(() => {
    if (!cameraOn) engine.current.debug?.dispose();
  }, [cameraOn]);
  const pointerOn = enabled && mode === INPUT_MODES.pointer;

  // Pointer (mouse / head pointer) dwell.
  useEffect(() => {
    if (!pointerOn) return undefined;
    let pointer;
    const onMove = (event) => {
      pointer = { x: event.clientX / window.innerWidth, y: event.clientY / window.innerHeight };
    };
    const onLeave = (event) => {
      if (!event.relatedTarget) pointer = undefined;
    };
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerout", onLeave);
    const timer = setInterval(() => step(pointer, performance.now()), POINTER_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onLeave);
    };
  }, [pointerOn, step]);

  // Leaving a mode or stopping clears dwell state and visuals.
  useEffect(() => {
    if (cameraOn || pointerOn) return undefined;
    engine.current.selector.reset();
    clearPaint();
    hideCursor();
    return undefined;
  }, [cameraOn, pointerOn, clearPaint, hideCursor]);
  useEffect(() => {
    if (!cameraOn) setTracker(null);
  }, [cameraOn]);

  const setPaused = useCallback((value) => {
    pausedRef.current = value;
    setPausedState(value);
    engine.current.selector.reset();
    clearPaint();
  }, [clearPaint]);

  const startRecenter = useCallback(() => {
    if (!cameraOn) return;
    setRecenterResult(null);
    engine.current.recenter = { startedAt: performance.now(), raws: [] };
    engine.current.selector.reset();
    clearPaint();
    setRecentering(true);
  }, [cameraOn, clearPaint]);

  const calibrated = modelDoc?.calibration?.viewport;
  const sizeMismatch = Boolean(calibrated) && viewportChanged(viewport, calibrated);

  // One status a person can understand, used by the status pill and Home.
  let status;
  if (mode === INPUT_MODES.touch) status = { key: "touch", tone: "neutral", label: "Touch / click mode", detail: "Eye control is off. Tap or click to select." };
  else if (mode === INPUT_MODES.pointer) status = { key: "pointer", tone: "ok", label: "Pointer dwell on", detail: "Hold the mouse or head pointer on a button to select it." };
  else if (!modelDoc) status = { key: "needs-model", tone: "warn", label: "Needs calibration", detail: "Eye control needs a one-minute calibration before it can work." };
  else if (!started) status = { key: "idle", tone: "neutral", label: "Eye control not started", detail: "A helper presses Start eye control once. This also lets the browser play speech and music." };
  else if (!tracker || tracker.phase === "loading") status = { key: "loading", tone: "neutral", label: "Starting camera…", detail: tracker?.message || "Starting the camera and face tracking." };
  else if (tracker.phase === "error") status = { key: "error", tone: "danger", label: "Camera problem", detail: tracker.message };
  else if (tracker.face === "ok") status = { key: "tracking", tone: "ok", label: "Eye tracking on", detail: tracker.faceMessage };
  else status = { key: tracker.face === "no-eyes" ? "no-eyes" : "no-face", tone: "warn", label: tracker.face === "no-eyes" ? "Eyes not visible" : "Face not found", detail: `${tracker.faceMessage}. Selection is paused until tracking returns.` };

  const value = useMemo(() => ({
    mode,
    status,
    started,
    start: () => setStarted(true),
    stop: () => setStarted(false),
    paused,
    setPaused,
    retry: tracker?.retry ?? null,
    stats: tracker?.stats ?? null,
    hasModel: Boolean(modelDoc),
    sizeMismatch,
    calibratedViewport: calibrated ?? null,
    offset,
    resetOffset: () => setOffset({ x: 0, y: 0 }),
    startRecenter,
    recentering,
    recenterResult,
    clearRecenterResult: () => setRecenterResult(null),
    // A page passes an element here to show the live camera picture in it.
    setPreviewSlot,
  }), [mode, status.key, status.detail, started, paused, setPaused, tracker, modelDoc, sizeMismatch, calibrated, offset, startRecenter, recentering, recenterResult]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GazeContext.Provider value={value}>
      {children}
      {cameraOn && <CameraRuntime onFrame={onFrame} onTracker={setTracker} previewSlot={previewSlot} />}
      <div ref={cursorRef} className="gaze-dot" hidden aria-hidden="true" />
      {recentering && (
        <div className="recenter-v2" data-gaze-modal role="status">
          <div className="recenter-v2__dot" style={{ "--settle-ms": `${RECENTER.settleMs}ms` }} />
          <p>Look at the centre of the dot</p>
        </div>
      )}
    </GazeContext.Provider>
  );
}

export function useGaze() {
  const context = useContext(GazeContext);
  if (!context) throw new Error("useGaze must be used inside GazeProvider");
  return context;
}
