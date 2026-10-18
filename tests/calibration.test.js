// Calibration pipeline tests: point order, labels, the installed model,
// persistence, coordinates, tile selection and the plain-word diagnosis.
// The "head drift" tests use synthetic eye features, not a real camera.

import assert from "node:assert/strict";
import test from "node:test";

import { GAZE_FEATURE_COUNT, GAZE_FEATURE_NAMES } from "../src/gaze/featureExtractor.js";
import { buildTargets, createCalibrationPlan, hitTest, KEYBOARD_MODES } from "../src/gaze/layout.js";
import { diagnoseCalibration, evaluate, trainFromCalibration } from "../src/gaze/calibrationData.js";
import { pixelError, predictRaw, validateModelDocument } from "../src/gaze/ridgeModel.js";
import { serializeModel } from "../src/gaze/modelStore.js";

const VIEWPORT = { width: 1536, height: 730, devicePixelRatio: 1.25 };

function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

/**
 * Synthetic calibration: weak, noisy vertical eye signal (like a webcam), and
 * a head that slowly sinks over the session. Looking at the same dot with a
 * lower head needs the eyes to look a little higher.
 */
function simulate(plan, { seed = 1, drift = 0.04 } = {}) {
  const random = makeRandom(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(random() + 1e-12)) * Math.cos(2 * Math.PI * random());
  const samples = [];
  let walk = 0;
  plan.forEach((point, k) => {
    for (let f = 0; f < 15; f++) {
      walk += 0.0006 * gauss();
      const head = drift * ((k + f / 15) / plan.length) + walk;
      const sx = point.x - 0.5;
      const sy = point.y - 0.5;
      const irisX = 0.16 * sx;
      const irisY = 0.07 * sy - 0.5 * head;
      const n = 0.012;
      const features = [
        irisX + n * gauss(), irisY + n * gauss(), irisX + n * gauss(), irisY + n * gauss(),
        0.5 + 1.2 * irisY + 0.03 * gauss(), 0.3 - 0.4 * irisY + 0.01 * gauss(),
        0.01 * gauss(), 0.02 * gauss(), 0.75 + 2 * head + 0.01 * gauss(),
        0.01 * gauss(), 0.01 * gauss(),
        0.5 + 0.003 * gauss(), 0.45 + head + 0.003 * gauss(), 0.18 + 0.001 * gauss(),
      ];
      samples.push({ features, target: { x: point.x, y: point.y }, group: point.id, pass: point.pass, t: (k * 15 + f) * 66 });
    }
  });
  return samples;
}

/** The order used before this fix: row by row, snaking left and right. */
function rowOrder(plan) {
  const train = plan.filter((p) => p.pass === "train").sort((a, b) => a.y - b.y || a.x - b.x);
  const ordered = [];
  for (let row = 0; row < 5; row++) {
    const cells = train.slice(row * 5, row * 5 + 5);
    ordered.push(...(row % 2 ? cells.reverse() : cells));
  }
  return [...ordered, ...plan.filter((p) => p.pass === "validation")];
}

test("plan: 25 learning points cover the grid, and every round of 5 visits every row and column", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const plan = createCalibrationPlan(makeRandom(seed));
    const train = plan.filter((p) => p.pass === "train");
    assert.equal(train.length, 25);
    assert.equal(new Set(train.map((p) => `${p.x},${p.y}`)).size, 25, "no point twice");
    for (let round = 0; round < 5; round++) {
      const block = train.slice(round * 5, round * 5 + 5);
      assert.equal(new Set(block.map((p) => p.y)).size, 5, "all rows in a round");
      assert.equal(new Set(block.map((p) => p.x)).size, 5, "all columns in a round");
    }
    assert.equal(plan.filter((p) => p.pass === "validation").length, 8);
    assert.equal(new Set(plan.map((p) => p.id)).size, plan.length, "ids are unique labels");
  }
});

test("plan: when a point is shown says nothing about its height (unlike the old row order)", () => {
  const corr = (xs, ys) => {
    const mx = xs.reduce((a, b) => a + b) / xs.length;
    const my = ys.reduce((a, b) => a + b) / ys.length;
    let sxy = 0, sxx = 0, syy = 0;
    xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
    return sxy / Math.sqrt(sxx * syy);
  };
  const plan = createCalibrationPlan(makeRandom(3));
  const train = plan.filter((p) => p.pass === "train");
  const old = rowOrder(plan).filter((p) => p.pass === "train");
  const order = train.map((_, i) => i);
  assert.ok(Math.abs(corr(order, old.map((p) => p.y))) > 0.9, "old order: time follows height");
  assert.ok(Math.abs(corr(order, train.map((p) => p.y))) < 0.35, "new order: time and height unrelated");
});

test("head drift (synthetic): the old row order fails the check, the balanced order passes", () => {
  let oldPass = 0;
  let newPass = 0;
  let oldX = 0;
  let oldY = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const plan = createCalibrationPlan(makeRandom(seed));
    const before = trainFromCalibration({ samples: simulate(rowOrder(plan), { seed }), viewport: VIEWPORT });
    const after = trainFromCalibration({ samples: simulate(plan, { seed }), viewport: VIEWPORT });
    if (before.metrics.validation.groupedKeyHitRate >= 0.7) oldPass += 1;
    if (after.metrics.validation.groupedKeyHitRate >= 0.7) newPass += 1;
    oldX += before.metrics.validation.maeXPx;
    oldY += before.metrics.validation.maeYPx;
  }
  // The old order's error is mostly vertical, as in the reported results.
  assert.ok(oldY > 1.5 * oldX, `vertical ${Math.round(oldY)} vs horizontal ${Math.round(oldX)}`);
  assert.ok(oldPass <= 2, `old order passed ${oldPass} of 6`);
  assert.equal(newPass, 6, `new order passed ${newPass} of 6`);
});

test("the installed model is exactly the model the check measured", () => {
  const plan = createCalibrationPlan(makeRandom(7));
  const samples = simulate(plan, { seed: 7, drift: 0 });
  const result = trainFromCalibration({ samples, viewport: VIEWPORT });
  const checkSamples = samples.filter((s) => s.pass === "validation");
  const again = evaluate(result.doc.params, checkSamples, VIEWPORT).summary;
  assert.equal(again.meanErrorPx, result.metrics.validation.meanErrorPx);
  assert.equal(again.groupedKeyHitRate, result.metrics.validation.groupedKeyHitRate);
  assert.match(result.doc.fittedOn, /learning points only/);
});

test("labels: check-point results belong to the dots that were shown", () => {
  const plan = createCalibrationPlan(makeRandom(11));
  const result = trainFromCalibration({ samples: simulate(plan, { seed: 11, drift: 0 }), viewport: VIEWPORT });
  const shown = new Map(plan.filter((p) => p.pass === "validation").map((p) => [p.id, p]));
  for (const row of result.metrics.validation.perTarget) {
    assert.deepEqual(row.target, { x: shown.get(row.group).x, y: shown.get(row.group).y });
    assert.equal(row.count, 15);
  }
  const header = result.csv.split("\n")[0].split(",");
  for (const name of GAZE_FEATURE_NAMES) assert.ok(header.includes(name), `CSV has ${name}`);
  assert.equal(result.csv.split("\n")[1].split(",").length, header.length);
});

test("persistence: a saved model reloads with the same predictions and metadata", () => {
  const plan = createCalibrationPlan(makeRandom(5));
  const samples = simulate(plan, { seed: 5, drift: 0 });
  const { doc } = trainFromCalibration({ samples, viewport: VIEWPORT, quality: { frames: 500, lostShare: 0, rejectedShare: 0.1, retries: 0, lowQualityPoints: 0, lowQualityPointIds: [] } });
  const loaded = JSON.parse(serializeModel(doc));
  assert.equal(validateModelDocument(loaded).ok, true);
  assert.equal(loaded.fittedOn, doc.fittedOn);
  assert.deepEqual(loaded.metrics.quality, doc.metrics.quality);
  const features = samples[0].features;
  assert.deepEqual(predictRaw(loaded.params, features), predictRaw(doc.params, features));
});

test("coordinates: predictions and targets share normalized page units", () => {
  // 0.1 of the width and 0.1 of the height of a 1536×730 page.
  assert.equal(Math.round(pixelError({ x: 0.6, y: 0.5 }, { x: 0.5, y: 0.5 }, VIEWPORT)), 154);
  assert.equal(Math.round(pixelError({ x: 0.5, y: 0.6 }, { x: 0.5, y: 0.5 }, VIEWPORT)), 73);
  // The dot is drawn at x*100% / y*100% of a full-page stage, the same units.
  const features = Array.from({ length: GAZE_FEATURE_COUNT }, () => 0);
  const params = { basis: "linear", mean: features.slice(), std: features.map(() => 1), weightsX: features.slice(), weightsY: features.slice(), biasX: 0.25, biasY: 0.75 };
  assert.deepEqual(predictRaw(params, features), { x: 0.25, y: 0.75 });
});

test("tiles: a gaze point selects the large tile it falls in", () => {
  const tiles = buildTargets(KEYBOARD_MODES.grouped);
  for (const tile of tiles) {
    const centre = { x: (tile.rect.left + tile.rect.right) / 2, y: (tile.rect.top + tile.rect.bottom) / 2 };
    assert.equal(hitTest(centre, tiles), tile.id);
  }
});

test("diagnosis: names a head shift, unsteady tracking, or nothing when passed", () => {
  const base = { crossValidationErrorPx: 68, validation: { meanErrorPx: 207, maeXPx: 44, maeYPx: 199, meanDxPx: 5, meanDyPx: 190 } };
  const shift = diagnoseCalibration(base, VIEWPORT, false);
  assert.equal(shift.kind, "shift");
  assert.match(shift.text, /too low/);
  const tracking = diagnoseCalibration({
    crossValidationErrorPx: 90,
    validation: { meanErrorPx: 120, maeXPx: 80, maeYPx: 80, meanDxPx: 5, meanDyPx: -8 },
    quality: { rejectedShare: 0.45, lostShare: 0.1, lowQualityPoints: 1, retries: 3 },
  }, VIEWPORT, false);
  assert.equal(tracking.kind, "tracking");
  assert.equal(diagnoseCalibration(base, VIEWPORT, true).kind, "ok");
});
