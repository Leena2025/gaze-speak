// Is this device's gaze calibration usable? Checked once after sign-in, so a
// signed-in person is never treated as calibrated by default. Pure (no DOM),
// unit-tested. Uses only numbers the calibration really measured.

import { DIRECT_MODE_MIN_HIT_RATE } from "./calibrationData.js";
import { viewportChanged } from "./layout.js";

/** A screen-size change bigger than this (20%) needs a new calibration. */
export const RECALIBRATE_SIZE_CHANGE = 0.2;

/**
 * The calibration check passes when, on the held-out check points, enough
 * camera frames landed on the right key of the large-tile keyboard (the
 * easiest layout). Below that, eye control would mostly miss.
 */
export const VERIFY_MIN_HIT_RATE = DIRECT_MODE_MIN_HIT_RATE;

/** True when held-out validation numbers exist and pass the check. */
export function calibrationPassed(validation) {
  return Number.isFinite(validation?.groupedKeyHitRate) && validation.groupedKeyHitRate >= VERIFY_MIN_HIT_RATE;
}

/**
 * state: "missing" | "failed" | "outdated" | "ok" (ok may be "unverified":
 * an imported model file without check numbers). `reason` is plain English.
 */
export function calibrationStatus(doc, viewport) {
  if (!doc) {
    return { state: "missing", reason: "This device has not been calibrated yet." };
  }
  const validation = doc.metrics?.validation;
  if (validation && !calibrationPassed(validation)) {
    const percent = Math.round((validation.groupedKeyHitRate || 0) * 100);
    return { state: "failed", reason: `The last calibration did not pass its check: only ${percent}% of check frames landed on the right tile (${Math.round(VERIFY_MIN_HIT_RATE * 100)}% needed).` };
  }
  const calibrated = doc.calibration?.viewport;
  if (calibrated && viewport && viewportChanged(viewport, calibrated, RECALIBRATE_SIZE_CHANGE)) {
    return {
      state: "outdated",
      reason: `The screen size changed from ${calibrated.width}×${calibrated.height} to ${viewport.width}×${viewport.height} since the last calibration.`,
    };
  }
  return { state: "ok", unverified: !validation, reason: validation ? "" : "This model was imported without check results." };
}
