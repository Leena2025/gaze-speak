// Gaze targets for the whole app. Any element marked `data-gaze` becomes a
// target; its on-screen box is read every frame, so targets keep working
// after navigation, opening a dialog, or a layout change. The hit test is
// pure (normalized viewport coordinates, like layout.js) and unit-tested.

import { rectContains } from "./layout.js";

/**
 * Returns the id of the target under the point, or null. The current target
 * keeps ownership while the point stays within `stickiness` of it, so jitter
 * on a border does not flip between neighbours. Points just outside the
 * screen are pulled back onto its edge, where gaze estimates often overshoot.
 */
export function pickTarget(point, targets, currentId = null, stickiness = 0.015) {
  if (!point || !targets.length) return null;
  const clamped = { x: Math.min(1, Math.max(0, point.x)), y: Math.min(1, Math.max(0, point.y)) };
  if (currentId) {
    const current = targets.find((target) => target.id === currentId);
    if (current && rectContains(current.rect, clamped, stickiness)) return current.id;
  }
  // Later targets are drawn on top (dialogs, menus), so search from the end.
  for (let i = targets.length - 1; i >= 0; i--) {
    if (rectContains(targets[i].rect, clamped)) return targets[i].id;
  }
  return null;
}

/** Converts a DOM box to normalized viewport coordinates, cut to `clip` if given. */
export function normalizeRect(box, viewportWidth, viewportHeight, clip = null) {
  let { left, top, right, bottom } = box;
  if (clip) {
    left = Math.max(left, clip.left);
    top = Math.max(top, clip.top);
    right = Math.min(right, clip.right);
    bottom = Math.min(bottom, clip.bottom);
  }
  if (right - left < 4 || bottom - top < 4) return null;
  return { left: left / viewportWidth, top: top / viewportHeight, right: right / viewportWidth, bottom: bottom / viewportHeight };
}

/**
 * Reads the current targets from the page. Only targets inside the topmost
 * `data-gaze-modal` element count while one is open; while paused, only
 * targets marked `data-gaze-always` (the Resume button) count.
 */
export function collectDomTargets(idFor, { paused = false } = {}) {
  const modals = document.querySelectorAll("[data-gaze-modal]");
  const scope = modals.length ? modals[modals.length - 1] : document;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const targets = [];
  for (const element of scope.querySelectorAll("[data-gaze]")) {
    if (element.disabled || element.getAttribute("aria-disabled") === "true") continue;
    if (paused && !element.hasAttribute("data-gaze-always")) continue;
    // Scrolling areas hide what is scrolled out of view. A dialog floats above
    // the page, so the page's scrolling area does not clip it.
    let clipElement = element.parentElement?.closest("[data-gaze-clip]");
    if (clipElement && scope !== document && !scope.contains(clipElement)) clipElement = null;
    const rect = normalizeRect(element.getBoundingClientRect(), width, height, clipElement?.getBoundingClientRect() ?? null);
    if (!rect || rect.right <= 0 || rect.bottom <= 0 || rect.left >= 1 || rect.top >= 1) continue;
    targets.push({ id: idFor(element), element, rect, dwellScale: Number(element.dataset.gazeDwell) || 1 });
  }
  return targets;
}
