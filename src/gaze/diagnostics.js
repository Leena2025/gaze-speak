// Gaze diagnostics: shows and logs every stage of the gaze pipeline so a
// wrong dot position can be traced to its cause on a real camera.
//
// Turn it on by opening the app with ?gazedebug in the address bar, for
// example http://localhost:5173/?gazedebug . A panel appears in the top-left
// corner and the browser console (F12) gets one line per second:
//
//   raw       model output, normalized 0-1 viewport units, NOT clamped
//   corrected raw + Recenter offset
//   filtered  after One Euro smoothing (what the hit test uses)
//   dot       centre of the drawn dot in CSS pixels, read from the page
//   Y pushes  the features that move the vertical prediction most, as
//             "name z=<standard deviations from calibration> dy=<effect>"
//
// A feature with |z| above 3 is far outside anything seen during
// calibration; the model is then extrapolating and its output is unreliable.

import { GAZE_FEATURE_NAMES } from "./featureExtractor.js";
import { expandFeatures } from "./ridgeModel.js";

const QUADRATIC_NAMES = ["gx²", "gy²", "gx·gy", "gx·yaw", "gy·pitch", "lid·gy"];
const PANEL_INTERVAL_MS = 200;
const LOG_INTERVAL_MS = 1000;
export const OUT_OF_RANGE_Z = 3;

export function gazeDebugEnabled() {
  try {
    return new URLSearchParams(window.location.search).has("gazedebug");
  } catch {
    return false;
  }
}

export function featureLabels(basis) {
  return basis === "quadratic" ? [...GAZE_FEATURE_NAMES, ...QUADRATIC_NAMES] : [...GAZE_FEATURE_NAMES];
}

/**
 * Splits one prediction into per-feature contributions. The sums equal
 * predictRaw's output exactly: x = biasX + sum(dx), y = biasY + sum(dy).
 */
export function explainPrediction(params, features) {
  const row = expandFeatures(features, params.basis);
  const names = featureLabels(params.basis);
  const terms = row.map((value, j) => {
    const z = (value - params.mean[j]) / params.std[j];
    return { name: names[j] ?? `f${j}`, value, z, dx: z * params.weightsX[j], dy: z * params.weightsY[j] };
  });
  const x = params.biasX + terms.reduce((sum, term) => sum + term.dx, 0);
  const y = params.biasY + terms.reduce((sum, term) => sum + term.dy, 0);
  const byY = [...terms].sort((a, b) => Math.abs(b.dy) - Math.abs(a.dy));
  const byX = [...terms].sort((a, b) => Math.abs(b.dx) - Math.abs(a.dx));
  const outOfRange = terms.filter((term) => Math.abs(term.z) > OUT_OF_RANGE_Z).map((term) => term.name);
  return { x, y, biasY: params.biasY, topY: byY.slice(0, 3), topX: byX.slice(0, 3), outOfRange };
}

const fmt = (value, digits = 3) => (Number.isFinite(value) ? value.toFixed(digits) : "–");
const pair = (point, digits = 3) => (point ? `(${fmt(point.x, digits)}, ${fmt(point.y, digits)})` : "–");
const term = (t) => `${t.name} z=${fmt(t.z, 1)} ${t.dy >= 0 ? "+" : ""}${fmt(t.dy, 3)}`;

function dotCentre(selector) {
  const element = document.querySelector(selector);
  if (!element || element.hidden) return null;
  const box = element.getBoundingClientRect();
  if (!box.width && !box.height) return null;
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/**
 * One recorder per screen. `source` names the screen in the log ("app" or
 * "classic"), `dotSelector` finds the drawn dot so its real position is read
 * back from the page instead of being recomputed.
 */
export function createGazeDebug(source, dotSelector) {
  let panel = null;
  let lastPanel = 0;
  let lastLog = 0;
  let lost = 0;

  const ensurePanel = () => {
    if (panel?.isConnected) return panel;
    panel = document.createElement("pre");
    panel.className = "gaze-debug";
    panel.setAttribute("aria-hidden", "true");
    document.body.appendChild(panel);
    return panel;
  };

  return {
    /** Call once per camera frame. Pass raw: null for frames without a usable face. */
    record({ now, raw, corrected, filtered, features, params, offset, calibratedViewport, calibratedAt }) {
      if (!raw) lost += 1;
      const panelDue = now - lastPanel >= PANEL_INTERVAL_MS;
      const logDue = now - lastLog >= LOG_INTERVAL_MS;
      if (!panelDue && !logDue) return;

      const explained = raw && params && features ? explainPrediction(params, features) : null;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const dot = dotCentre(dotSelector);
      const expectedDot = filtered
        ? { x: Math.min(1, Math.max(0, filtered.x)) * viewport.width, y: Math.min(1, Math.max(0, filtered.y)) * viewport.height }
        : null;
      const clamped = filtered && (filtered.x < 0 || filtered.x > 1 || filtered.y < 0 || filtered.y > 1);
      const fullscreen = Boolean(document.fullscreenElement) || (Math.abs(window.innerHeight - window.screen.height) <= 2 && Math.abs(window.innerWidth - window.screen.width) <= 2);
      const theme = document.documentElement.dataset.theme || "?";

      const lines = [
        `GAZE DEBUG (${source})`,
        `model      calibrated ${calibratedAt ? new Date(calibratedAt).toLocaleString() : "?"}`,
        `viewport   ${viewport.width}×${viewport.height}  calibrated ${calibratedViewport ? `${calibratedViewport.width}×${calibratedViewport.height}` : "?"}`,
        `fullscreen ${fullscreen ? "yes" : "no"}  zoom ${fmt(window.devicePixelRatio, 2)}  theme ${source === "classic" ? "dark stage" : theme}`,
        `raw        ${pair(raw)}${raw && (raw.y > 1 || raw.y < 0 || raw.x > 1 || raw.x < 0) ? "  OFF-SCREEN" : ""}`,
        `offset     ${pair(offset)}`,
        `corrected  ${pair(corrected)}`,
        `filtered   ${pair(filtered)}${clamped ? "  (clamped to edge)" : ""}`,
        `dot px     ${pair(dot, 0)}  expected ${pair(expectedDot, 0)}`,
        `lost frames since last line: ${lost}`,
      ];
      if (explained) {
        lines.push(`Y = ${fmt(explained.biasY)} (centre of calibration) + pushes:`);
        for (const t of explained.topY) lines.push(`  ${term(t)}`);
        lines.push(`eyeOpenness z=${fmt(explainZ(params, features, "eyeOpenness"), 1)}  lidRatio z=${fmt(explainZ(params, features, "lidRatio"), 1)}  faceScale z=${fmt(explainZ(params, features, "faceScale"), 1)}`);
        if (explained.outOfRange.length) lines.push(`OUT OF CALIBRATION RANGE: ${explained.outOfRange.join(", ")}`);
      }

      if (panelDue) {
        lastPanel = now;
        ensurePanel().textContent = lines.join("\n");
      }
      if (logDue) {
        lastLog = now;
        lost = 0;
        console.log(
          `[gaze ${source}] raw=${pair(raw)} corrected=${pair(corrected)} filtered=${pair(filtered)} dot=${pair(dot, 0)}px viewport=${viewport.width}x${viewport.height}` +
          (explained ? ` Ypushes: ${explained.topY.map(term).join("; ")}` : "") +
          (explained?.outOfRange.length ? ` OUT-OF-RANGE: ${explained.outOfRange.join(",")}` : ""),
        );
      }
    },
    dispose() {
      panel?.remove();
      panel = null;
    },
  };
}

function explainZ(params, features, name) {
  const index = featureLabels(params.basis).indexOf(name);
  if (index < 0) return NaN;
  const row = expandFeatures(features, params.basis);
  return (row[index] - params.mean[index]) / params.std[index];
}
