// Calibration sample cleaning, training orchestration, evaluation metrics and
// the validation CSV. Pure functions (no DOM) so they can be unit-tested.

import { EYE_OPENNESS_INDEX, GAZE_FEATURE_VERSION } from "./featureExtractor.js";
import { buildTargets, KEYBOARD_MODES, LAYOUT_VERSION } from "./layout.js";
import { createModelDocument, fitRidge, pixelError, predictRaw, trainGazeRegressor } from "./ridgeModel.js";

// Collection settings, chosen for ~1 minute total calibration at 15-30 fps.
export const CALIBRATION_SETTINGS = Object.freeze({
  settleMs: 700, // target shrinks; eyes travel and settle; frames ignored
  minCollectMs: 900, // minimum collection window per target
  minSamples: 15, // valid frames required per target
  blinkRatio: 0.7, // frame rejected if eye openness < 70% of the running median
});

const IRIS_FEATURES = [0, 1, 2, 3];

function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function isBlink(features, opennessBaseline) {
  return Number.isFinite(opennessBaseline) &&
    features[EYE_OPENNESS_INDEX] < opennessBaseline * CALIBRATION_SETTINGS.blinkRatio;
}

/**
 * Removes frames where the eyes were clearly not fixating the target (glance
 * away, partial blink) using a robust median/MAD test on the iris features.
 */
export function removeOutliers(frames) {
  if (frames.length < 6) return frames;
  const limits = IRIS_FEATURES.map((index) => {
    const values = frames.map((frame) => frame.features[index]);
    const center = median(values);
    const mad = median(values.map((value) => Math.abs(value - center)));
    return { index, center, tolerance: Math.max(0.02, 3.5 * 1.4826 * mad) };
  });
  return frames.filter((frame) =>
    limits.every(({ index, center, tolerance }) => Math.abs(frame.features[index] - center) <= tolerance));
}

function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function halfSize(target) {
  return { x: (target.rect.right - target.rect.left) / 2, y: (target.rect.bottom - target.rect.top) / 2 };
}

// Half-sizes of a letter key in each keyboard mode, used to estimate how often
// a single (unfiltered) prediction would land on the intended key.
const KEY_HALF_SIZES = {
  direct: halfSize(buildTargets(KEYBOARD_MODES.direct)[0]),
  grouped: halfSize(buildTargets(KEYBOARD_MODES.grouped)[0]),
};

/** Evaluates model params on samples; returns summary metrics and per-sample rows. */
export function evaluate(params, samples, viewport) {
  const rows = samples.map((sample) => {
    const prediction = predictRaw(params, sample.features);
    const dx = prediction.x - sample.target.x;
    const dy = prediction.y - sample.target.y;
    return {
      sample,
      prediction,
      dx,
      dy,
      errorPx: pixelError(prediction, sample.target, viewport),
    };
  });
  const errors = rows.map((row) => row.errorPx);
  const count = rows.length;
  const mean = (selector) => rows.reduce((sum, row) => sum + selector(row), 0) / count;
  const perTarget = [...new Set(rows.map((row) => row.sample.group))].map((group) => {
    const groupRows = rows.filter((row) => row.sample.group === group);
    const meanPrediction = {
      x: groupRows.reduce((sum, row) => sum + row.prediction.x, 0) / groupRows.length,
      y: groupRows.reduce((sum, row) => sum + row.prediction.y, 0) / groupRows.length,
    };
    return {
      group,
      target: groupRows[0].sample.target,
      count: groupRows.length,
      meanErrorPx: groupRows.reduce((sum, row) => sum + row.errorPx, 0) / groupRows.length,
      // Error of the averaged prediction: systematic offset (bias) at this point.
      biasPx: pixelError(meanPrediction, groupRows[0].sample.target, viewport),
    };
  });
  const hitRate = (half) => rows.filter((row) => Math.abs(row.dx) <= half.x && Math.abs(row.dy) <= half.y).length / count;
  return {
    rows,
    summary: {
      count,
      maeXPx: mean((row) => Math.abs(row.dx) * viewport.width),
      maeYPx: mean((row) => Math.abs(row.dy) * viewport.height),
      rmsePx: Math.sqrt(mean((row) => row.errorPx ** 2)),
      meanErrorPx: mean((row) => row.errorPx),
      medianErrorPx: percentile(errors, 0.5),
      p90ErrorPx: percentile(errors, 0.9),
      meanErrorPercentOfDiagonal: (mean((row) => row.errorPx) / Math.hypot(viewport.width, viewport.height)) * 100,
      directKeyHitRate: hitRate(KEY_HALF_SIZES.direct),
      groupedKeyHitRate: hitRate(KEY_HALF_SIZES.grouped),
      perTarget,
    },
  };
}

// Direct mode needs most single-frame predictions inside a 1/7 x 1/4 screen
// key; filtering and dwell help, but cannot fix a large systematic error.
export const DIRECT_MODE_MIN_HIT_RATE = 0.7;

/**
 * Trains, validates and packages a model from one calibration session.
 * @param session { samples, viewport, startedAt, durationMs, timings }
 *   samples: [{ features, target:{x,y}, group, pass:"train"|"validation", t }]
 */
export function trainFromCalibration(session) {
  const { samples, viewport } = session;
  const trainSamples = samples.filter((sample) => sample.pass === "train");
  const validationSamples = samples.filter((sample) => sample.pass === "validation");
  if (new Set(trainSamples.map((sample) => sample.group)).size < 9) {
    throw new Error("Too few calibration targets were recorded to train a model. Run the calibration again.");
  }
  if (!validationSamples.length) {
    throw new Error("The validation pass recorded no samples. Run the calibration again.");
  }

  const started = performance.now();
  // 1) Model selection + fit on the training pass only.
  const evaluation = trainGazeRegressor(trainSamples, viewport);
  const training = evaluate(evaluation.params, trainSamples, viewport);
  const validation = evaluate(evaluation.params, validationSamples, viewport);
  // 2) Deployed model: same configuration refitted on both passes, so it also
  //    benefits from the validation positions. Its accuracy is reported by the
  //    held-out numbers above (a slightly pessimistic estimate).
  const deployedParams = fitRidge(samples, evaluation.params);
  const trainingMs = performance.now() - started;

  const recommendedMode = validation.summary.directKeyHitRate >= DIRECT_MODE_MIN_HIT_RATE
    ? KEYBOARD_MODES.direct
    : KEYBOARD_MODES.grouped;

  const metrics = {
    trainErrorPx: training.summary.meanErrorPx,
    crossValidationErrorPx: evaluation.selection.cvErrorPx,
    validation: { ...validation.summary, perTarget: validation.summary.perTarget },
  };

  const doc = createModelDocument(deployedParams, {
    layoutVersion: LAYOUT_VERSION,
    recommendedMode,
    selection: { basis: evaluation.selection.basis, lambda: evaluation.selection.lambda },
    calibration: {
      viewport,
      startedAt: session.startedAt,
      durationMs: session.durationMs,
      trainSamples: trainSamples.length,
      validationSamples: validationSamples.length,
      trainTargets: new Set(trainSamples.map((sample) => sample.group)).size,
      validationTargets: new Set(validationSamples.map((sample) => sample.group)).size,
    },
    metrics,
  });

  return {
    doc,
    metrics,
    recommendedMode,
    trainingMs,
    selection: evaluation.selection,
    csv: buildValidationCsv(training.rows, validation.rows, viewport),
    csvRowCount: training.rows.length + validation.rows.length,
    featureVersion: GAZE_FEATURE_VERSION,
  };
}

const CSV_COLUMNS = [
  "split", "target_id", "frame", "time_ms",
  "target_x", "target_y", "pred_x", "pred_y",
  "target_x_px", "target_y_px", "pred_x_px", "pred_y_px",
  "error_x_px", "error_y_px", "error_px",
];

/**
 * One row per calibration frame. `split` tells genuine held-out validation
 * frames ("validation": positions never used to fit the evaluation model)
 * apart from in-sample "train" frames. Coordinates are normalized viewport
 * values plus pixels at the calibration viewport size. No images or raw
 * landmarks are included.
 */
export function buildValidationCsv(trainRows, validationRows, viewport) {
  const format = (value, digits) => (Number.isFinite(value) ? value.toFixed(digits) : "");
  const lines = [CSV_COLUMNS.join(",")];
  const add = (split) => (row, index) => {
    const { sample, prediction } = row;
    lines.push([
      split,
      sample.group,
      index + 1,
      format(sample.t, 0),
      format(sample.target.x, 4),
      format(sample.target.y, 4),
      format(prediction.x, 4),
      format(prediction.y, 4),
      format(sample.target.x * viewport.width, 1),
      format(sample.target.y * viewport.height, 1),
      format(prediction.x * viewport.width, 1),
      format(prediction.y * viewport.height, 1),
      format(row.dx * viewport.width, 1),
      format(row.dy * viewport.height, 1),
      format(row.errorPx, 1),
    ].join(","));
  };
  validationRows.forEach(add("validation"));
  trainRows.forEach(add("train"));
  return lines.join("\n");
}
