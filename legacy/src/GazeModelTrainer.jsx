// src/GazeModelTrainer.jsx

import { useEffect, useState } from "react";
import * as tf from "@tensorflow/tfjs";

import {
  extractGazeFeatures,
  GAZE_FEATURE_COUNT,
  GAZE_FEATURE_VERSION,
} from "./gaze/featureExtractor";

import {
  createGazeModel,
  createRidgeGazeModel,
  trainGazeModel,
  predictGaze,
  downloadGazeModel,
  setGazeModelMetadata,
  GAZE_OUTPUT_COUNT,
} from "./gaze/gazeModel";
import {
  KEYBOARD_LAYOUT,
  LETTERS,
  createCalibrationTargets,
} from "./gaze/keyboardLayout";
import {
  ACTION_TARGET_COUNT,
  TOTAL_CALIBRATION_TARGET_COUNT,
  EXPECTED_ACTION_SAMPLE_COUNT,
  EXPECTED_LETTER_SAMPLE_COUNT,
  EXPECTED_TOTAL_SAMPLE_COUNT,
  LETTER_TARGET_COUNT,
  SAMPLES_PER_TARGET,
  TRAINING_SAMPLES_PER_TARGET,
  VALIDATION_SAMPLES_PER_TARGET,
} from "./gaze/calibrationConfig";
import { loadCalibrationDataset } from "./gaze/calibrationStorage";

// ============================================================
// CONFIGURATION
// ============================================================

const TOTAL_POINTS = TOTAL_CALIBRATION_TARGET_COUNT;
const SAMPLES_PER_POINT = SAMPLES_PER_TARGET;

const TRAINING_PER_POINT = TRAINING_SAMPLES_PER_TARGET;
const VALIDATION_PER_POINT = VALIDATION_SAMPLES_PER_TARGET;

const TOTAL_TRAINING =
  TOTAL_POINTS * TRAINING_PER_POINT;

const TOTAL_VALIDATION =
  TOTAL_POINTS * VALIDATION_PER_POINT;

// Augmentation is confined to the training block.
const AUGMENTATION_COPIES = 2;
const AUGMENTATION_NOISE = 0.008;

// ============================================================
// KEYBOARD CONFIGURATION
//
// This is also exported to GazeDemo.
//
// 6 columns x 5 rows:
//
// A B C D E F
// G H I J K L
// M N O P Q R
// S T U V W X
// Y Z
//
// Space is NOT a trained class.
// ============================================================

const KEYBOARD_CONFIG = {
  ...KEYBOARD_LAYOUT,
  letters: LETTERS,
  targets: createCalibrationTargets(),
};

// ============================================================
// CREATE DEFAULT TARGETS
// ============================================================

function createDefaultTargets() {
  return createCalibrationTargets().map((target, index) => ({
    ...target,
    index,
    letter: target.id,
  }));
}

const DEFAULT_TARGETS =
  createDefaultTargets();

// ============================================================
// HELPERS
// ============================================================

function isFiniteNumber(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

function clamp(
  value,
  min = 0,
  max = 1
) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(
    min,
    Math.min(max, value)
  );
}

function distance(
  x1,
  y1,
  x2,
  y2
) {
  return Math.sqrt(
    Math.pow(x1 - x2, 2) +
      Math.pow(y1 - y2, 2)
  );
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function isValidFeatureVector(
  features
) {
  return (
    Array.isArray(features) &&
    features.length ===
      GAZE_FEATURE_COUNT &&
    features.every(
      isFiniteNumber
    )
  );
}

// ============================================================
// FISHER-YATES SHUFFLE
// ============================================================

function shuffle(array) {
  const result = [...array];

  for (
    let i = result.length - 1;
    i > 0;
    i--
  ) {
    const j =
      Math.floor(
        Math.random() * (i + 1)
      );

    [
      result[i],
      result[j],
    ] = [
      result[j],
      result[i],
    ];
  }

  return result;
}

// ============================================================
// GAUSSIAN RANDOM
// ============================================================

function gaussianRandom() {
  let u = 0;
  let v = 0;

  while (u === 0) {
    u = Math.random();
  }

  while (v === 0) {
    v = Math.random();
  }

  return (
    Math.sqrt(
      -2 *
        Math.log(u)
    ) *
    Math.cos(
      2 *
        Math.PI *
        v
    )
  );
}

// ============================================================
// AUGMENT FEATURE VECTOR
// ============================================================

function augmentFeatures(
  features
) {
  return features.map(
    (value) => {
      const noise =
        gaussianRandom() *
        AUGMENTATION_NOISE;

      return clamp(
        value + noise
      );
    }
  );
}

// ============================================================
// GET CALIBRATION TARGETS
//
// IMPORTANT:
// Calibration data is the source of truth.
//
// If GazeCalibration generated slightly different
// coordinates, those coordinates are used here.
// ============================================================

function buildTargetsFromCalibration(
  calibrationData
) {
  return calibrationData.map(
    (pointData, index) => {
      const fallback =
        DEFAULT_TARGETS[index];

      const x =
        isFiniteNumber(
          pointData?.target?.x
        )
          ? pointData.target.x
          : fallback.x;

      const y =
        isFiniteNumber(
          pointData?.target?.y
        )
          ? pointData.target.y
          : fallback.y;

      return {
        ...fallback,
        index,
        letter: fallback.id,
        x,
        y,
      };
    }
  );
}

// ============================================================
// FIND NEAREST LETTER
// ============================================================

function getNearestLetter(
  x,
  y,
  targets
) {
  let nearest = null;
  let nearestDistance =
    Infinity;

  for (
    const target of targets
  ) {
    const d =
      distance(
        x,
        y,
        target.x,
        target.y
      );

    if (
      d < nearestDistance
    ) {
      nearestDistance = d;
      nearest = target;
    }
  }

  return {
    target: nearest,
    distance:
      nearestDistance,
  };
}

// ============================================================
// COMPONENT
// ============================================================

export default function GazeModelTrainer({ onBack }) {
  const [
    calibrationData,
    setCalibrationData,
  ] = useState(null);

  const [
    keyboardTargets,
    setKeyboardTargets,
  ] = useState(
    DEFAULT_TARGETS
  );

  const [
    status,
    setStatus,
  ] = useState(
    "Waiting for compatible calibration data..."
  );

  const [
    training,
    setTraining,
  ] = useState(false);

  const [
    trained,
    setTrained,
  ] = useState(false);

  const [
    epoch,
    setEpoch,
  ] = useState(0);

  const [
    loss,
    setLoss,
  ] = useState(null);

  const [
    model,
    setModel,
  ] = useState(null);

  const [
    results,
    setResults,
  ] = useState([]);

  const [
    datasetInfo,
    setDatasetInfo,
  ] = useState(null);

  // ==========================================================
  // RECEIVE CALIBRATION
  // ==========================================================

  useEffect(() => {
    const receiveCalibration = (
      event
    ) => {
      const data =
        event?.detail;

      if (
        !Array.isArray(data)
      ) {
        console.error(
          "TRAINER → Invalid calibration data"
        );

        return;
      }

      if (
        data.length !==
        TOTAL_POINTS
      ) {
        console.error(
          `TRAINER → Expected ${TOTAL_POINTS} points, received ${data.length}`
        );

        setStatus(
          `Invalid calibration: ${data.length}/${TOTAL_POINTS} points`
        );

        return;
      }

      const calibrationMetadata = window.gazeCalibrationMetadata;
      if (
        calibrationMetadata?.format !== "gazespeak-calibration" ||
        calibrationMetadata?.featureVersion !== GAZE_FEATURE_VERSION ||
        calibrationMetadata?.featureCount !== GAZE_FEATURE_COUNT ||
        calibrationMetadata?.targetCount !== TOTAL_POINTS ||
        calibrationMetadata?.letterTargetCount !== LETTER_TARGET_COUNT ||
        calibrationMetadata?.actionTargetCount !== ACTION_TARGET_COUNT ||
        calibrationMetadata?.samplesPerTarget !== SAMPLES_PER_TARGET ||
        calibrationMetadata?.expectedLetterSamples !== EXPECTED_LETTER_SAMPLE_COUNT ||
        calibrationMetadata?.expectedActionSamples !== EXPECTED_ACTION_SAMPLE_COUNT ||
        calibrationMetadata?.expectedTotalSamples !== EXPECTED_TOTAL_SAMPLE_COUNT ||
        JSON.stringify(calibrationMetadata?.targetIds) !== JSON.stringify(createCalibrationTargets().map((target) => target.id)) ||
        JSON.stringify(calibrationMetadata?.keyboardLayout) !== JSON.stringify(KEYBOARD_LAYOUT)
      ) {
        setStatus("Calibration metadata is missing or incompatible. Collect a new 50-sample dataset for A-Z, Space, and Alert.");
        return;
      }

      const expectedTargets = createCalibrationTargets();
      const invalidTargetIndex = data.findIndex((point, index) => {
        const expected = expectedTargets[index];
        const samples = Array.isArray(point?.features) ? point.features : point?.landmarks;
        return (point?.id ?? point?.target?.id) !== expected.id ||
          point?.target?.type !== expected.type ||
          !Array.isArray(samples) ||
          samples.length !== SAMPLES_PER_TARGET ||
          !isFiniteNumber(point?.target?.x) ||
          !isFiniteNumber(point?.target?.y) ||
          Math.abs(point.target.x - expected.x) > 0.001 ||
          Math.abs(point.target.y - expected.y) > 0.001;
      });
      if (invalidTargetIndex !== -1) {
        setStatus(`Calibration target ${invalidTargetIndex + 1} is incomplete or incompatible. Every target requires exactly ${SAMPLES_PER_TARGET} valid samples.`);
        return;
      }

      console.log(
        "TRAINER → Calibration received:",
        data
      );

      const targets =
        buildTargetsFromCalibration(
          data
        );

      console.log(
        "TRAINER → Using calibration targets:",
        targets
      );

      setCalibrationData(
        data
      );

      setKeyboardTargets(
        targets
      );

      setTrained(false);
      setModel(null);
      setResults([]);
      setDatasetInfo(null);

      setStatus(
        `Calibration received: ${LETTER_TARGET_COUNT} letters and ${ACTION_TARGET_COUNT} action targets`
      );
    };

    window.addEventListener(
      "gaze-calibration-complete",
      receiveCalibration
    );

    // Calibration may already exist
    // before this component mounts.
    if (
      Array.isArray(
        window.gazeCalibrationData
      )
    ) {
      receiveCalibration({
        detail:
          window.gazeCalibrationData,
      });
    } else {
      const savedDataset = loadCalibrationDataset();
      if (savedDataset) {
        window.gazeCalibrationData = savedDataset.samples;
        window.gazeCalibrationMetadata = savedDataset.metadata;
        receiveCalibration({ detail: savedDataset.samples });
      }
    }

    return () => {
      window.removeEventListener(
        "gaze-calibration-complete",
        receiveCalibration
      );
    };
  }, []);

  // ==========================================================
  // PREPARE DATASET
  // ==========================================================

  const prepareDataset = () => {
    if (
      !Array.isArray(
        calibrationData
      )
    ) {
      throw new Error(
        "No calibration data available."
      );
    }

    if (
      calibrationData.length !==
      TOTAL_POINTS
    ) {
      throw new Error(
        `Expected ${TOTAL_POINTS} calibration points, received ${calibrationData.length}.`
      );
    }

    const pointDatasets = [];

    // ========================================================
    // PROCESS EACH LETTER
    // ========================================================

    calibrationData.forEach(
      (
        pointData,
        pointIndex
      ) => {
        const target =
          keyboardTargets[
            pointIndex
          ];

        const letter =
          pointData.id ??
          pointData.target?.id ??
          LETTERS[pointIndex];

        if (!pointData) {
          throw new Error(
            `Missing calibration data for ${letter}.`
          );
        }

        const pointSamples =
          Array.isArray(pointData.features)
            ? pointData.features
            : pointData.landmarks;

        if (!Array.isArray(pointSamples)) {
          throw new Error(
            `Target ${letter} has no feature or landmark samples.`
          );
        }

        if (pointSamples.length < SAMPLES_PER_POINT) {
          throw new Error(
            `Target ${letter} has only ${pointSamples.length} samples. Expected ${SAMPLES_PER_POINT}.`
          );
        }

        if (
          !target ||
          target.letter !== letter ||
          !isFiniteNumber(
            target.x
          ) ||
          !isFiniteNumber(
            target.y
          )
        ) {
          throw new Error(
            `Target ${letter} has invalid coordinates.`
          );
        }

        const validSamples = [];

        // ====================================================
        // EXTRACT FEATURES
        // ====================================================

        pointSamples
          .slice(
            0,
            SAMPLES_PER_POINT
          )
          .forEach(
            (
              sample,
              sampleIndex
            ) => {
              try {
                const features =
                  Array.isArray(pointData.features)
                    ? sample
                    : extractGazeFeatures(sample);

                if (
                  !isValidFeatureVector(
                    features
                  )
                ) {
                  throw new Error(
                    `Expected ${GAZE_FEATURE_COUNT} finite features.`
                  );
                }

                validSamples.push({
                  features,
                  target: [
                    clamp(
                      target.x / 100
                    ),
                    clamp(
                      target.y / 100
                    ),
                  ],
                  letter,
                  type: pointData.type ?? pointData.target?.type ?? "letter",
                  point:
                    pointIndex + 1,
                  sample:
                    sampleIndex + 1,
                });
              } catch (
                error
              ) {
                console.error(
                  `FEATURE ERROR → ${letter} sample ${sampleIndex + 1}`,
                  error
                );
              }
            }
          );

        if (
          validSamples.length !==
          SAMPLES_PER_POINT
        ) {
          throw new Error(
            `Target ${letter} has ${validSamples.length} valid feature samples. Required ${SAMPLES_PER_POINT}.`
          );
        }

        // Keep capture order intact: validation is a later time block,
        // not a random sample of near-identical video frames.
        const training =
          validSamples.slice(
            0,
            TRAINING_PER_POINT
          );

        const validation =
          validSamples.slice(
            TRAINING_PER_POINT,
            SAMPLES_PER_POINT
          );

        pointDatasets.push({
          letter,
          point:
            pointIndex + 1,
          target: {
            x: target.x,
            y: target.y,
          },
          training,
          validation,
        });
      }
    );

    // ========================================================
    // COMBINE DATA
    // ========================================================

    let trainingSamples = [];
    let validationSamples = [];

    pointDatasets.forEach(
      (point) => {
        trainingSamples.push(
          ...point.training
        );

        validationSamples.push(
          ...point.validation
        );
      }
    );

    // Shuffle complete datasets.
    trainingSamples =
      shuffle(
        trainingSamples
      );

    // ========================================================
    // VERIFY DATASET
    // ========================================================

    if (
      trainingSamples.length !==
      TOTAL_TRAINING
    ) {
      throw new Error(
        `Training dataset has ${trainingSamples.length} samples. Expected ${TOTAL_TRAINING}.`
      );
    }

    if (
      validationSamples.length !==
      TOTAL_VALIDATION
    ) {
      throw new Error(
        `Validation dataset has ${validationSamples.length} samples. Expected ${TOTAL_VALIDATION}.`
      );
    }

    return {
      pointDatasets,
      trainingSamples,
      validationSamples,
    };
  };

  // ==========================================================
  // AUGMENT TRAINING DATA
  // ==========================================================

  const createAugmentedTrainingSet =
    (
      trainingSamples
    ) => {
      const augmented = [];

      trainingSamples.forEach(
        (sample) => {
          // Always keep original.
          augmented.push(
            sample
          );

          // Add controlled copies.
          for (
            let i = 0;
            i <
            AUGMENTATION_COPIES;
            i++
          ) {
            augmented.push({
              ...sample,

              features:
                augmentFeatures(
                  sample.features
                ),
            });
          }
        }
      );

      return shuffle(
        augmented
      );
    };

  // ==========================================================
  // VALIDATE MODEL
  // ==========================================================

  const validateModel = (
    trainedModel,
    validationSamples
  ) => {
    if (
      !trainedModel
    ) {
      throw new Error(
        "Model is not available."
      );
    }

    if (
      !validationSamples.length
    ) {
      throw new Error(
        "No validation samples available."
      );
    }

    const rows = [];
    const normalizedErrors = [];
    const targetErrors = new Map();

    let totalError = 0;
    let correctSelections = 0;

    // ========================================================
    // TEST EVERY UNSEEN SAMPLE
    // ========================================================

    for (
      const sample of
        validationSamples
    ) {
      const prediction =
        predictGaze(
          trainedModel,
          sample.features
        );

      if (
        !prediction ||
        !isFiniteNumber(
          prediction.x
        ) ||
        !isFiniteNumber(
          prediction.y
        )
      ) {
        throw new Error(
          "Model returned an invalid prediction."
        );
      }

      const px =
        clamp(
          prediction.x
        ) * 100;

      const py =
        clamp(
          prediction.y
        ) * 100;

      const tx =
        sample.target[0] *
        100;

      const ty =
        sample.target[1] *
        100;

      const error =
        distance(
          px,
          py,
          tx,
          ty
        );

      const normalizedError = error / (100 * Math.SQRT2);
      normalizedErrors.push(normalizedError);
      const errorsForTarget = targetErrors.get(sample.letter) || [];
      errorsForTarget.push(normalizedError);
      targetErrors.set(sample.letter, errorsForTarget);

      totalError +=
        error;

      // ======================================================
      // SAME TARGET MAPPING AS DEMO
      // ======================================================

      const nearest =
        getNearestLetter(
          px,
          py,
          keyboardTargets
        );

      const predictedLetter =
        nearest.target
          ?.letter || "-";

      const correct =
        predictedLetter ===
        sample.letter;

      if (correct) {
        correctSelections++;
      }

      rows.push({
        letter:
          sample.letter,

        targetX:
          tx,

        targetY:
          ty,

        predictedX:
          px,

        predictedY:
          py,

        error,
        normalizedError,

        predictedLetter,

        correct,
      });
    }

    const averageError =
      totalError /
      validationSamples.length;

    const accuracy =
      (
        correctSelections /
        validationSamples.length
      ) * 100;

    const meanNormalizedError =
      normalizedErrors.reduce((sum, value) => sum + value, 0) /
      normalizedErrors.length;

    const medianNormalizedError = median(normalizedErrors);

    const perTargetErrors = Array.from(targetErrors, ([letter, errors]) => ({
      letter,
      meanNormalizedError:
        errors.reduce((sum, value) => sum + value, 0) / errors.length,
      medianNormalizedError: median(errors),
      samples: errors.length,
    }));

    return {
      rows,
      averageError,
      meanNormalizedError,
      medianNormalizedError,
      perTargetErrors,
      accuracy,
    };
  };

  // ==========================================================
  // TRAIN
  // ==========================================================

  const handleTrain =
    async () => {
      if (training) {
        return;
      }

      if (
        !calibrationData
      ) {
        setStatus(
          "Complete calibration first."
        );

        return;
      }

      const candidateModels = [];

      try {
        setTraining(true);
        setTrained(false);
        setModel(null);
        setResults([]);
        setEpoch(0);
        setLoss(null);

        setStatus(
          "Preparing calibration dataset..."
        );

        // ====================================================
        // TENSORFLOW
        // ====================================================

        await tf.ready();

        console.log(
          "========================================"
        );

        console.log(
          "TENSORFLOW READY"
        );

        console.log(
          "Backend:",
          tf.getBackend()
        );

        console.log(
          "Feature count:",
          GAZE_FEATURE_COUNT
        );

        console.log(
          "========================================"
        );

        // ====================================================
        // DATASET
        // ====================================================

        const {
          pointDatasets,
          trainingSamples,
          validationSamples,
        } =
          prepareDataset();

        console.log(
          "DATASET → Points:",
          pointDatasets.length
        );

        console.log(
          "DATASET → Original training:",
          trainingSamples.length
        );

        console.log(
          "DATASET → Validation:",
          validationSamples.length
        );

        // ====================================================
        // AUGMENT TRAINING ONLY
        // ====================================================

        const augmentedTraining =
          createAugmentedTrainingSet(
            trainingSamples
          );

        console.log(
          "DATASET → Augmented training:",
          augmentedTraining.length
        );

        // ====================================================
        // DATASET INFO
        // ====================================================

        setDatasetInfo({
          points:
            pointDatasets.length,

          originalTraining:
            trainingSamples.length,

          training:
            augmentedTraining.length,

          validation:
            validationSamples.length,

          total:
            augmentedTraining.length +
            validationSamples.length,
        });

        // ====================================================
        // FINAL FEATURE VALIDATION
        // ====================================================

        augmentedTraining.forEach(
          (
            sample,
            index
          ) => {
            if (
              !isValidFeatureVector(
                sample.features
              )
            ) {
              throw new Error(
                `Training sample ${index + 1} contains an invalid feature vector.`
              );
            }
          }
        );

        // ====================================================
        // TRAINING ARRAYS
        // ====================================================

        const trainingFeatures =
          augmentedTraining.map(
            (sample) =>
              sample.features
          );

        const trainingTargets =
          augmentedTraining.map(
            (sample) =>
              sample.target
          );

        const candidateDefinitions = [
          {
            name: "ridge-linear",
            create: createRidgeGazeModel,
          },
          {
            name: "small-neural-network",
            create: createGazeModel,
          },
        ];

        for (const candidateDefinition of candidateDefinitions) {
          const candidate = {
            name: candidateDefinition.name,
            model: candidateDefinition.create(),
          };
          candidateModels.push(candidate);

          setStatus(`Training ${candidate.name} on the same chronological training split...`);
          setEpoch(0);
          setLoss(null);

          await trainGazeModel(
            candidate.model,
            trainingFeatures,
            trainingTargets,
            ({ epoch: currentEpoch, loss: currentLoss }) => {
              setEpoch(currentEpoch);
              setLoss(currentLoss);
            }
          );

          candidate.validation = validateModel(candidate.model, validationSamples);
        }

        candidateModels.sort((left, right) =>
          right.validation.accuracy - left.validation.accuracy ||
          left.validation.medianNormalizedError - right.validation.medianNormalizedError
        );

        const selectedCandidate = candidateModels[0];
        const newModel = selectedCandidate.model;
        const validation = selectedCandidate.validation;

        candidateModels
          .filter((candidate) => candidate !== selectedCandidate)
          .forEach((candidate) => candidate.model.dispose());

        setGazeModelMetadata(newModel, KEYBOARD_LAYOUT, selectedCandidate.name);

        console.log("VALIDATION → Selected model:", selectedCandidate.name);
        console.log("VALIDATION → Mean normalized coordinate error:", validation.meanNormalizedError);
        console.log("VALIDATION → Median normalized coordinate error:", validation.medianNormalizedError);
        console.log("VALIDATION → Held-out nearest-target accuracy:", validation.accuracy);

        // ====================================================
        // RESULTS
        // ====================================================

        setResults(
          validation.rows
        );

        setDatasetInfo(
          (previous) => ({
            ...previous,

            averageError:
              validation.averageError,

            meanNormalizedError:
              validation.meanNormalizedError,

            medianNormalizedError:
              validation.medianNormalizedError,

            perTargetErrors:
              validation.perTargetErrors,

            algorithm:
              selectedCandidate.name,

            accuracy:
              validation.accuracy,
          })
        );

        // ====================================================
        // SAVE MODEL
        // ====================================================

        setModel(
          newModel
        );

        setTrained(
          true
        );

        // ====================================================
        // EXPORT CONFIGURATION
        // ====================================================

        const exportedConfig = {
          version: 5,

          type:
            "26-letter-gaze-keyboard-with-actions",

          featureCount:
            GAZE_FEATURE_COUNT,

          featureVersion:
            GAZE_FEATURE_VERSION,

          outputCount:
            GAZE_OUTPUT_COUNT,

          algorithm:
            selectedCandidate.name,

          keyboardLayout:
            KEYBOARD_LAYOUT,

          letters:
            LETTERS,

          keyboard:
            KEYBOARD_CONFIG,

          targets:
            keyboardTargets,

          training: {
            points:
              TOTAL_POINTS,

            letterTargets:
              LETTER_TARGET_COUNT,

            actionTargets:
              ACTION_TARGET_COUNT,

            samplesPerPoint:
              SAMPLES_PER_POINT,

            originalTrainingPerPoint:
              TRAINING_PER_POINT,

            validationPerPoint:
              VALIDATION_PER_POINT,

            augmentationCopies:
              AUGMENTATION_COPIES,

            originalTraining:
              trainingSamples.length,

            expectedLetterSamples:
              EXPECTED_LETTER_SAMPLE_COUNT,

            expectedActionSamples:
              EXPECTED_ACTION_SAMPLE_COUNT,

            expectedTotalSamples:
              EXPECTED_TOTAL_SAMPLE_COUNT,

            augmentedTraining:
              augmentedTraining.length,

            totalValidation:
              validationSamples.length,
          },

          validation: {
            averageCoordinateError:
              validation.averageError,

            meanNormalizedCoordinateError:
              validation.meanNormalizedError,

            medianNormalizedCoordinateError:
              validation.medianNormalizedError,

            perTargetErrors:
              validation.perTargetErrors,

            nearestTargetAccuracy:
              validation.accuracy,
          },

          space: {
            trained: false,
            action:
              "UI_SPACE_ACTION",
            geometry:
              KEYBOARD_CONFIG.space,
          },

          alert: {
            trainedAsCoordinateTarget: true,
            backend: "local-demo-only",
            geometry: KEYBOARD_CONFIG.alert,
          },

          note:
            "A-Z targets remain separate from the explicit Space and Alert calibration targets. Alert is a local demonstration only.",
        };

        // ====================================================
        // GLOBAL CONFIG
        // ====================================================

        window.gazeKeyboardConfig =
          exportedConfig;

        // ====================================================
        // SAVE LOCAL STORAGE
        // ====================================================

        localStorage.setItem(
          "gazeKeyboardConfig",
          JSON.stringify(
            exportedConfig
          )
        );

        // ====================================================
        // DISPATCH EVENT
        // ====================================================

        window.dispatchEvent(
          new CustomEvent(
            "gaze-keyboard-config-ready",
            {
              detail:
                exportedConfig,
            }
          )
        );

        console.log(
          "TRAINER → Keyboard configuration exported"
        );

        console.log(
          "TRAINER → Space remains a UI action"
        );

        console.log(
          "========================================"
        );

        console.log(
          "TRAINING COMPLETE"
        );

        console.log(
          "Coordinate error:",
          validation.averageError.toFixed(
            2
          ) + "%"
        );

        console.log(
          "Nearest-target accuracy:",
          validation.accuracy.toFixed(
            2
          ) + "%"
        );

        console.log(
          "========================================"
        );

        setStatus(
          `Training complete — ${validation.accuracy.toFixed(
            2
          )}% held-out nearest-target accuracy`
        );
      } catch (
        error
      ) {
        candidateModels.forEach((candidate) => candidate.model.dispose());
        console.error(
          "========================================"
        );

        console.error(
          "GAZE MODEL TRAINING ERROR"
        );

        console.error(
          error
        );

        console.error(
          "========================================"
        );

        setStatus(
          `Training error: ${
            error?.message ||
            String(error)
          }`
        );
      } finally {
        setTraining(
          false
        );
      }
    };

  // ==========================================================
  // DOWNLOAD MODEL
  // ==========================================================

  const handleDownload =
    async () => {
      if (!model) {
        return;
      }

      try {
        setStatus(
          "Downloading model..."
        );

        await downloadGazeModel(
          model
        );

        setStatus(
          "Model downloaded successfully."
        );
      } catch (
        error
      ) {
        console.error(
          "MODEL DOWNLOAD ERROR:",
          error
        );

        setStatus(
          `Download error: ${
            error?.message ||
            String(error)
          }`
        );
      }
    };

  // ==========================================================
  // DOWNLOAD CSV
  // ==========================================================

  const downloadCSV = () => {
    if (
      results.length === 0
    ) {
      return;
    }

    const header = [
      "targetLabel",
      "targetType",
      "targetX",
      "targetY",
      "predictedX",
      "predictedY",
      "error",
      "predictedLetter",
      "correct",
    ].join(",");

    const rows =
      results.map(
        (row) =>
          [
            row.letter,
            row.type,

            row.targetX.toFixed(
              3
            ),

            row.targetY.toFixed(
              3
            ),

            row.predictedX.toFixed(
              3
            ),

            row.predictedY.toFixed(
              3
            ),

            row.error.toFixed(
              3
            ),

            row.predictedLetter,

            row.correct,
          ].join(",")
      );

    const csv = [
      header,
      ...rows,
    ].join("\n");

    const blob =
      new Blob(
        [csv],
        {
          type:
            "text/csv;charset=utf-8;",
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        "a"
      );

    link.href = url;

    link.download =
      "gazespeak-calibration-validation.csv";

    document.body.appendChild(
      link
    );

    link.click();

    link.remove();

    URL.revokeObjectURL(
      url
    );
  };

  // ==========================================================
  // UI VALUES
  // ==========================================================

  const accuracy =
    datasetInfo?.accuracy;

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div
      style={{
        minHeight:
          "100vh",

        background:
          "#111",

        color:
          "#fff",

        padding:
          "40px",

        boxSizing:
          "border-box",

        fontFamily:
          "Arial, sans-serif",
      }}
    >
      <button
        onClick={onBack}
        style={{
          padding: "8px 12px",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 8,
          background: "#222",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Home
      </button>
      <h1>
        GazeSpeak — Personalized Gaze Model
      </h1>

      <p
        style={{
          fontSize:
            "18px",
        }}
      >
        {status}
      </p>

      <hr />

      {/* =====================================================
          DATASET
      ===================================================== */}

      <div
        style={{
          marginTop:
            "30px",

          padding:
            "25px",

          background:
            "#222",

          borderRadius:
            "12px",

          maxWidth:
            "950px",
        }}
      >
        <h2>
          1. Calibration Dataset
        </h2>

        <p>
          Calibration points:{" "}
          <strong>
            {calibrationData?.length ||
              0}
            {" "}
            / {TOTAL_POINTS}
          </strong>
        </p>

        <p>
          Features per sample:{" "}
          <strong>
            {GAZE_FEATURE_COUNT}
          </strong>
        </p>

        <p>
          Samples per point:{" "}
          <strong>
            {SAMPLES_PER_POINT}
          </strong>
        </p>

        <p>
          Original training samples:{" "}
          <strong>
            {TOTAL_TRAINING}
          </strong>
        </p>

        <p>
          Validation samples:{" "}
          <strong>
            {TOTAL_VALIDATION}
          </strong>
        </p>

        {datasetInfo && (
          <>
            <p>
              Augmented training samples:{" "}
              <strong>
                {
                  datasetInfo.training
                }
              </strong>
            </p>

            <p>
              Validation samples:{" "}
              <strong>
                {
                  datasetInfo.validation
                }
              </strong>
            </p>
          </>
        )}
      </div>

      {/* =====================================================
          TRAIN
      ===================================================== */}

      <div
        style={{
          marginTop:
            "20px",

          padding:
            "25px",

          background:
            "#222",

          borderRadius:
            "12px",

          maxWidth:
            "950px",
        }}
      >
        <h2>
          2. Train Model
        </h2>

        <p>
          26 letters × {SAMPLES_PER_TARGET} samples = {EXPECTED_LETTER_SAMPLE_COUNT} letter samples.
        </p>

        <p>
          Space and Alert are two separately identified action targets, adding {EXPECTED_ACTION_SAMPLE_COUNT} samples. Total calibration data: {EXPECTED_TOTAL_SAMPLE_COUNT} samples.
        </p>

        <p>
          The first {TRAINING_PER_POINT} time-ordered samples per target train the models.
        </p>

        <p>
          The final {VALIDATION_PER_POINT} consecutive samples per target are held out. They are not randomly mixed with neighboring frames.
        </p>

        <p>
          Controlled augmentation is applied
          only to the training data.
        </p>

        <p>
          Space is handled separately by
          the keyboard UI.
        </p>

        <button
          onClick={
            handleTrain
          }
          disabled={
            !calibrationData ||
            training
          }
          style={{
            padding:
              "14px 24px",

            fontSize:
              "17px",

            cursor:
              calibrationData &&
              !training
                ? "pointer"
                : "not-allowed",
          }}
        >
          {training
            ? "Training..."
            : "Train 26-Point Gaze Model"}
        </button>

        {training && (
          <div
            style={{
              marginTop:
                "20px",
            }}
          >
            <div>
              Epoch:{" "}
              <strong>
                {epoch}
              </strong>
            </div>

            <div>
              Loss:{" "}
              <strong>
                {loss !== null
                  ? loss.toFixed(
                      6
                    )
                  : "-"}
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* =====================================================
          RESULTS
      ===================================================== */}

      {trained &&
        datasetInfo && (
          <div
            style={{
              marginTop:
                "20px",

              padding:
                "25px",

              background:
                "#222",

              borderRadius:
                "12px",

              maxWidth:
                "1100px",
            }}
          >
            <h2>
              3. Validation Results
            </h2>

            <h3>Selected model: {datasetInfo.algorithm}</h3>

            <p>
              Held-out mean coordinate error: {datasetInfo.meanNormalizedError?.toFixed(4)} normalized screen diagonals
            </p>
            <p>
              Held-out median coordinate error: {datasetInfo.medianNormalizedError?.toFixed(4)} normalized screen diagonals
            </p>
            <p>
              Held-out nearest-target mapping accuracy: {accuracy?.toFixed(1)}% ({results.filter((row) => row.correct).length}/{results.length} samples). This is not a live dwell-selection accuracy score.
            </p>
            <p>
              This is a time-blocked frame validation, not a randomized live communication test. False selections, misses, selection time, and repeated-letter success have not been measured here.
            </p>

            <h3>Per-target held-out error</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <th>Target</th>
                    <th>Mean normalized error</th>
                    <th>Median normalized error</th>
                    <th>Samples</th>
                  </tr>
                </thead>
                <tbody>
                  {datasetInfo.perTargetErrors?.map((target) => (
                    <tr key={target.letter}>
                      <td>{target.letter}</td>
                      <td>{target.meanNormalizedError.toFixed(4)}</td>
                      <td>{target.medianNormalizedError.toFixed(4)}</td>
                      <td>{target.samples}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p>
              Validation dataset:{" "}
              {TOTAL_VALIDATION} samples
            </p>

            <div
              style={{
                overflowX:
                  "auto",
              }}
            >
              <table
                style={{
                  borderCollapse:
                    "collapse",

                  width:
                    "100%",
                }}
              >
                <thead>
                  <tr>
                    <th>
                      Target
                    </th>

                    <th>
                      Target X
                    </th>

                    <th>
                      Target Y
                    </th>

                    <th>
                      Pred X
                    </th>

                    <th>
                      Pred Y
                    </th>

                    <th>
                      Error
                    </th>

                    <th>
                      Predicted
                    </th>

                    <th>
                      Correct
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {results.map(
                    (
                      row,
                      index
                    ) => (
                      <tr
                        key={
                          index
                        }
                      >
                        <td
                          style={{
                            padding:
                              "8px",

                            textAlign:
                              "center",
                          }}
                        >
                          {
                            row.letter
                          }
                        </td>

                        <td
                          style={{
                            padding:
                              "8px",

                            textAlign:
                              "center",
                          }}
                        >
                          {
                            row.targetX.toFixed(
                              1
                            )
                          }
                          %
                        </td>

                        <td
                          style={{
                            padding:
                              "8px",

                            textAlign:
                              "center",
                          }}
                        >
                          {
                            row.targetY.toFixed(
                              1
                            )
                          }
                          %
                        </td>

                        <td
                          style={{
                            padding:
                              "8px",

                            textAlign:
                              "center",
                          }}
                        >
                          {
                            row.predictedX.toFixed(
                              1
                            )
                          }
                          %
                        </td>

                        <td
                          style={{
                            padding:
                              "8px",

                            textAlign:
                              "center",
                          }}
                        >
                          {
                            row.predictedY.toFixed(
                              1
                            )
                          }
                          %
                        </td>

                        <td
                          style={{
                            padding:
                              "8px",

                            textAlign:
                              "center",
                          }}
                        >
                          {
                            row.error.toFixed(
                              2
                            )
                          }
                          %
                        </td>

                        <td
                          style={{
                            padding:
                              "8px",

                            textAlign:
                              "center",
                          }}
                        >
                          {
                            row.predictedLetter
                          }
                        </td>

                        <td
                          style={{
                            padding:
                              "8px",

                            textAlign:
                              "center",
                          }}
                        >
                          {row.correct
                            ? "✓"
                            : "✗"}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>

            <button
              onClick={
                downloadCSV
              }
              style={{
                marginTop:
                  "20px",

                padding:
                  "12px 20px",

                fontSize:
                  "16px",

                cursor:
                  "pointer",
              }}
            >
              Download Validation CSV
            </button>
          </div>
        )}

      {/* =====================================================
          DOWNLOAD MODEL
      ===================================================== */}

      {trained && (
        <div
          style={{
            marginTop:
              "20px",

            padding:
              "25px",

            background:
              "#222",

            borderRadius:
              "12px",

            maxWidth:
              "950px",
          }}
        >
          <h2>
            4. Download Model
          </h2>

          <button
            onClick={
              handleDownload
            }
            style={{
              padding:
                "14px 24px",

              fontSize:
                "17px",

              cursor:
                "pointer",
            }}
          >
            Download Gaze Model
          </button>

          <p>
            To use this model in the demo, place both downloaded files in:
          </p>

          <code>public/models/</code>

          <ul>
            <li>gaze-model.json</li>
            <li>gaze-model.weights.bin</li>
          </ul>

          <p>
            Replace both files together, then reload the app and start the demo.
          </p>

          <p>
            The model uses exactly{" "}
            <strong>
              {GAZE_FEATURE_COUNT}
            </strong>{" "}
            features.
          </p>

          <p>
            Keyboard configuration is saved
            to:
          </p>

          <code>
            localStorage.gazeKeyboardConfig
          </code>

          <p>
            The same configuration is also
            available through:
          </p>

          <code>
            window.gazeKeyboardConfig
          </code>
        </div>
      )}
    </div>
  );
}
