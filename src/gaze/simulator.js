// Development-only gaze simulator (open the app with ?simulate in `npm run dev`).
// Produces feature vectors from the mouse position through a synthetic
// eye model with per-frame noise, so the full calibration -> training ->
// demo flow can be exercised without a camera. Never included in production
// builds: useGazeTracker imports it only when import.meta.env.DEV is true.
//
// Keys while simulating: F toggles "face lost", B triggers a blink.

import { GAZE_FEATURE_COUNT } from "./featureExtractor.js";

function gaussian() {
  return Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
}

export function startSimulatedLoop(onFrame) {
  let pointer = { x: 0.5, y: 0.5 };
  let faceLost = false;
  let blinkUntil = 0;
  const onMove = (event) => {
    pointer = { x: event.clientX / window.innerWidth, y: event.clientY / window.innerHeight };
  };
  const onKey = (event) => {
    if (event.key === "f" || event.key === "F") faceLost = !faceLost;
    if (event.key === "b" || event.key === "B") blinkUntil = performance.now() + 200;
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("keydown", onKey);

  const timer = setInterval(() => {
    const started = performance.now();
    if (faceLost) {
      onFrame({ ok: false, reason: "no-face", timestamp: started, detectMs: 1 });
      return;
    }
    const sx = pointer.x - 0.5;
    const sy = pointer.y - 0.5;
    const noise = 0.004;
    const irisX = 0.16 * sx + 0.03 * sx * Math.abs(sx);
    const irisY = 0.07 * sy + 0.02 * sy * sy;
    const openness = started < blinkUntil ? 0.05 : 0.3 - 0.4 * irisY;
    const features = [
      irisX + noise * gaussian(), irisY + noise * gaussian(),
      irisX + noise * gaussian(), irisY + noise * gaussian(),
      0.5 + 1.2 * irisY + 0.01 * gaussian(), openness + 0.005 * gaussian(),
      0.01 * gaussian(), 0.02 * gaussian(), 0.75 + 0.01 * gaussian(),
      0.01 * gaussian(), 0.01 * gaussian(),
      0.5 + 0.002 * gaussian(), 0.45 + 0.002 * gaussian(), 0.18 + 0.001 * gaussian(),
    ];
    if (features.length !== GAZE_FEATURE_COUNT) {
      throw new Error("Simulator is out of sync with the feature contract.");
    }
    onFrame({ ok: true, features, timestamp: performance.now(), detectMs: 1 });
  }, 33);

  return () => {
    clearInterval(timer);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("keydown", onKey);
  };
}
