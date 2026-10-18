import assert from "node:assert/strict";
import test from "node:test";
import * as tf from "@tensorflow/tfjs";

import {
  GAZE_FEATURE_COUNT,
  GAZE_FEATURE_NAMES,
  GAZE_FEATURE_RANGES,
  validateFeatureVector,
} from "../src/gaze/featureExtractor.js";
import {
  createGazeModel,
  createRidgeGazeModel,
  GAZE_MODEL_FORMAT,
  loadValidatedGazeModel,
  predictGaze,
  setGazeModelMetadata,
  validateGazeModelContract,
  validateGazeModelExport,
} from "../src/gaze/gazeModel.js";
import {
  createLetterTargets,
  getTargetBounds,
  KEYBOARD_LAYOUT,
  normalizedToViewport,
  pointInTarget,
} from "../src/gaze/keyboardLayout.js";

await tf.setBackend("cpu");
await tf.ready();

const sampleFeatures = () => GAZE_FEATURE_RANGES.map(([minimum, maximum]) =>
  (minimum + maximum) / 2
);

function createMetadataModel(createModel = createGazeModel, algorithm = "small-neural-network") {
  const model = createModel();
  setGazeModelMetadata(model, KEYBOARD_LAYOUT, algorithm);
  return model;
}

test("feature contract fixes the ordered 16-value range, including signed asymmetry", () => {
  assert.equal(GAZE_FEATURE_COUNT, 16);
  assert.equal(GAZE_FEATURE_NAMES.length, GAZE_FEATURE_COUNT);
  assert.equal(validateFeatureVector(sampleFeatures()), true);
  const signedFeatures = sampleFeatures();
  signedFeatures[6] = -1;
  signedFeatures[7] = 1;
  assert.equal(validateFeatureVector(signedFeatures), true);
  signedFeatures[6] = -1.01;
  assert.equal(validateFeatureVector(signedFeatures), false);
  assert.equal(validateFeatureVector([...sampleFeatures(), 0]), false);
  assert.equal(validateFeatureVector(sampleFeatures().map((value, index) => index === 2 ? NaN : value)), false);
});

test("both trainer architectures satisfy the full model contract", () => {
  const candidates = [
    [createGazeModel, "small-neural-network"],
    [createRidgeGazeModel, "ridge-linear"],
  ];
  for (const [createModel, algorithm] of candidates) {
    const model = createMetadataModel(createModel, algorithm);
    const result = validateGazeModelContract(model, KEYBOARD_LAYOUT);
    assert.equal(result.ok, true, result.message);
    assert.equal(model.inputs[0].shape[1], GAZE_FEATURE_COUNT);
    assert.equal(model.outputs[0].shape[1], 2);
    model.dispose();
  }
});

test("contract rejects missing metadata, wrong shapes, and unsupported layers", () => {
  const missingMetadata = createGazeModel();
  assert.equal(validateGazeModelContract(missingMetadata, KEYBOARD_LAYOUT).ok, false);
  missingMetadata.dispose();

  const wrongInput = tf.sequential();
  wrongInput.add(tf.layers.dense({ inputShape: [15], units: 2, activation: "sigmoid" }));
  assert.match(validateGazeModelContract(wrongInput, KEYBOARD_LAYOUT).message, /input/i);
  wrongInput.dispose();

  const wrongOutput = tf.sequential();
  wrongOutput.add(tf.layers.dense({ inputShape: [16], units: 3, activation: "sigmoid" }));
  assert.match(validateGazeModelContract(wrongOutput, KEYBOARD_LAYOUT).message, /output/i);
  wrongOutput.dispose();

  const unsupported = tf.sequential();
  unsupported.add(tf.layers.dense({ inputShape: [16], units: 32, activation: "relu" }));
  unsupported.add(tf.layers.batchNormalization());
  unsupported.add(tf.layers.dense({ units: 2, activation: "sigmoid" }));
  assert.match(validateGazeModelContract(unsupported, KEYBOARD_LAYOUT).message, /unsupported/i);
  unsupported.dispose();
});

test("prediction rejects invalid features, malformed output, non-finite output, and out-of-range coordinates", () => {
  const model = createMetadataModel();
  assert.throws(() => predictGaze(model, sampleFeatures().slice(1)), /16 finite features/);
  assert.throws(() => predictGaze(model, sampleFeatures().map((value, index) => index === 0 ? Infinity : value)), /16 finite features/);
  model.dispose();

  for (const [values, pattern] of [
    [[0.5], /shape/],
    [[NaN, 0.5], /finite/],
    [[1.1, 0.5], /\[0, 1\]/],
  ]) {
    const fakeModel = { predict: () => tf.tensor(values, [1, values.length]) };
    assert.throws(() => predictGaze(fakeModel, sampleFeatures()), pattern);
  }
});

test("in-memory export validates weights and preserves predictions and metadata", async () => {
  const model = createMetadataModel();
  const result = await validateGazeModelExport(model, KEYBOARD_LAYOUT);
  assert.equal(result.maximumAbsoluteDifference, 0);
  assert.equal(result.tolerance, 1e-5);
  assert.ok(result.weightSpecs > 0);
  assert.ok(result.weightBytes > 0);
  const loaded = await loadValidatedGazeModel(tf.io.fromMemory(await saveArtifacts(model)));
  assert.equal(loaded.getUserDefinedMetadata().format, GAZE_MODEL_FORMAT);
  assert.deepEqual(predictGaze(loaded, sampleFeatures()), predictGaze(model, sampleFeatures()));
  loaded.dispose();
  model.dispose();
});

async function saveArtifacts(model) {
  let artifacts;
  await model.save(tf.io.withSaveHandler(async (saved) => {
    artifacts = saved;
    return { modelArtifactsInfo: tf.io.getModelArtifactsInfoForJSON(saved) };
  }));
  return artifacts;
}

test("loader rejects missing/corrupt weight data and uncontracted deployed model", async () => {
  const model = createMetadataModel();
  const artifacts = await saveArtifacts(model);
  model.dispose();

  await assert.rejects(
    loadValidatedGazeModel(tf.io.fromMemory({ ...artifacts, weightData: artifacts.weightData.slice(0, -4) })),
    /weight|load|shape|length/i
  );
  await assert.rejects(
    loadValidatedGazeModel("http://127.0.0.1:1/missing-model.json"),
    /weight shards|load|fetch/i
  );
});

test("normalized viewport conversion and keyboard hit testing preserve bounds and reject gaps", () => {
  assert.deepEqual(normalizedToViewport({ x: 0.5, y: 0.25 }, { width: 1200, height: 800 }), { x: 600, y: 200 });
  assert.throws(() => normalizedToViewport({ x: NaN, y: 0.5 }, { width: 1200, height: 800 }), /finite normalized/);

  const [first, second] = createLetterTargets();
  const viewport = { width: 1366, height: 768 };
  const firstBounds = getTargetBounds(first);
  const secondBounds = getTargetBounds(second);
  const gapPoint = {
    x: (firstBounds.right + secondBounds.left) / 2,
    y: (firstBounds.top + firstBounds.bottom) / 2,
  };
  assert.equal(pointInTarget(gapPoint, first, KEYBOARD_LAYOUT, viewport), false);
  assert.equal(pointInTarget(gapPoint, second, KEYBOARD_LAYOUT, viewport), false);
  assert.equal(pointInTarget({ x: first.x / 100, y: first.y / 100 }, first, KEYBOARD_LAYOUT, viewport), true);
});
