// Shared screen-space layout for calibration and the demo.
//
// Every position in the app is expressed in normalized viewport coordinates:
// origin top-left, x to the right, y down, (0,0)-(1,1) covering the full
// browser viewport. Calibration targets, model output, demo keys and hit
// testing all use this one convention, and both screens render into a
// position:fixed stage that covers the viewport, so there is no scroll or
// container offset between them.

export const LAYOUT_VERSION = 3;

// Top band: selected-text panel + mouse-only toolbar (never gaze targets).
export const REGIONS = Object.freeze({
  textPanel: Object.freeze({ left: 0.02, top: 0.025, right: 0.72, bottom: 0.15 }),
  toolbar: Object.freeze({ left: 0.74, top: 0.025, right: 0.98, bottom: 0.15 }),
  keys: Object.freeze({ left: 0.02, top: 0.18, right: 0.98, bottom: 0.8 }),
  actions: Object.freeze({ left: 0.02, top: 0.83, right: 0.98, bottom: 0.975 }),
});

// Space between neighbouring targets. Gaze inside a gap selects nothing, which
// prevents flicker between adjacent keys.
export const GAP = Object.freeze({ x: 0.012, y: 0.02 });

export const DIRECT_KEYS = Object.freeze([
  "A", "B", "C", "D", "E", "F", "G",
  "H", "I", "J", "K", "L", "M", "N",
  "O", "P", "Q", "R", "S", "T", "U",
  "V", "W", "X", "Y", "Z", ".", "?",
]);
export const DIRECT_COLUMNS = 7;

export const LETTER_GROUPS = Object.freeze([
  "ABCDE", "FGHIJ", "KLMNO", "PQRST", "UVWXY", "Z.?",
]);
export const GROUP_COLUMNS = 3;

export const ACTIONS = Object.freeze([
  { id: "SPACE", label: "Space", weight: 2, dwellScale: 1 },
  { id: "DELETE", label: "Delete", weight: 1, dwellScale: 1 },
  { id: "CLEAR", label: "Clear", weight: 1, dwellScale: 1.6 },
  { id: "SPEAK", label: "Speak", weight: 1, dwellScale: 1.2 },
  { id: "ALERT", label: "Alert", weight: 1, dwellScale: 1.6 },
]);

export const KEYBOARD_MODES = Object.freeze({
  direct: "direct",
  grouped: "grouped",
});

function gridRects(region, count, columns) {
  const rows = Math.ceil(count / columns);
  const cellW = (region.right - region.left + GAP.x) / columns;
  const cellH = (region.bottom - region.top + GAP.y) / rows;
  return Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = region.left + column * cellW;
    const top = region.top + row * cellH;
    return { left, top, right: left + cellW - GAP.x, bottom: top + cellH - GAP.y };
  });
}

function actionTargets() {
  const region = REGIONS.actions;
  const totalWeight = ACTIONS.reduce((sum, action) => sum + action.weight, 0);
  const usable = region.right - region.left - GAP.x * (ACTIONS.length - 1);
  let left = region.left;
  return ACTIONS.map((action) => {
    const width = (usable * action.weight) / totalWeight;
    const rect = { left, top: region.top, right: left + width, bottom: region.bottom };
    left += width + GAP.x;
    return { id: action.id, label: action.label, kind: "action", value: action.id, rect, dwellScale: action.dwellScale };
  });
}

/**
 * Builds the gaze targets for the current keyboard state.
 * @param mode "direct" (all 28 keys at once) or "grouped" (two-step, large tiles)
 * @param groupIndex open group in grouped mode, or null for the group picker
 */
export function buildTargets(mode, groupIndex = null) {
  let keyTargets;
  if (mode === KEYBOARD_MODES.direct) {
    const rects = gridRects(REGIONS.keys, DIRECT_KEYS.length, DIRECT_COLUMNS);
    keyTargets = DIRECT_KEYS.map((key, index) => ({
      id: `KEY_${key}`, label: key, kind: "letter", value: key, rect: rects[index], dwellScale: 1,
    }));
  } else if (groupIndex === null) {
    const rects = gridRects(REGIONS.keys, LETTER_GROUPS.length, GROUP_COLUMNS);
    keyTargets = LETTER_GROUPS.map((group, index) => ({
      id: `GROUP_${index}`, label: group.split("").join(" "), kind: "group", value: index, rect: rects[index], dwellScale: 1,
    }));
  } else {
    const letters = LETTER_GROUPS[groupIndex].split("");
    const items = [...letters, null];
    const rects = gridRects(REGIONS.keys, Math.max(items.length, 6), GROUP_COLUMNS);
    keyTargets = items.map((letter, index) => letter === null
      ? { id: "BACK", label: "Back", kind: "back", value: null, rect: rects[rects.length - 1], dwellScale: 1 }
      : { id: `KEY_${letter}`, label: letter, kind: "letter", value: letter, rect: rects[index], dwellScale: 1 });
  }
  return [...keyTargets, ...actionTargets()];
}

export function rectContains(rect, point, margin = 0) {
  return point.x >= rect.left - margin && point.x <= rect.right + margin &&
    point.y >= rect.top - margin && point.y <= rect.bottom + margin;
}

/**
 * Returns the id of the target under the gaze point. The currently active
 * target keeps ownership while the point stays within `stickiness` of it
 * (hysteresis), so jitter on a key border does not flip between keys.
 */
export function hitTest(point, targets, currentId = null, stickiness = 0.02) {
  if (!point || !targets.length) {
    return null;
  }
  // Gaze estimates overshoot past the screen edges; snap points beyond the
  // left, right and bottom edges onto the outermost targets so edge keys stay
  // reachable. The top is not snapped: the text panel lives there and looking
  // at it must not select the first key row.
  const bounds = targets.reduce((acc, target) => ({
    left: Math.min(acc.left, target.rect.left),
    right: Math.max(acc.right, target.rect.right),
    bottom: Math.max(acc.bottom, target.rect.bottom),
  }), { left: 1, right: 0, bottom: 0 });
  const clamped = {
    x: Math.min(bounds.right, Math.max(bounds.left, point.x)),
    y: Math.min(bounds.bottom, point.y),
  };
  if (currentId) {
    const current = targets.find((target) => target.id === currentId);
    if (current && rectContains(current.rect, clamped, stickiness)) {
      return current.id;
    }
  }
  return targets.find((target) => rectContains(target.rect, clamped))?.id ?? null;
}

export function rectToStyle(rect) {
  return {
    left: `${rect.left * 100}%`,
    top: `${rect.top * 100}%`,
    width: `${(rect.right - rect.left) * 100}%`,
    height: `${(rect.bottom - rect.top) * 100}%`,
  };
}

// ---------------------------------------------------------------------------
// Calibration plan
// ---------------------------------------------------------------------------

// Training pass: 5 x 5 grid spanning the whole viewport (corners and edges
// included) so the model interpolates over every region the demo uses, and
// predictions near the edges are not extrapolations.
const TRAIN_X = [0.05, 0.275, 0.5, 0.725, 0.95];
const TRAIN_Y = [0.06, 0.28, 0.5, 0.72, 0.94];

// Validation pass: positions between the training points, never shown during
// the training pass, recorded afterwards. Error here measures generalization
// to unseen positions at a different moment in time.
const VALIDATION_POINTS = [
  [0.16, 0.17], [0.61, 0.17], [0.39, 0.39], [0.84, 0.39],
  [0.16, 0.61], [0.61, 0.61], [0.39, 0.83], [0.84, 0.83],
];

/**
 * The 25 learning points are shown in a balanced order: 5 rounds, and each
 * round visits every row and every column once (a Latin square). So the time
 * at which a point is shown says nothing about its position.
 *
 * Why: a head slowly sinking or leaning during calibration changes the head
 * features over time. When the points were shown row by row (top row first,
 * bottom row last), that slow change matched the dot's height, so the model
 * learned "head drift = looking lower". It then failed on the check points,
 * mostly up and down, even though the learning points themselves fitted well.
 */
export function createCalibrationPlan(random = Math.random) {
  const shuffle = (items) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
  const size = TRAIN_X.length;
  const rounds = shuffle([...Array(size).keys()]);
  const train = [];
  for (const round of rounds) {
    const rows = shuffle([...Array(size).keys()]);
    for (const row of rows) train.push({ x: TRAIN_X[(row + round) % size], y: TRAIN_Y[row] });
  }
  const validation = VALIDATION_POINTS.map(([x, y]) => ({ x, y }));
  shuffle(validation);
  return [
    ...train.map((point, index) => ({ ...point, id: `T${String(index + 1).padStart(2, "0")}`, pass: "train" })),
    ...validation.map((point, index) => ({ ...point, id: `V${index + 1}`, pass: "validation" })),
  ];
}

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------

export function readViewport() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    screenWidth: window.screen?.width ?? null,
    screenHeight: window.screen?.height ?? null,
    fullscreen: isFullscreen(),
  };
}

/**
 * Detects the Fullscreen API and browser full-screen (F11), which the API does
 * not report; F11 is detected by the viewport filling the screen.
 */
export function isFullscreen() {
  if (document.fullscreenElement) {
    return true;
  }
  const screenWidth = window.screen?.width;
  const screenHeight = window.screen?.height;
  return Boolean(screenWidth && screenHeight) &&
    Math.abs(window.innerWidth - screenWidth) <= 2 &&
    Math.abs(window.innerHeight - screenHeight) <= 2;
}

/** True when two viewports differ enough that a calibration no longer maps 1:1. */
export function viewportChanged(a, b, tolerance = 0.03) {
  if (!a || !b) {
    return false;
  }
  return Math.abs(a.width - b.width) / b.width > tolerance ||
    Math.abs(a.height - b.height) / b.height > tolerance;
}
