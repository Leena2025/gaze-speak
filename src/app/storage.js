// Small, safe wrappers around localStorage. Everything the app keeps between
// visits (settings, message, phrases, contacts) lives in this browser only.
// Storage can be unavailable (private mode, blocked site data), so every
// access is guarded and the app keeps working with defaults.

export function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const STORAGE_KEYS = Object.freeze({
  settings: "igaze.v2.settings",
  message: "igaze.v2.message",
  savedPhrases: "igaze.v2.savedPhrases",
  customSymbols: "igaze.v2.customSymbols",
  contacts: "igaze.v2.contacts",
  userWords: "igaze.v2.userWords",
  music: "igaze.v2.music",
});

/** Short random id for user-created items. */
export function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
