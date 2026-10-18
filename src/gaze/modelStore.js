// Model installation and loading.
//
// A trained model is installed directly into this browser (localStorage), so
// the demo uses it immediately. Installing keeps the previously active model
// as a backup that can be restored, and nothing is replaced until the new
// model has been validated. A model can also be downloaded as one JSON file,
// imported from a file, or deployed as a default at public/models/igaze-model.json.

import { validateModelDocument } from "./ridgeModel.js";

const ACTIVE_KEY = "igaze.model.active";
const PREVIOUS_KEY = "igaze.model.previous";
export const DEFAULT_MODEL_URL = "/models/igaze-model.json";

function readStored(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const doc = JSON.parse(raw);
    return validateModelDocument(doc).ok ? doc : null;
  } catch {
    return null;
  }
}

function writeStored(key, doc) {
  try {
    if (doc) window.localStorage.setItem(key, JSON.stringify(doc));
    else window.localStorage.removeItem(key);
  } catch (error) {
    throw new Error(`The browser refused to store the model (${error?.name || error}). Download the model file instead and import it later.`);
  }
}

/**
 * Loads the model the demo should use: the one installed in this browser,
 * otherwise the deployed default file. Returns { doc, source } or
 * { doc: null, message } explaining why nothing usable was found.
 */
export async function loadActiveModel() {
  const stored = readStored(ACTIVE_KEY);
  if (stored) {
    return { doc: stored, source: "browser" };
  }
  try {
    const response = await fetch(DEFAULT_MODEL_URL, { cache: "no-store" });
    if (!response.ok) {
      return { doc: null, message: "No gaze model is installed yet. Run calibration to create one." };
    }
    const doc = await response.json();
    const check = validateModelDocument(doc);
    if (!check.ok) {
      return { doc: null, message: `The deployed model file ${DEFAULT_MODEL_URL} is not usable: ${check.message}` };
    }
    return { doc, source: "file" };
  } catch {
    return { doc: null, message: "No gaze model is installed yet. Run calibration to create one." };
  }
}

export function installModel(doc) {
  const check = validateModelDocument(doc);
  if (!check.ok) {
    throw new Error(check.message);
  }
  const current = readStored(ACTIVE_KEY);
  writeStored(ACTIVE_KEY, doc);
  if (current) {
    try {
      writeStored(PREVIOUS_KEY, current);
    } catch {
      // The new model is installed; losing the backup copy is not fatal.
    }
  }
}

export function hasPreviousModel() {
  return Boolean(readStored(PREVIOUS_KEY));
}

/** Swaps the active and previous models. */
export function restorePreviousModel() {
  const previous = readStored(PREVIOUS_KEY);
  if (!previous) {
    throw new Error("There is no previous model to restore.");
  }
  const current = readStored(ACTIVE_KEY);
  writeStored(ACTIVE_KEY, previous);
  writeStored(PREVIOUS_KEY, current);
  return previous;
}

/** The exact text written by Download model; import reads the same format. */
export function serializeModel(doc) {
  return JSON.stringify(doc, null, 2);
}

/** Parses and validates a model file. Throws with a specific reason; never installs. */
export async function readModelFile(file) {
  const name = file?.name || "The selected file";
  if (/\.bin$/i.test(name)) {
    throw new Error(`${name} is a TF.js weights file from the previous version of this app, not an I-Gaze model. I-Gaze models are a single .json file.`);
  }
  if (/\.csv$/i.test(name)) {
    throw new Error(`${name} is a validation CSV, not a model. Choose the igaze-model-<date>.json file saved by Download model.`);
  }
  let doc;
  try {
    doc = JSON.parse(await file.text());
  } catch {
    throw new Error(`${name} is not valid JSON, so it cannot be an I-Gaze model.`);
  }
  const check = validateModelDocument(doc);
  if (!check.ok) {
    throw new Error(check.message);
  }
  return doc;
}

export function downloadText(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadModel(doc) {
  const stamp = (doc.createdAt || new Date().toISOString()).slice(0, 19).replace(/[:T]/g, "-");
  downloadText(serializeModel(doc), `igaze-model-${stamp}.json`, "application/json");
}
