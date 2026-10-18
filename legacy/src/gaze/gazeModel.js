// src/gaze/gazeModel.js

import * as tf from "@tensorflow/tfjs";
import {
  GAZE_FEATURE_COUNT,
  GAZE_FEATURE_NAMES,
  GAZE_FEATURE_RANGES,
  GAZE_FEATURE_VERSION,
  validateFeatureVector,
} from "./featureExtractor.js";
import {
  ACTION_TARGET_COUNT,
  GAZE_MODEL_VERSION,
  LETTER_TARGET_COUNT,
  SAMPLES_PER_TARGET,
  TOTAL_CALIBRATION_TARGET_COUNT,
} from "./calibrationConfig.js";
import { KEYBOARD_LAYOUT } from "./keyboardLayout.js";


// =====================================================
// GAZE MODEL CONFIGURATION
// =====================================================
//
// IMPORTANT:
//
// featureExtractor.js MUST return exactly 16 values.
//
// Input:
//   16 gaze features
//
// Output:
//   normalized X,Y
//
// X and Y are in the range:
//   0.0 → 1.0
//
// =====================================================

export { GAZE_FEATURE_COUNT };

export const GAZE_OUTPUT_COUNT = 2;
export const GAZE_MODEL_FORMAT = "gazespeak-personalized-gaze-model";
export const GAZE_MODEL_CONTRACT_VERSION = 1;
export const GAZE_MODEL_TFJS_FORMAT = "layers-model";
export const GAZE_INPUT_NORMALIZATION = "feature-extractor-ranges; no additional model normalization";
export const GAZE_OUTPUT_COORDINATE_SYSTEM = "normalized-viewport-top-left-origin-x-right-y-down";

const SUPPORTED_ARCHITECTURES = Object.freeze({
  "ridge-linear": [
    { className: "Dense", units: 2, activation: "sigmoid", inputShape: [null, GAZE_FEATURE_COUNT] },
  ],
  "small-neural-network": [
    { className: "Dense", units: 32, activation: "relu", inputShape: [null, GAZE_FEATURE_COUNT] },
    { className: "Dense", units: 16, activation: "relu", inputShape: null },
    { className: "Dense", units: GAZE_OUTPUT_COUNT, activation: "sigmoid", inputShape: null },
  ],
});

function getArchitectureSignature(model) {
  return model.layers.map((layer) => {
    const config = layer.getConfig();
    return {
      className: layer.getClassName(),
      units: config.units ?? null,
      activation: config.activation ?? null,
      inputShape: config.batchInputShape ?? null,
      useBias: config.useBias ?? null,
      kernelInitializer: config.kernelInitializer ?? null,
      biasInitializer: config.biasInitializer ?? null,
      kernelRegularizer: config.kernelRegularizer ?? null,
      biasRegularizer: config.biasRegularizer ?? null,
      activityRegularizer: config.activityRegularizer ?? null,
      kernelConstraint: config.kernelConstraint ?? null,
      biasConstraint: config.biasConstraint ?? null,
      trainable: config.trainable ?? null,
      dtype: config.dtype ?? null,
    };
  });
}

function getArchitectureId(signature) {
  const structure = signature.map(({ className, units, activation, inputShape }) => ({
    className,
    units,
    activation,
    inputShape,
  }));
  return Object.entries(SUPPORTED_ARCHITECTURES).find(([, expected]) =>
    sameJson(structure, expected)
  )?.[0] ?? null;
}

function getWeightSpecs(model) {
  return model.weights.map((weight) => ({
    name: weight.originalName ?? weight.name,
    shape: [...weight.shape],
    dtype: weight.dtype,
  }));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function setGazeModelMetadata(model, keyboardLayout, algorithm) {
  const architecture = getArchitectureSignature(model);
  const architectureId = getArchitectureId(architecture);
  if (!architectureId) {
    throw new Error("Cannot export an unsupported gaze-model architecture.");
  }

  const metadata = {
    format: GAZE_MODEL_FORMAT,
    contractVersion: GAZE_MODEL_CONTRACT_VERSION,
    modelVersion: GAZE_MODEL_VERSION,
    modelFormat: GAZE_MODEL_TFJS_FORMAT,
    tfjsLayersVersion: tf.version["tfjs-layers"],
    featureVersion: GAZE_FEATURE_VERSION,
    featureCount: GAZE_FEATURE_COUNT,
    outputCount: GAZE_OUTPUT_COUNT,
    featureNames: [...GAZE_FEATURE_NAMES],
    featureRanges: GAZE_FEATURE_RANGES.map((range) => [...range]),
    inputShape: [null, GAZE_FEATURE_COUNT],
    inputDtype: "float32",
    inputNormalization: GAZE_INPUT_NORMALIZATION,
    outputShape: [null, GAZE_OUTPUT_COUNT],
    outputDtype: "float32",
    outputActivation: "sigmoid",
    outputCoordinates: GAZE_OUTPUT_COORDINATE_SYSTEM,
    viewportMapping: "multiply normalized x/y by current viewport width/height once",
    architectureId,
    architecture,
    weightSpecs: getWeightSpecs(model),
    targetCount: TOTAL_CALIBRATION_TARGET_COUNT,
    letterTargetCount: LETTER_TARGET_COUNT,
    actionTargetCount: ACTION_TARGET_COUNT,
    samplesPerTarget: SAMPLES_PER_TARGET,
    algorithm,
    keyboardLayout,
  };

  model.setUserDefinedMetadata(metadata);
  return metadata;
}

export function validateGazeModelContract(model, keyboardLayout, options = {}) {
  const { requireMetadata = true } = options;

  if (!model) {
    return { ok: false, message: "No model instance was provided." };
  }

  const input = model.inputs?.[0];
  const output = model.outputs?.[0];
  const inputShape = input?.shape;
  const outputShape = output?.shape;

  if (!sameJson(inputShape, [null, GAZE_FEATURE_COUNT]) || input.dtype !== "float32") {
    return { ok: false, message: `Incompatible gaze model input. Expected float32 [null, ${GAZE_FEATURE_COUNT}]; received ${input?.dtype ?? "unknown"} ${JSON.stringify(inputShape)}.` };
  }
  if (!sameJson(outputShape, [null, GAZE_OUTPUT_COUNT]) || output.dtype !== "float32") {
    return { ok: false, message: `Incompatible gaze model output. Expected float32 [null, ${GAZE_OUTPUT_COUNT}]; received ${output?.dtype ?? "unknown"} ${JSON.stringify(outputShape)}.` };
  }

  const architecture = getArchitectureSignature(model);
  const architectureId = getArchitectureId(architecture);
  if (!architectureId || model.layers.at(-1)?.getConfig()?.activation !== "sigmoid") {
    return { ok: false, message: "Unsupported gaze model architecture. Use the current ridge-linear or small-neural-network trainer; BatchNormalization, Dropout, or unknown layers require a new reviewed contract." };
  }

  if (!requireMetadata) {
    return { ok: true, message: "Model shapes and supported architecture passed." };
  }

  const metadata = model.getUserDefinedMetadata?.() ?? {};
  const expectedWeightSpecs = getWeightSpecs(model);

  const checks = [
    metadata?.format === GAZE_MODEL_FORMAT,
    metadata?.contractVersion === GAZE_MODEL_CONTRACT_VERSION,
    metadata?.modelVersion === GAZE_MODEL_VERSION,
    metadata?.modelFormat === GAZE_MODEL_TFJS_FORMAT,
    metadata?.tfjsLayersVersion === tf.version["tfjs-layers"],
    metadata?.featureVersion === GAZE_FEATURE_VERSION,
    metadata?.featureCount === GAZE_FEATURE_COUNT,
    sameJson(metadata?.featureNames, GAZE_FEATURE_NAMES),
    sameJson(metadata?.featureRanges, GAZE_FEATURE_RANGES),
    sameJson(metadata?.inputShape, [null, GAZE_FEATURE_COUNT]),
    metadata?.inputDtype === "float32",
    metadata?.inputNormalization === GAZE_INPUT_NORMALIZATION,
    sameJson(metadata?.outputShape, [null, GAZE_OUTPUT_COUNT]),
    metadata?.outputDtype === "float32",
    metadata?.outputActivation === "sigmoid",
    metadata?.outputCoordinates === GAZE_OUTPUT_COORDINATE_SYSTEM,
    metadata?.viewportMapping === "multiply normalized x/y by current viewport width/height once",
    metadata?.architectureId === architectureId,
    sameJson(metadata?.architecture, architecture),
    sameJson(metadata?.weightSpecs, expectedWeightSpecs),
    metadata?.outputCount === GAZE_OUTPUT_COUNT,
    metadata?.targetCount === TOTAL_CALIBRATION_TARGET_COUNT,
    metadata?.letterTargetCount === LETTER_TARGET_COUNT,
    metadata?.actionTargetCount === ACTION_TARGET_COUNT,
    metadata?.samplesPerTarget === SAMPLES_PER_TARGET,
    sameJson(metadata?.keyboardLayout ?? null, keyboardLayout ?? null),
  ];

  if (checks.every(Boolean)) {
    return { ok: true, message: "Model contract passed.", metadata };
  }

  return {
    ok: false,
    message: "The deployed model is missing or fails the GazeSpeak v3 contract (architecture, feature order/ranges, viewport output semantics, TFJS version, weights, or keyboard layout). Do not edit metadata to relabel it; train and export a validated model with the current trainer.",
    metadata,
  };
}


// =====================================================
// MODEL ARCHITECTURE
// =====================================================
//
// 16 → 32 ReLU → 16 ReLU → 2 Sigmoid
//
// This is intentionally kept compact because the
// personalized calibration dataset is relatively small.
//
// This remains small relative to the personalized dataset.
//
// =====================================================

export function createGazeModel() {

  const model =
    tf.sequential();


  // ---------------------------------------------------
  // Input → 32
  // ---------------------------------------------------

  model.add(
    tf.layers.dense({

      inputShape: [
        GAZE_FEATURE_COUNT,
      ],

      units: 32,

      activation: "relu",

      kernelInitializer:
        "heNormal",

      biasInitializer:
        "zeros",

    })
  );


  // ---------------------------------------------------
  // 32 → 16
  // ---------------------------------------------------

  model.add(
    tf.layers.dense({

      units: 16,

      activation: "relu",

      kernelInitializer:
        "heNormal",

      biasInitializer:
        "zeros",

    })
  );


  // ---------------------------------------------------
  // 16 → X,Y
  // ---------------------------------------------------
  //
  // Sigmoid guarantees:
  //
  // X ∈ [0,1]
  // Y ∈ [0,1]
  //
  // ---------------------------------------------------

  model.add(
    tf.layers.dense({

      units:
        GAZE_OUTPUT_COUNT,

      activation:
        "sigmoid",

      kernelInitializer:
        "glorotUniform",

      biasInitializer:
        "zeros",

    })
  );


  // ---------------------------------------------------
  // Compile
  // ---------------------------------------------------

  model.compile({

    optimizer:
      tf.train.adam(
        0.001
      ),

    loss: (actual, predicted) =>
      tf.losses.huberLoss(actual, predicted, 0.08),

    metrics: [
      "mse",
    ],

  });


  return model;

}

export function createRidgeGazeModel() {
  const model = tf.sequential();

  model.add(
    tf.layers.dense({
      inputShape: [GAZE_FEATURE_COUNT],
      units: GAZE_OUTPUT_COUNT,
      activation: "sigmoid",
      kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
      kernelInitializer: "glorotUniform",
      biasInitializer: "zeros",
    })
  );

  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: (actual, predicted) =>
      tf.losses.huberLoss(actual, predicted, 0.08),
  });

  return model;
}


// =====================================================
// TRAIN MODEL
// =====================================================
//
// The trainer supplies its training block directly and
// evaluates its separate held-out block outside this function.
//
// =====================================================

export async function trainGazeModel(

  model,

  features,

  targets,

  onProgress

) {

  // ---------------------------------------------------
  // Safety checks
  // ---------------------------------------------------

  if (
    !model
  ) {

    throw new Error(
      "Cannot train: model is missing."
    );

  }


  if (
    !Array.isArray(features) ||
    features.length === 0
  ) {

    throw new Error(
      "Cannot train: feature dataset is empty."
    );

  }


  if (
    !Array.isArray(targets) ||
    targets.length === 0
  ) {

    throw new Error(
      "Cannot train: target dataset is empty."
    );

  }


  if (
    features.length !==
    targets.length
  ) {

    throw new Error(

      `Feature/target mismatch: ${features.length} features but ${targets.length} targets.`

    );

  }


  // ---------------------------------------------------
  // Verify feature dimensions
  // ---------------------------------------------------

  features.forEach(
    (
      feature,
      index
    ) => {

      if (
        !Array.isArray(feature)
      ) {

        throw new Error(

          `Training feature ${index + 1} is not an array.`

        );

      }


      if (
        feature.length !==
        GAZE_FEATURE_COUNT
      ) {

        throw new Error(

          `Training feature ${index + 1} contains ${feature.length} values. ` +

          `Expected exactly ${GAZE_FEATURE_COUNT}.`

        );

      }


      feature.forEach(
        (
          value
        ) => {

          if (
            typeof value !==
              "number" ||

            !Number.isFinite(
              value
            )
          ) {

            throw new Error(

              `Invalid feature value at training sample ${index + 1}.`

            );

          }

        }
      );

    }
  );


  // ---------------------------------------------------
  // Verify target dimensions
  // ---------------------------------------------------

  targets.forEach(
    (
      target,
      index
    ) => {

      if (
        !Array.isArray(target) ||
        target.length !== 2
      ) {

        throw new Error(

          `Training target ${index + 1} must contain [x,y].`

        );

      }


      target.forEach(
        (
          value
        ) => {

          if (
            typeof value !==
              "number" ||

            !Number.isFinite(
              value
            )
          ) {

            throw new Error(

              `Invalid target value at training sample ${index + 1}.`

            );

          }


          if (
            value < 0 ||
            value > 1
          ) {

            throw new Error(

              `Target coordinate must be between 0 and 1. ` +

              `Received ${value}.`

            );

          }

        }
      );

    }
  );


  // ---------------------------------------------------
  // Tensor creation
  // ---------------------------------------------------

  const xs =
    tf.tensor2d(

      features,

      [
        features.length,
        GAZE_FEATURE_COUNT,
      ],

      "float32"

    );


  const ys =
    tf.tensor2d(

      targets,

      [
        targets.length,
        GAZE_OUTPUT_COUNT,
      ],

      "float32"

    );


  console.log(
    "========================================"
  );

  console.log(
    "GAZE MODEL TRAINING"
  );

  console.log(
    "Input samples:",
    features.length
  );

  console.log(
    "Input features:",
    GAZE_FEATURE_COUNT
  );

  console.log(
    "Output values:",
    GAZE_OUTPUT_COUNT
  );

  console.log(
    "========================================"
  );


  // ---------------------------------------------------
  // Train
  // ---------------------------------------------------
  //
  // 180 epochs is used as a bounded starting point.
  //
  // Because this is a small personalized dataset,
  // we don't blindly increase the network size.
  //
  // ---------------------------------------------------

  const history =
    await model.fit(

      xs,

      ys,

      {

        epochs:
          180,

        batchSize:
          16,

        shuffle:
          true,

        validationSplit:
          0,

        verbose:
          0,

        callbacks: {

          onEpochEnd:
            async (
              epoch,
              logs
            ) => {

              const currentLoss =
                Number(
                  logs?.loss ?? 0
                );


              if (
                onProgress
              ) {

                onProgress({

                  epoch:
                    epoch + 1,

                  loss:
                    currentLoss,

                });

              }


              if (
                epoch === 0 ||
                (epoch + 1) % 25 === 0
              ) {

                console.log(

                  `GAZE TRAINING → Epoch ${epoch + 1} → loss ${currentLoss.toFixed(8)}`

                );

              }


              // Keep browser responsive.
              await tf.nextFrame();

            },

        },

      }

    );


  // ---------------------------------------------------
  // Dispose training tensors
  // ---------------------------------------------------

  xs.dispose();

  ys.dispose();


  console.log(
    "GAZE MODEL → Training complete"
  );


  return history;

}


// =====================================================
// PREDICT GAZE
// =====================================================
//
// Input:
//   16 features
//
// Output:
//   normalized x,y
//
// =====================================================

export function predictGaze(model, features) {
  if (!model) {
    throw new Error("Cannot predict: model is missing.");
  }
  if (!validateFeatureVector(features)) {
    throw new Error(`Prediction requires ${GAZE_FEATURE_COUNT} finite features within the declared feature ranges.`);
  }

  const input = tf.tensor2d([features], [1, GAZE_FEATURE_COUNT], "float32");
  let prediction;
  try {
    prediction = model.predict(input);
    const tensor = Array.isArray(prediction) ? prediction[0] : prediction;
    if (!tensor || !sameJson(tensor.shape, [1, GAZE_OUTPUT_COUNT])) {
      throw new Error(`Prediction must have shape [1, ${GAZE_OUTPUT_COUNT}].`);
    }

    const values = Array.from(tensor.dataSync());
    if (values.length !== GAZE_OUTPUT_COUNT || !values.every(Number.isFinite)) {
      throw new Error("Prediction must contain exactly two finite coordinates.");
    }
    if (values.some((value) => value < 0 || value > 1)) {
      throw new Error("Prediction coordinates must be normalized to the [0, 1] viewport range.");
    }
    return { x: values[0], y: values[1] };
  } finally {
    input.dispose();
    if (Array.isArray(prediction)) {
      prediction.forEach((tensor) => tensor.dispose());
    } else {
      prediction?.dispose();
    }
  }
}

export async function loadValidatedGazeModel(source, keyboardLayout = KEYBOARD_LAYOUT) {
  let model;
  try {
    model = await tf.loadLayersModel(source);
  } catch (error) {
    throw new Error(`Could not load the gaze model or its weight shards: ${error?.message || String(error)}`);
  }

  try {
    const contract = validateGazeModelContract(model, keyboardLayout);
    if (!contract.ok) {
      throw new Error(contract.message);
    }
    predictGaze(model, GAZE_FEATURE_RANGES.map(([minimum, maximum]) => (minimum + maximum) / 2));
    return model;
  } catch (error) {
    model.dispose();
    throw error;
  }
}

export async function validateGazeModelExport(model, keyboardLayout = KEYBOARD_LAYOUT) {
  const contract = validateGazeModelContract(model, keyboardLayout);
  if (!contract.ok) {
    throw new Error(`Cannot export an incompatible gaze model: ${contract.message}`);
  }

  let artifacts;
  await model.save(tf.io.withSaveHandler(async (modelArtifacts) => {
    artifacts = modelArtifacts;
    return { modelArtifactsInfo: tf.io.getModelArtifactsInfoForJSON(modelArtifacts) };
  }));

  if (!artifacts?.modelTopology || !artifacts.weightSpecs?.length || !artifacts.weightData) {
    throw new Error("Exported model is missing topology, weight specs, or weight data.");
  }
  const expectedWeightBytes = artifacts.weightSpecs.reduce((total, spec) =>
    total + spec.shape.reduce((size, dimension) => size * dimension, 1) * 4, 0
  );
  if (artifacts.weightData.byteLength !== expectedWeightBytes) {
    throw new Error(`Exported weight data length mismatch: expected ${expectedWeightBytes} bytes, received ${artifacts.weightData.byteLength}.`);
  }

  let reloadedModel;
  try {
    reloadedModel = await tf.loadLayersModel(tf.io.fromMemory(artifacts));
    const reloadedContract = validateGazeModelContract(reloadedModel, keyboardLayout);
    if (!reloadedContract.ok) {
      throw new Error(`Exported model failed contract validation: ${reloadedContract.message}`);
    }

    let maximumAbsoluteDifference = 0;
    for (let sample = 0; sample < 8; sample++) {
      const features = GAZE_FEATURE_RANGES.map(([minimum, maximum], index) => {
        const fraction = ((sample * 5 + index * 3) % 11) / 10;
        return minimum + (maximum - minimum) * fraction;
      });
      const before = predictGaze(model, features);
      const after = predictGaze(reloadedModel, features);
      maximumAbsoluteDifference = Math.max(
        maximumAbsoluteDifference,
        Math.abs(before.x - after.x),
        Math.abs(before.y - after.y)
      );
    }
    if (maximumAbsoluteDifference > 1e-5) {
      throw new Error(`Exported-model prediction drift ${maximumAbsoluteDifference} exceeds tolerance 1e-5.`);
    }

    return {
      maximumAbsoluteDifference,
      tolerance: 1e-5,
      weightSpecs: artifacts.weightSpecs.length,
      weightBytes: artifacts.weightData.byteLength,
    };
  } finally {
    reloadedModel?.dispose();
  }
}


// =====================================================
// DOWNLOAD MODEL
// =====================================================
//
// Downloads:
//
// gaze-model.json
// gaze-model.weights.bin
//
// =====================================================

export async function downloadGazeModel(
  model,
  keyboardLayout = KEYBOARD_LAYOUT
) {

  if (
    !model
  ) {

    throw new Error(
      "Cannot download: model is missing."
    );

  }


  const validation = await validateGazeModelExport(model, keyboardLayout);
  const exportName = `gazespeak-gaze-v${GAZE_MODEL_VERSION}`;
  await model.save(`downloads://${exportName}`);
  return { ...validation, exportName };

}