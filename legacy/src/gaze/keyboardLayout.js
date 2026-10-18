export const LETTERS = [
  "A", "B", "C", "D", "E", "F",
  "G", "H", "I", "J", "K", "L",
  "M", "N", "O", "P", "Q", "R",
  "S", "T", "U", "V", "W", "X",
  "Y", "Z",
];

export const KEY_VISUAL_INSET_PX = 4;

export const KEYBOARD_LAYOUT = Object.freeze({
  columns: 6,
  rows: 5,
  left: 3,
  top: 18,
  width: 94,
  height: 64,
  letterGap: 0,
  space: {
    left: 20,
    top: 86,
    width: 60,
    height: 8,
  },
  alert: {
    left: 82,
    top: 86,
    width: 16,
    height: 8,
  },
});

export function createLetterTargets(layout = KEYBOARD_LAYOUT) {
  const cellWidth = layout.width / layout.columns;
  const cellHeight = layout.height / layout.rows;

  return LETTERS.map((letter, index) => {
    const row = Math.floor(index / layout.columns);
    const column = index % layout.columns;

    return {
      id: letter,
      label: letter,
      type: "letter",
      x: layout.left + (column + 0.5) * cellWidth,
      y: layout.top + (row + 0.5) * cellHeight,
      row,
      column,
      index,
    };
  });
}

export function createSpaceTarget(layout = KEYBOARD_LAYOUT) {
  return {
    id: "SPACE",
    label: "SPACE",
    type: "space",
    x: layout.space.left + layout.space.width / 2,
    y: layout.space.top + layout.space.height / 2,
  };
}

export function createAlertTarget(layout = KEYBOARD_LAYOUT) {
  return {
    id: "ALERT",
    label: "ALERT",
    type: "alert",
    x: layout.alert.left + layout.alert.width / 2,
    y: layout.alert.top + layout.alert.height / 2,
  };
}

export function createActionTargets(layout = KEYBOARD_LAYOUT) {
  return [createSpaceTarget(layout), createAlertTarget(layout)];
}

export function createCalibrationTargets(layout = KEYBOARD_LAYOUT) {
  return [...createLetterTargets(layout), ...createActionTargets(layout)];
}

export function getAllTargets(layout = KEYBOARD_LAYOUT) {
  return createCalibrationTargets(layout);
}

export function normalizedToViewport(point, viewport) {
  const x = Array.isArray(point) ? point[0] : point?.x;
  const y = Array.isArray(point) ? point[1] : point?.y;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    throw new Error("Gaze coordinates must be finite normalized viewport values in [0, 1].");
  }
  if (!Number.isFinite(viewport?.width) || viewport.width <= 0 ||
      !Number.isFinite(viewport?.height) || viewport.height <= 0) {
    throw new Error("Viewport width and height must be positive finite values.");
  }
  return { x: x * viewport.width, y: y * viewport.height };
}

export function getTargetBounds(target, layout = KEYBOARD_LAYOUT) {
  if (!target) {
    return null;
  }

  if (target.type === "space") {
    return {
      left: layout.space.left / 100,
      right: (layout.space.left + layout.space.width) / 100,
      top: layout.space.top / 100,
      bottom: (layout.space.top + layout.space.height) / 100,
    };
  }

  if (target.type === "alert") {
    return {
      left: layout.alert.left / 100,
      right: (layout.alert.left + layout.alert.width) / 100,
      top: layout.alert.top / 100,
      bottom: (layout.alert.top + layout.alert.height) / 100,
    };
  }

  const cellWidth = layout.width / layout.columns;
  const cellHeight = layout.height / layout.rows;

  return {
    left: (layout.left + (target.column ?? 0) * cellWidth) / 100,
    right: (layout.left + ((target.column ?? 0) + 1) * cellWidth) / 100,
    top: (layout.top + (target.row ?? 0) * cellHeight) / 100,
    bottom: (layout.top + ((target.row ?? 0) + 1) * cellHeight) / 100,
  };
}

export function pointInTarget(point, target, layout = KEYBOARD_LAYOUT, viewport = null) {
  const x = Array.isArray(point) ? point[0] : point?.x;
  const y = Array.isArray(point) ? point[1] : point?.y;
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
    return false;
  }

  const bounds = getTargetBounds(target, layout);
  if (!bounds) {
    return false;
  }

  const normalizedX = Number(x);
  const normalizedY = Number(y);
  const hasViewport = Number.isFinite(viewport?.width) && viewport.width > 0 &&
    Number.isFinite(viewport?.height) && viewport.height > 0;
  const insetX = hasViewport && target.type !== "alert"
    ? KEY_VISUAL_INSET_PX / viewport.width
    : 0;
  const insetY = hasViewport && target.type !== "alert"
    ? KEY_VISUAL_INSET_PX / viewport.height
    : 0;

  return normalizedX >= bounds.left + insetX && normalizedX < bounds.right - insetX &&
    normalizedY >= bounds.top + insetY && normalizedY < bounds.bottom - insetY;
}

export function getTargetById(id, layout = KEYBOARD_LAYOUT) {
  return getAllTargets(layout).find((target) => target.id === id) ?? null;
}
