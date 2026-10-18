// User preferences: defaults and validation. Pure, unit-tested. Values read
// back from storage are checked one by one, so a damaged or outdated entry
// falls back to its default instead of breaking the app.

export const DWELL_MIN_MS = 500;
export const DWELL_MAX_MS = 3000;
export const DWELL_STEP_MS = 100;

export const INPUT_MODES = Object.freeze({
  gaze: "gaze", // webcam eye tracking (the main mode)
  pointer: "pointer", // mouse or head-pointer dwell, no clicking needed
  touch: "touch", // tap or click only, no dwell
});

export const DEFAULT_SETTINGS = Object.freeze({
  inputMode: INPUT_MODES.gaze,
  dwellMs: 1000,
  showGazeCursor: true,
  feedbackSound: true,
  textSize: "large", // normal | large | xlarge
  theme: "light", // light | dark | contrast
  language: "en", // en | ta: phrase, symbol and speech language
  symbolLanguage: "auto", // auto (same as language) | en | ta | both: the Symbols page
  speechRate: 1,
  voiceEn: "",
  voiceTa: "",
  autoSpeak: true,
  keyboardLayout: "abc", // abc | qwerty
  keyMode: "auto", // auto | full | tiles
  autoCapitalize: true,
  newsLanguage: "en",
});

const CHOICES = {
  inputMode: Object.values(INPUT_MODES),
  textSize: ["normal", "large", "xlarge"],
  theme: ["light", "dark", "contrast"],
  language: ["en", "ta"],
  symbolLanguage: ["auto", "en", "ta", "both"],
  keyboardLayout: ["abc", "qwerty"],
  keyMode: ["auto", "full", "tiles"],
  newsLanguage: ["en", "ta"],
};

export function clampDwell(ms) {
  const value = Math.round(Number(ms) / DWELL_STEP_MS) * DWELL_STEP_MS;
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.dwellMs;
  return Math.min(DWELL_MAX_MS, Math.max(DWELL_MIN_MS, value));
}

export function normalizeSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  const result = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const value = source[key];
    if (value === undefined) continue;
    const fallback = DEFAULT_SETTINGS[key];
    if (CHOICES[key]) {
      if (CHOICES[key].includes(value)) result[key] = value;
    } else if (key === "dwellMs") {
      result.dwellMs = clampDwell(value);
    } else if (key === "speechRate") {
      const rate = Number(value);
      if (Number.isFinite(rate)) result.speechRate = Math.min(2, Math.max(0.5, Math.round(rate * 10) / 10));
    } else if (typeof value === typeof fallback) {
      result[key] = value;
    }
  }
  return result;
}
