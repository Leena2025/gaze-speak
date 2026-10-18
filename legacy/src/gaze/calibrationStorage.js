export const CALIBRATION_STORAGE_KEY = "gazeSpeakCalibrationV1";

export function validateCalibrationPayload(payload) {
  if (!payload || payload.format !== "gazespeak-calibration-dataset") {
    return false;
  }

  if (!payload.metadata || typeof payload.metadata !== "object") {
    return false;
  }

  if (!Array.isArray(payload.samples)) {
    return false;
  }

  return payload.samples.every((entry) => Array.isArray(entry?.features) || Array.isArray(entry?.landmarks));
}

export function saveCalibrationDataset(samples, metadata) {
  const payload = {
    format: "gazespeak-calibration-dataset",
    savedAt: new Date().toISOString(),
    metadata,
    samples,
  };

  window.localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(payload));
  return payload;
}

export function loadCalibrationDataset() {
  try {
    const serialized = window.localStorage.getItem(CALIBRATION_STORAGE_KEY);
    if (!serialized) {
      return null;
    }

    const payload = JSON.parse(serialized);
    return validateCalibrationPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}