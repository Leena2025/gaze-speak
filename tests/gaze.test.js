import assert from "node:assert/strict";
import test from "node:test";

import {
  extractGazeFeatures,
  GAZE_FEATURE_COUNT,
  GAZE_FEATURE_NAMES,
  GAZE_FEATURE_RANGES,
  validateFeatureVector,
} from "../src/gaze/featureExtractor.js";
import {
  crossValidate,
  fitRidge,
  predictRaw,
  trainGazeRegressor,
  validateModelDocument,
} from "../src/gaze/ridgeModel.js";
import {
  buildTargets,
  createCalibrationPlan,
  DIRECT_KEYS,
  hitTest,
  KEYBOARD_MODES,
  LETTER_GROUPS,
  REGIONS,
  viewportChanged,
} from "../src/gaze/layout.js";
import { createDwellSelector, OneEuroFilter } from "../src/gaze/filters.js";
import { evaluate, removeOutliers, trainFromCalibration } from "../src/gaze/calibrationData.js";

const VIEWPORT = { width: 1536, height: 864 };

// ---------------------------------------------------------------------------
// Synthetic face landmarks
// ---------------------------------------------------------------------------

function syntheticFace({ irisDx = 0, irisDy = 0, faceX = 320, faceY = 240, scale = 1, roll = 0 } = {}) {
  const points = Array.from({ length: 478 }, () => ({ x: faceX, y: faceY, z: 0 }));
  const place = (index, x, y, z = 0) => {
    const cos = Math.cos(roll);
    const sin = Math.sin(roll);
    points[index] = {
      x: faceX + (x * cos - y * sin) * scale,
      y: faceY + (x * sin + y * cos) * scale,
      z: z * scale,
    };
  };
  // image-left eye (33 outer, 133 inner), image-right eye (362 inner, 263 outer)
  place(33, -60, 0); place(133, -20, 0); place(159, -40, -8); place(145, -40, 8);
  place(362, 20, 0); place(263, 60, 0); place(386, 40, -8); place(374, 40, 8);
  const iris = (center, start) => {
    place(start, center + irisDx, irisDy);
    place(start + 1, center + irisDx + 5, irisDy);
    place(start + 2, center + irisDx, irisDy - 5);
    place(start + 3, center + irisDx - 5, irisDy);
    place(start + 4, center + irisDx, irisDy + 5);
  };
  iris(-40, 468);
  iris(40, 473);
  place(1, 0, 50, -20); place(10, 0, -70, 5); place(152, 0, 120, 5);
  return points;
}

const FRAME = { width: 640, height: 480 };

test("feature contract: names, ranges and validation agree", () => {
  assert.equal(GAZE_FEATURE_NAMES.length, GAZE_FEATURE_COUNT);
  assert.equal(GAZE_FEATURE_RANGES.length, GAZE_FEATURE_COUNT);
  const features = extractGazeFeatures(syntheticFace(), FRAME);
  assert.equal(features.length, GAZE_FEATURE_COUNT);
  assert.equal(validateFeatureVector(features), true);
  assert.equal(validateFeatureVector([...features, 0]), false);
  assert.equal(validateFeatureVector(features.map((v, i) => (i === 0 ? NaN : v))), false);
});

test("iris features respond to gaze and are invariant to face scale, position and roll", () => {
  const index = (name) => GAZE_FEATURE_NAMES.indexOf(name);
  const center = extractGazeFeatures(syntheticFace(), FRAME);
  const right = extractGazeFeatures(syntheticFace({ irisDx: 6 }), FRAME);
  const down = extractGazeFeatures(syntheticFace({ irisDy: 3 }), FRAME);
  assert.ok(right[index("rightIrisX")] > center[index("rightIrisX")]);
  assert.ok(right[index("leftIrisX")] > center[index("leftIrisX")]);
  assert.ok(down[index("rightIrisY")] > center[index("rightIrisY")]);
  assert.ok(down[index("lidRatio")] > center[index("lidRatio")]);

  const moved = extractGazeFeatures(syntheticFace({ irisDx: 6, faceX: 200, faceY: 300, scale: 1.4, roll: 0.2 }), FRAME);
  for (const name of ["rightIrisX", "rightIrisY", "leftIrisX", "leftIrisY", "lidRatio", "eyeOpenness"]) {
    assert.ok(Math.abs(moved[index(name)] - right[index(name)]) < 1e-9, `${name} should be invariant`);
  }
  // ...while the head-position features do see the movement.
  assert.ok(moved[index("faceX")] < right[index("faceX")]);
  assert.ok(moved[index("faceScale")] > right[index("faceScale")]);
  assert.ok(Math.abs(moved[index("headRoll")] - 0.2) < 1e-9);
});

test("extractor rejects missing landmarks and missing frame size", () => {
  assert.throws(() => extractGazeFeatures(syntheticFace().slice(0, 468), FRAME));
  assert.throws(() => extractGazeFeatures(syntheticFace(), null));
});

// ---------------------------------------------------------------------------
// Synthetic calibration data from a known (nonlinear) gaze mapping
// ---------------------------------------------------------------------------

function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function gaussian(random) {
  return Math.sqrt(-2 * Math.log(random() + 1e-12)) * Math.cos(2 * Math.PI * random());
}

// Simulates a person: iris offset is a smooth function of the screen point and
// head position; landmark noise is added per frame.
function simulateSession({ seed = 1, noise = 0.004, framesPerTarget = 18 } = {}) {
  const random = makeRandom(seed);
  const plan = createCalibrationPlan(random);
  const samples = [];
  let t = 0;
  for (const target of plan) {
    const headX = 0.5 + 0.03 * gaussian(random);
    for (let frame = 0; frame < framesPerTarget; frame++) {
      const jitterHead = headX + 0.003 * gaussian(random);
      const sx = target.x - 0.5;
      const sy = target.y - 0.5;
      const irisX = 0.16 * sx + 0.03 * sx * Math.abs(sx) - 0.12 * (jitterHead - 0.5);
      const irisY = 0.07 * sy + 0.02 * sy * sy;
      const features = [
        irisX + noise * gaussian(random),
        irisY + noise * gaussian(random),
        irisX + noise * gaussian(random),
        irisY + noise * gaussian(random),
        0.5 + 1.2 * irisY + 0.01 * gaussian(random),
        0.3 - 0.4 * irisY + 0.005 * gaussian(random),
        0.01 * gaussian(random),
        0.02 * gaussian(random),
        0.75 + 0.01 * gaussian(random),
        0.01 * gaussian(random),
        0.01 * gaussian(random),
        jitterHead,
        0.45 + 0.003 * gaussian(random),
        0.18 + 0.002 * gaussian(random),
      ];
      samples.push({ features, target: { x: target.x, y: target.y }, group: target.id, pass: target.pass, t: (t += 50) });
    }
  }
  return samples;
}

test("ridge regression recovers a known mapping and generalizes to unseen positions", () => {
  const samples = simulateSession();
  const train = samples.filter((s) => s.pass === "train");
  const validation = samples.filter((s) => s.pass === "validation");
  const result = trainGazeRegressor(train, VIEWPORT);
  const metrics = evaluate(result.params, validation, VIEWPORT).summary;
  // Noise-free mapping would give ~0; the simulated landmark noise gives tens of px.
  assert.ok(metrics.meanErrorPx < 80, `validation error ${metrics.meanErrorPx.toFixed(1)} px`);
  assert.ok(result.selection.cvErrorPx < 120, `cv error ${result.selection.cvErrorPx.toFixed(1)} px`);
  assert.ok(result.trainingMs < 2000, `training took ${result.trainingMs.toFixed(0)} ms`);
});

test("predictions near the edges are not compressed toward the center", () => {
  const samples = simulateSession({ noise: 0.001 }).filter((s) => s.pass === "train");
  const params = fitRidge(samples, { basis: "quadratic", lambda: 0.01 });
  const corner = samples.find((s) => s.target.x === 0.05 && s.target.y === 0.06);
  const prediction = predictRaw(params, corner.features);
  assert.ok(Math.abs(prediction.x - 0.05) < 0.04 && Math.abs(prediction.y - 0.06) < 0.06, JSON.stringify(prediction));
});

test("cross-validation holds out whole targets", () => {
  const samples = simulateSession().filter((s) => s.pass === "train");
  const looError = crossValidate(samples, VIEWPORT, { basis: "linear", lambda: 0.1 });
  const params = fitRidge(samples, { basis: "linear", lambda: 0.1 });
  const inSample = evaluate(params, samples, VIEWPORT).summary.meanErrorPx;
  assert.ok(looError >= inSample, "held-out error should not be lower than in-sample error");
});

test("full training pipeline produces a valid, self-describing model document and CSV", () => {
  const session = { samples: simulateSession(), viewport: VIEWPORT, startedAt: "2026-01-01T00:00:00Z", durationMs: 60000 };
  const result = trainFromCalibration(session);
  assert.deepEqual(validateModelDocument(result.doc), { ok: true, message: "Model is valid." });
  assert.ok(["direct", "grouped"].includes(result.recommendedMode));
  const lines = result.csv.split("\n");
  assert.equal(lines.length, result.csvRowCount + 1);
  assert.ok(lines[1].startsWith("validation,V"));
  assert.ok(lines.some((line) => line.startsWith("train,T")));
  // JSON round trip keeps the model valid and predictions identical.
  const restored = JSON.parse(JSON.stringify(result.doc));
  const features = session.samples[0].features;
  assert.deepEqual(predictRaw(restored.params, features), predictRaw(result.doc.params, features));
});

test("model validation rejects old TF.js files, other feature versions and corrupt numbers", () => {
  const { doc } = trainFromCalibration({ samples: simulateSession(), viewport: VIEWPORT });
  assert.equal(validateModelDocument({ modelTopology: {} }).ok, false);
  assert.equal(validateModelDocument({ ...doc, featureVersion: "old" }).ok, false);
  assert.equal(validateModelDocument({ ...doc, params: { ...doc.params, weightsX: doc.params.weightsX.slice(1) } }).ok, false);
  assert.equal(validateModelDocument({ ...doc, params: { ...doc.params, biasX: NaN } }).ok, false);
  assert.equal(validateModelDocument({ ...doc, calibration: {} }).ok, false);
});

test("outlier removal drops glances away but keeps the fixation cluster", () => {
  const random = makeRandom(3);
  const frames = Array.from({ length: 20 }, () => ({ features: [0.1 + 0.003 * gaussian(random), 0.02, 0.1, 0.02] }));
  frames.push({ features: [0.4, 0.02, 0.4, 0.02] });
  const kept = removeOutliers(frames);
  assert.equal(kept.length, 20);
});

// ---------------------------------------------------------------------------
// Layout and coordinate mapping
// ---------------------------------------------------------------------------

function overlaps(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

test("layout targets stay inside the viewport and never overlap", () => {
  const states = [
    buildTargets(KEYBOARD_MODES.direct),
    buildTargets(KEYBOARD_MODES.grouped),
    ...LETTER_GROUPS.map((_, index) => buildTargets(KEYBOARD_MODES.grouped, index)),
  ];
  for (const targets of states) {
    for (const target of targets) {
      assert.ok(target.rect.left >= 0 && target.rect.right <= 1 && target.rect.top >= 0 && target.rect.bottom <= 1);
      assert.ok(!overlaps(target.rect, REGIONS.textPanel), `${target.id} overlaps the text panel`);
    }
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        assert.ok(!overlaps(targets[i].rect, targets[j].rect), `${targets[i].id} overlaps ${targets[j].id}`);
      }
    }
  }
  assert.equal(buildTargets(KEYBOARD_MODES.direct).filter((t) => t.kind === "letter").length, DIRECT_KEYS.length);
  const allGroupedLetters = LETTER_GROUPS.flatMap((_, i) => buildTargets(KEYBOARD_MODES.grouped, i).filter((t) => t.kind === "letter").map((t) => t.value));
  assert.deepEqual(allGroupedLetters, DIRECT_KEYS);
});

test("calibration covers every region the demo uses, including corners", () => {
  const plan = createCalibrationPlan(makeRandom(9));
  const train = plan.filter((p) => p.pass === "train");
  const validation = plan.filter((p) => p.pass === "validation");
  assert.equal(train.length, 25);
  assert.equal(validation.length, 8);
  const xs = train.map((p) => p.x);
  const ys = train.map((p) => p.y);
  assert.ok(Math.min(...xs) <= REGIONS.keys.left + 0.05 && Math.max(...xs) >= REGIONS.keys.right - 0.05);
  assert.ok(Math.min(...ys) <= REGIONS.textPanel.top + 0.05 && Math.max(...ys) >= REGIONS.actions.bottom - 0.05);
  for (const v of validation) {
    assert.ok(!train.some((t) => t.x === v.x && t.y === v.y), "validation positions must be unseen");
  }
});

test("hit testing uses gaps, hysteresis and edge clamping", () => {
  const targets = buildTargets(KEYBOARD_MODES.direct);
  const a = targets.find((t) => t.id === "KEY_A");
  const b = targets.find((t) => t.id === "KEY_B");
  const centerA = { x: (a.rect.left + a.rect.right) / 2, y: (a.rect.top + a.rect.bottom) / 2 };
  assert.equal(hitTest(centerA, targets), "KEY_A");
  const gap = { x: (a.rect.right + b.rect.left) / 2, y: centerA.y };
  assert.equal(hitTest(gap, targets), null);
  assert.equal(hitTest(gap, targets, "KEY_A"), "KEY_A");
  assert.equal(hitTest({ x: -0.2, y: 0.97 }, targets), "SPACE");
  assert.equal(hitTest({ x: 0.5, y: 1.3 }, targets), "CLEAR", "below the screen snaps to the action row");
  assert.equal(hitTest({ x: 0.3, y: 0.165 }, targets), null, "text-panel band never selects a key");
  assert.equal(hitTest({ x: 0.3, y: -0.2 }, targets), null, "above the screen selects nothing");
});

test("viewport change detection", () => {
  assert.equal(viewportChanged({ width: 1536, height: 864 }, { width: 1536, height: 864 }), false);
  assert.equal(viewportChanged({ width: 1536, height: 730 }, { width: 1536, height: 864 }), true);
});

// ---------------------------------------------------------------------------
// Filtering and dwell selection
// ---------------------------------------------------------------------------

test("one euro filter smooths jitter but follows large moves quickly", () => {
  const filter = new OneEuroFilter({ minCutoff: 0.8, beta: 2.5 });
  const random = makeRandom(5);
  let t = 0;
  let rawSquares = 0;
  let filteredSquares = 0;
  for (let i = 0; i < 200; i++) {
    const raw = 0.5 + 0.03 * gaussian(random);
    const value = filter.filter(raw, (t += 50));
    if (i > 10) {
      rawSquares += (raw - 0.5) ** 2;
      filteredSquares += (value - 0.5) ** 2;
    }
  }
  const ratio = Math.sqrt(filteredSquares / rawSquares);
  assert.ok(ratio < 0.6, `filtered/raw jitter ratio ${ratio.toFixed(2)}`);
  let value;
  for (let i = 0; i < 6; i++) value = filter.filter(0.9, (t += 50));
  assert.ok(value > 0.8, `after 300 ms the filter should be near the new point, got ${value}`);
});

test("dwell selects once per look, survives blinks and needs re-entry to repeat", () => {
  const selector = createDwellSelector({ dwellMs: 1000, graceMs: 250, rearmMs: 200, cooldownMs: 400 });
  let t = 0;
  const run = (id, ms) => {
    const selected = [];
    for (let elapsed = 0; elapsed < ms; elapsed += 50) {
      const state = selector.update(id, (t += 50));
      if (state.selectedId) selected.push(state.selectedId);
    }
    return selected;
  };
  assert.deepEqual(run("A", 600), []);
  assert.deepEqual(run(undefined, 150), []); // blink: progress frozen, not reset
  assert.deepEqual(run("A", 500), ["A"]);
  assert.deepEqual(run("A", 3000), [], "continuous gaze must not repeat the letter");
  assert.deepEqual(run(null, 300), []);
  assert.deepEqual(run("A", 1100), ["A"], "re-entering allows a deliberate double letter");
  assert.deepEqual(run("A", 300), []);
  assert.deepEqual(run("B", 400), []);
  assert.deepEqual(run("C", 400), [], "moving across keys resets progress");
  assert.deepEqual(run("C", 700), ["C"]);
});
