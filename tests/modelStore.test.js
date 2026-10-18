import assert from "node:assert/strict";
import test from "node:test";

import { trainFromCalibration } from "../src/gaze/calibrationData.js";
import { createCalibrationPlan } from "../src/gaze/layout.js";
import {
  hasPreviousModel,
  installModel,
  loadActiveModel,
  readModelFile,
  restorePreviousModel,
  serializeModel,
} from "../src/gaze/modelStore.js";
import { validateModelDocument } from "../src/gaze/ridgeModel.js";

// Minimal browser stand-ins for modelStore (localStorage, fetch).
const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  },
};
globalThis.fetch = async () => ({ ok: false });

function makeModel(seed) {
  let state = seed;
  const random = () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const samples = [];
  for (const target of createCalibrationPlan(random)) {
    for (let i = 0; i < 12; i++) {
      const ix = 0.16 * (target.x - 0.5) + 0.004 * (random() - 0.5);
      const iy = 0.07 * (target.y - 0.5) + 0.004 * (random() - 0.5);
      samples.push({
        features: [ix, iy, ix, iy, 0.5 + iy, 0.3, 0, 0.01 * random(), 0.75, 0, 0, 0.5 + 0.01 * random(), 0.45, 0.18],
        target: { x: target.x, y: target.y },
        group: target.id,
        pass: target.pass,
        t: i,
      });
    }
  }
  return trainFromCalibration({ samples, viewport: { width: 1536, height: 864 }, startedAt: "2026-10-14T10:00:00.000Z", durationMs: 55000 }).doc;
}

const fileOf = (text, name) => new File([text], name, { type: "application/json" });

// Shape of the gaze-model.json written by the previous (TF.js) version of the app.
const LEGACY_TFJS = {
  modelTopology: { class_name: "Sequential", config: { layers: [] } },
  format: "layers-model",
  generatedBy: "TensorFlow.js tfjs-layers v4.22.0",
  convertedBy: null,
  weightsManifest: [{ paths: ["gaze-model.weights.bin"], weights: [] }],
  userDefinedMetadata: { format: "gazespeak-personalized-gaze-model", featureCount: 16 },
};

test("a downloaded model file imports unchanged (export and import use one format)", async () => {
  const doc = makeModel(1);
  const imported = await readModelFile(fileOf(serializeModel(doc), "igaze-model-2026-10-14-10-00-00.json"));
  assert.deepEqual(imported, doc);
  assert.equal(validateModelDocument(imported).ok, true);
});

test("legacy TF.js files are rejected with a specific explanation", async () => {
  await assert.rejects(readModelFile(fileOf(JSON.stringify(LEGACY_TFJS), "gaze-model.json")),
    /GazeSpeak TF\.js model from the previous version of this app \(16 features.*Download model/);
  await assert.rejects(readModelFile(fileOf("binary", "gaze-model.weights.bin")), /TF\.js weights file/);
  await assert.rejects(readModelFile(fileOf("split,target_id", "igaze-validation.csv")), /validation CSV, not a model/);
});

test("each kind of invalid file gets its own message", async () => {
  const doc = makeModel(2);
  const cases = [
    ["{not json", /is not valid JSON/],
    ["[1,2,3]", /does not contain a JSON object/],
    [JSON.stringify({ hello: "world" }), /expected "format": "igaze-ridge-gaze-model", found no format field/],
    [JSON.stringify({ ...doc, version: 2 }), /Unsupported model version 2/],
    [JSON.stringify({ ...doc, featureVersion: "gazespeak-landmarks-v2" }), /feature set "gazespeak-landmarks-v2"/],
    [JSON.stringify({ ...doc, featureNames: doc.featureNames.slice(1) }), /feature list does not match/],
    [JSON.stringify({ ...doc, params: { ...doc.params, weightsX: doc.params.weightsX.slice(1) } }), /params\.weightsX has \d+ values, expected \d+/],
    [JSON.stringify({ ...doc, params: { ...doc.params, std: doc.params.std.map((v, i) => (i === 3 ? 0 : v)) } }), /params\.std\[3\] must be positive/],
    [JSON.stringify({ ...doc, calibration: {} }), /calibration\.viewport/],
  ];
  for (const [text, pattern] of cases) {
    await assert.rejects(readModelFile(fileOf(text, "model.json")), pattern, text.slice(0, 60));
  }
  // NaN does not survive JSON, so check a corrupt number on the object path.
  assert.match(validateModelDocument({ ...doc, params: { ...doc.params, biasY: Number.NaN } }).message, /params\.biasY is not a finite number/);
});

test("a failed import never replaces the working model; backup and restore still work", async () => {
  storage.clear();
  const working = makeModel(3);
  installModel(working);
  const before = storage.get("igaze.model.active");

  // Same sequence as the Import button: read+validate first, install only on success.
  for (const [text, name] of [["{broken", "x.json"], [JSON.stringify(LEGACY_TFJS), "gaze-model.json"]]) {
    await assert.rejects(async () => installModel(await readModelFile(fileOf(text, name))));
    assert.equal(storage.get("igaze.model.active"), before, `${name} must not change the active model`);
  }
  assert.throws(() => installModel({ format: "igaze-ridge-gaze-model" }));
  assert.equal(storage.get("igaze.model.active"), before);

  // A valid import installs and keeps the old model as backup.
  const replacement = makeModel(4);
  installModel(await readModelFile(fileOf(serializeModel(replacement), "igaze-model.json")));
  assert.equal((await loadActiveModel()).doc.createdAt, replacement.createdAt);
  assert.equal(hasPreviousModel(), true);
  restorePreviousModel();
  assert.equal(storage.get("igaze.model.active"), before);
});
