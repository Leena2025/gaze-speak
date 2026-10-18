// Gaze feature extraction from MediaPipe FaceMesh landmarks (478 points with
// refineLandmarks: true). The same function is used by calibration, the
// validation pass and live prediction, so the feature contract is defined
// here once.
//
// Design notes
// - Iris position is expressed in each eye's own coordinate frame (axis from
//   the image-left corner to the image-right corner, perpendicular pointing
//   down), normalized by eye width. This is invariant to face scale and roll.
// - Head pose and head position in the camera frame are included explicitly:
//   the screen point a person looks at depends on where the head is, not just
//   where the iris sits inside the eye. The previous extractor had no
//   head-position features, so leaning sideways shifted predictions.
// - Eye openness is kept: the upper lid follows vertical gaze, which helps the
//   weak vertical iris signal. It is also used to reject blink frames.

export const GAZE_FEATURE_VERSION = "igaze-landmarks-v3";
export const GAZE_REQUIRED_LANDMARK_COUNT = 478;

export const GAZE_FEATURE_NAMES = Object.freeze([
  "rightIrisX",
  "rightIrisY",
  "leftIrisX",
  "leftIrisY",
  "lidRatio",
  "eyeOpenness",
  "headRoll",
  "headYaw",
  "headPitch",
  "headYawDepth",
  "headPitchDepth",
  "faceX",
  "faceY",
  "faceScale",
]);

export const GAZE_FEATURE_COUNT = GAZE_FEATURE_NAMES.length;

// Plausible physical bounds for each feature. Values outside these bounds mean
// the landmarks are broken (or the face is at an extreme pose), so the frame is
// rejected instead of being fed to the model.
export const GAZE_FEATURE_RANGES = Object.freeze([
  [-0.6, 0.6], // rightIrisX
  [-0.6, 0.6], // rightIrisY
  [-0.6, 0.6], // leftIrisX
  [-0.6, 0.6], // leftIrisY
  [-1, 2], // lidRatio
  [0, 1.5], // eyeOpenness
  [-Math.PI / 2, Math.PI / 2], // headRoll
  [-1.5, 1.5], // headYaw
  [-1, 2.5], // headPitch
  [-10, 10], // headYawDepth (landmark z has a loosely defined scale)
  [-10, 10], // headPitchDepth
  [-0.5, 1.5], // faceX
  [-0.5, 1.5], // faceY
  [0, 1.5], // faceScale
].map((range) => Object.freeze(range)));

// Index of eyeOpenness, used for blink rejection.
export const EYE_OPENNESS_INDEX = GAZE_FEATURE_NAMES.indexOf("eyeOpenness");

const RIGHT_EYE = { a: 33, b: 133, top: 159, bottom: 145 }; // image-left eye
const LEFT_EYE = { a: 362, b: 263, top: 386, bottom: 374 }; // image-right eye
const IRIS_A = [468, 469, 470, 471, 472];
const IRIS_B = [473, 474, 475, 476, 477];
const NOSE_TIP = 1;
const FOREHEAD = 10;
const CHIN = 152;

const REQUIRED_LANDMARKS = [
  RIGHT_EYE.a, RIGHT_EYE.b, RIGHT_EYE.top, RIGHT_EYE.bottom,
  LEFT_EYE.a, LEFT_EYE.b, LEFT_EYE.top, LEFT_EYE.bottom,
  ...IRIS_A, ...IRIS_B, NOSE_TIP, FOREHEAD, CHIN,
];

export function hasValidGazeLandmarks(landmarks) {
  return Array.isArray(landmarks) &&
    landmarks.length >= GAZE_REQUIRED_LANDMARK_COUNT &&
    REQUIRED_LANDMARKS.every((index) => {
      const point = landmarks[index];
      return point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
    });
}

export function validateFeatureVector(features) {
  return Array.isArray(features) &&
    features.length === GAZE_FEATURE_COUNT &&
    features.every((value, index) => {
      const [minimum, maximum] = GAZE_FEATURE_RANGES[index];
      return Number.isFinite(value) && value >= minimum && value <= maximum;
    });
}

function point(landmarks, index) {
  const p = landmarks[index];
  return { x: Number(p.x), y: Number(p.y), z: Number.isFinite(Number(p.z)) ? Number(p.z) : 0 };
}

function average(points) {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z }), { x: 0, y: 0, z: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length, z: sum.z / points.length };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function length(v) {
  return Math.hypot(v.x, v.y);
}

function eyeFrame(landmarks, eye) {
  const a = point(landmarks, eye.a);
  const b = point(landmarks, eye.b);
  // Order corners left-to-right in the image so both eyes share one axis direction.
  const [left, right] = a.x <= b.x ? [a, b] : [b, a];
  const axis = sub(right, left);
  const width = length(axis);
  if (!(width > 1e-6)) {
    throw new Error("Degenerate eye landmarks.");
  }
  const u = { x: axis.x / width, y: axis.y / width };
  const v = { x: -u.y, y: u.x }; // perpendicular, pointing down in image space
  const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
  const top = point(landmarks, eye.top);
  const bottom = point(landmarks, eye.bottom);
  return { center, u, v, width, top, bottom };
}

function irisInEye(frame, iris) {
  const offset = sub(iris, frame.center);
  const topV = dot(sub(frame.top, frame.center), frame.v);
  const bottomV = dot(sub(frame.bottom, frame.center), frame.v);
  const irisV = dot(offset, frame.v);
  const lidSpan = bottomV - topV;
  return {
    x: dot(offset, frame.u) / frame.width,
    y: irisV / frame.width,
    lidRatio: Math.abs(lidSpan) > 1e-6 ? (irisV - topV) / lidSpan : 0.5,
    openness: Math.abs(lidSpan) / frame.width,
  };
}

/**
 * @param {Array<{x:number,y:number,z?:number}>} landmarks FaceMesh keypoints in pixels
 * @param {{width:number,height:number}} frameSize size of the image the landmarks came from
 * @returns {number[]} GAZE_FEATURE_COUNT finite values
 */
export function extractGazeFeatures(landmarks, frameSize) {
  if (!hasValidGazeLandmarks(landmarks)) {
    throw new Error(`Expected at least ${GAZE_REQUIRED_LANDMARK_COUNT} valid FaceMesh landmarks.`);
  }
  const frameWidth = Number(frameSize?.width);
  const frameHeight = Number(frameSize?.height);
  if (!(frameWidth > 0) || !(frameHeight > 0)) {
    throw new Error("A positive frame size is required to normalize head position.");
  }

  const rightEye = eyeFrame(landmarks, RIGHT_EYE);
  const leftEye = eyeFrame(landmarks, LEFT_EYE);

  // Assign each iris ring to the nearest eye instead of trusting index order.
  const irisA = average(IRIS_A.map((index) => point(landmarks, index)));
  const irisB = average(IRIS_B.map((index) => point(landmarks, index)));
  const aIsRight = length(sub(irisA, rightEye.center)) + length(sub(irisB, leftEye.center)) <=
    length(sub(irisA, leftEye.center)) + length(sub(irisB, rightEye.center));
  const right = irisInEye(rightEye, aIsRight ? irisA : irisB);
  const left = irisInEye(leftEye, aIsRight ? irisB : irisA);

  // Face frame: axis between the two eye centers.
  const eyeAxis = sub(leftEye.center, rightEye.center);
  const interocular = length(eyeAxis);
  if (!(interocular > 1e-6)) {
    throw new Error("Degenerate face landmarks.");
  }
  const fu = { x: eyeAxis.x / interocular, y: eyeAxis.y / interocular };
  const fv = { x: -fu.y, y: fu.x };
  const eyeMid = {
    x: (rightEye.center.x + leftEye.center.x) / 2,
    y: (rightEye.center.y + leftEye.center.y) / 2,
  };

  const nose = point(landmarks, NOSE_TIP);
  const noseOffset = sub(nose, eyeMid);
  const forehead = point(landmarks, FOREHEAD);
  const chin = point(landmarks, CHIN);
  const outerRight = point(landmarks, RIGHT_EYE.a);
  const outerLeft = point(landmarks, LEFT_EYE.b);

  const features = [
    right.x,
    right.y,
    left.x,
    left.y,
    (right.lidRatio + left.lidRatio) / 2,
    (right.openness + left.openness) / 2,
    Math.atan2(fu.y, fu.x),
    dot(noseOffset, fu) / interocular,
    dot(noseOffset, fv) / interocular,
    (outerLeft.z - outerRight.z) / interocular,
    (forehead.z - chin.z) / interocular,
    eyeMid.x / frameWidth,
    eyeMid.y / frameHeight,
    interocular / frameWidth,
  ];

  if (!features.every(Number.isFinite)) {
    throw new Error("Feature extractor produced a non-finite value.");
  }
  return features;
}
