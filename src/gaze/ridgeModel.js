// Personalized gaze regression: features -> normalized viewport (x, y).
//
// Why ridge regression instead of a neural network:
// - A calibration session gives a few hundred frames at ~20 screen positions.
//   Frames at the same position are highly correlated, so the effective
//   dataset is ~20 points. A 16-32-16-2 network memorizes those clusters;
//   a regularized linear/quadratic model interpolates between them.
// - Closed-form training takes milliseconds (the TF.js trainer took ~60 s),
//   so hyper-parameters can be chosen by leave-one-target-out
//   cross-validation, which measures generalization to unseen screen positions.
// - Output is linear (no sigmoid), so predictions are not squashed toward the
//   screen center near the edges.
// - The model is a small JSON object: easy to store in the browser, download,
//   import and validate.

import {
  GAZE_FEATURE_COUNT,
  GAZE_FEATURE_NAMES,
  GAZE_FEATURE_VERSION,
} from "./featureExtractor.js";

export const MODEL_FORMAT = "igaze-ridge-gaze-model";
export const MODEL_VERSION = 3;
export const LAMBDA_GRID = Object.freeze([0.01, 0.03, 0.1, 0.3, 1, 3, 10]);
export const BASES = Object.freeze(["linear", "quadratic"]);

const F = Object.fromEntries(GAZE_FEATURE_NAMES.map((name, index) => [name, index]));

/** Expands raw features with the chosen basis (before standardization). */
export function expandFeatures(features, basis) {
  if (basis === "linear") {
    return features.slice();
  }
  if (basis === "quadratic") {
    const gx = (features[F.rightIrisX] + features[F.leftIrisX]) / 2;
    const gy = (features[F.rightIrisY] + features[F.leftIrisY]) / 2;
    const lid = features[F.lidRatio];
    const yaw = features[F.headYaw];
    const pitch = features[F.headPitch];
    return [
      ...features,
      gx * gx,
      gy * gy,
      gx * gy,
      gx * yaw,
      gy * pitch,
      lid * gy,
    ];
  }
  throw new Error(`Unknown basis "${basis}".`);
}

// Solves (A) x = b for symmetric positive-definite A via Cholesky.
function choleskySolve(A, rhsList) {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) {
        sum -= L[i][k] * L[j][k];
      }
      if (i === j) {
        if (!(sum > 0)) {
          throw new Error("Ridge system is not positive definite.");
        }
        L[i][i] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return rhsList.map((b) => {
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = b[i];
      for (let k = 0; k < i; k++) sum -= L[i][k] * y[k];
      y[i] = sum / L[i][i];
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let sum = y[i];
      for (let k = i + 1; k < n; k++) sum -= L[k][i] * x[k];
      x[i] = sum / L[i][i];
    }
    return Array.from(x);
  });
}

function columnStats(rows) {
  const d = rows[0].length;
  const mean = Array.from({ length: d }, () => 0);
  for (const row of rows) for (let j = 0; j < d; j++) mean[j] += row[j];
  for (let j = 0; j < d; j++) mean[j] /= rows.length;
  const std = Array.from({ length: d }, () => 0);
  for (const row of rows) for (let j = 0; j < d; j++) std[j] += (row[j] - mean[j]) ** 2;
  for (let j = 0; j < d; j++) {
    const s = Math.sqrt(std[j] / rows.length);
    std[j] = s > 1e-9 ? s : 1; // constant column: leave unscaled (its weight shrinks to ~0)
  }
  return { mean, std };
}

/** Fits ridge regression; intercept is not penalized. Pure function. */
export function fitRidge(samples, { basis, lambda }) {
  if (samples.length < 4) {
    throw new Error("At least 4 samples are required to fit the gaze model.");
  }
  const expanded = samples.map((sample) => expandFeatures(sample.features, basis));
  const { mean, std } = columnStats(expanded);
  const d = mean.length;
  const n = samples.length;
  const Z = expanded.map((row) => row.map((value, j) => (value - mean[j]) / std[j]));
  const meanX = samples.reduce((sum, s) => sum + s.target.x, 0) / n;
  const meanY = samples.reduce((sum, s) => sum + s.target.y, 0) / n;

  const A = Array.from({ length: d }, () => Array.from({ length: d }, () => 0));
  const bx = Array.from({ length: d }, () => 0);
  const by = Array.from({ length: d }, () => 0);
  for (let r = 0; r < n; r++) {
    const z = Z[r];
    const tx = samples[r].target.x - meanX;
    const ty = samples[r].target.y - meanY;
    for (let i = 0; i < d; i++) {
      bx[i] += z[i] * tx;
      by[i] += z[i] * ty;
      for (let j = 0; j <= i; j++) A[i][j] += z[i] * z[j];
    }
  }
  // Scale lambda with n so the grid means the same thing for any dataset size.
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < i; j++) A[j][i] = A[i][j];
    A[i][i] += lambda * n;
  }
  const [wx, wy] = choleskySolve(A, [bx, by]);
  return {
    basis,
    lambda,
    mean,
    std,
    weightsX: wx,
    weightsY: wy,
    biasX: meanX,
    biasY: meanY,
  };
}

/** Raw (unclamped) prediction in normalized viewport coordinates. */
export function predictRaw(params, features) {
  const row = expandFeatures(features, params.basis);
  let x = params.biasX;
  let y = params.biasY;
  for (let j = 0; j < row.length; j++) {
    const z = (row[j] - params.mean[j]) / params.std[j];
    x += z * params.weightsX[j];
    y += z * params.weightsY[j];
  }
  return { x, y };
}

export function pixelError(prediction, target, viewport) {
  return Math.hypot((prediction.x - target.x) * viewport.width, (prediction.y - target.y) * viewport.height);
}

function meanPixelError(params, samples, viewport) {
  let total = 0;
  for (const sample of samples) total += pixelError(predictRaw(params, sample.features), sample.target, viewport);
  return total / samples.length;
}

/**
 * Leave-one-target-out cross-validation: each fold hides every frame of one
 * calibration target, so the score reflects error at screen positions the
 * model has not seen (adjacent-frame leakage is impossible).
 */
export function crossValidate(samples, viewport, { basis, lambda }) {
  const groups = [...new Set(samples.map((sample) => sample.group))];
  if (groups.length < 3) {
    throw new Error("Cross-validation needs at least 3 calibration targets.");
  }
  let total = 0;
  let count = 0;
  for (const group of groups) {
    const train = samples.filter((sample) => sample.group !== group);
    const test = samples.filter((sample) => sample.group === group);
    const params = fitRidge(train, { basis, lambda });
    for (const sample of test) {
      total += pixelError(predictRaw(params, sample.features), sample.target, viewport);
      count += 1;
    }
  }
  return total / count;
}

/**
 * Selects basis and lambda by grouped cross-validation, then fits on all
 * provided samples.
 * @param samples [{features:number[], target:{x,y}, group:string}]
 * @param viewport {width,height} in CSS pixels at calibration time
 */
export function trainGazeRegressor(samples, viewport) {
  const started = performance.now();
  const candidates = [];
  for (const basis of BASES) {
    for (const lambda of LAMBDA_GRID) {
      try {
        candidates.push({ basis, lambda, cvErrorPx: crossValidate(samples, viewport, { basis, lambda }) });
      } catch {
        // A singular fold for one candidate should not abort the search.
      }
    }
  }
  if (!candidates.length) {
    throw new Error("No model configuration could be fitted to this calibration.");
  }
  candidates.sort((a, b) => a.cvErrorPx - b.cvErrorPx);
  const best = candidates[0];
  const params = fitRidge(samples, best);
  return {
    params,
    selection: {
      basis: best.basis,
      lambda: best.lambda,
      cvErrorPx: best.cvErrorPx,
      trainErrorPx: meanPixelError(params, samples, viewport),
      candidates,
    },
    trainingMs: performance.now() - started,
  };
}

export function createModelDocument(params, info) {
  return {
    format: MODEL_FORMAT,
    version: MODEL_VERSION,
    featureVersion: GAZE_FEATURE_VERSION,
    featureNames: [...GAZE_FEATURE_NAMES],
    outputCoordinates: "normalized-viewport, origin top-left, x right, y down",
    createdAt: new Date().toISOString(),
    ...info,
    params,
  };
}

function checkArray(value, length, name) {
  if (!Array.isArray(value)) return `params.${name} is missing`;
  if (value.length !== length) return `params.${name} has ${value.length} values, expected ${length}`;
  const bad = value.findIndex((item) => !Number.isFinite(item));
  return bad >= 0 ? `params.${name}[${bad}] is not a finite number` : null;
}

const NEW_MODEL_HINT = "Create a compatible model with Calibrate, then use Download model on the results or home screen (it saves igaze-model-<date>.json).";

/**
 * Validates a model document loaded from storage, a file or the network.
 * Every failure names the specific problem so the user can tell a wrong file
 * from a damaged or outdated one.
 */
export function validateModelDocument(doc) {
  const fail = (message) => ({ ok: false, message });
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return fail("The file does not contain a JSON object.");
  }
  if (doc.modelTopology || doc.weightsManifest || doc.format === "layers-model") {
    const legacy = doc.userDefinedMetadata?.format === "gazespeak-personalized-gaze-model"
      ? `a GazeSpeak TF.js model from the previous version of this app (${doc.userDefinedMetadata.featureCount ?? "16"} features, neural network + gaze-model.weights.bin)`
      : "a TensorFlow.js layers model (gaze-model.json + weights.bin)";
    return fail(`This file is ${legacy}. Its features and model type differ from the current I-Gaze model, so it cannot be converted. ${NEW_MODEL_HINT}`);
  }
  if (doc.format !== MODEL_FORMAT) {
    return fail(`This is not an I-Gaze model file (expected "format": "${MODEL_FORMAT}", found ${doc.format === undefined ? "no format field" : JSON.stringify(doc.format)}). ${NEW_MODEL_HINT}`);
  }
  if (doc.version !== MODEL_VERSION) {
    return fail(`Unsupported model version ${JSON.stringify(doc.version)}; this app reads version ${MODEL_VERSION}. ${NEW_MODEL_HINT}`);
  }
  if (doc.featureVersion !== GAZE_FEATURE_VERSION) {
    return fail(`The model uses feature set ${JSON.stringify(doc.featureVersion)}, but this app computes "${GAZE_FEATURE_VERSION}". Predictions would be meaningless. ${NEW_MODEL_HINT}`);
  }
  if (JSON.stringify(doc.featureNames) !== JSON.stringify(GAZE_FEATURE_NAMES)) {
    return fail(`The model's feature list does not match this app's ${GAZE_FEATURE_COUNT} features (${GAZE_FEATURE_NAMES.join(", ")}). The file may have been edited.`);
  }
  const params = doc.params;
  if (!params || typeof params !== "object") {
    return fail("The model file has no params section.");
  }
  if (!BASES.includes(params.basis)) {
    return fail(`Unknown params.basis ${JSON.stringify(params.basis)} (expected one of ${BASES.join(", ")}).`);
  }
  const width = expandFeatures(Array.from({ length: GAZE_FEATURE_COUNT }, () => 0), params.basis).length;
  for (const name of ["mean", "std", "weightsX", "weightsY"]) {
    const problem = checkArray(params[name], width, name);
    if (problem) return fail(`The model parameters are damaged: ${problem}.`);
  }
  for (const name of ["biasX", "biasY"]) {
    if (!Number.isFinite(params[name])) return fail(`The model parameters are damaged: params.${name} is not a finite number.`);
  }
  const zeroStd = params.std.findIndex((value) => !(value > 0));
  if (zeroStd >= 0) {
    return fail(`The model parameters are damaged: params.std[${zeroStd}] must be positive.`);
  }
  const viewport = doc.calibration?.viewport;
  if (!(viewport?.width > 0) || !(viewport?.height > 0)) {
    return fail("The model does not record the screen size it was calibrated on (calibration.viewport).");
  }
  return { ok: true, message: "Model is valid." };
}
