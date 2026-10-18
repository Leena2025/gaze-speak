// Temporal filtering and dwell selection. Pure logic, no DOM, unit-tested.

/**
 * One Euro filter (Casiez et al., CHI 2012): heavy smoothing while the gaze
 * point is still (fixations), little smoothing when it moves fast (saccades).
 * A fixed EMA forces a trade-off between jitter and lag; this adapts.
 */
export class OneEuroFilter {
  constructor({ minCutoff = 1.0, beta = 2.0, derivativeCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.derivativeCutoff = derivativeCutoff;
    this.reset();
  }

  reset() {
    this.previous = null;
    this.previousDerivative = 0;
    this.previousTime = null;
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value, timeMs) {
    if (this.previous === null) {
      this.previous = value;
      this.previousTime = timeMs;
      return value;
    }
    const dt = Math.max(1e-3, (timeMs - this.previousTime) / 1000);
    const derivative = (value - this.previous) / dt;
    const smoothedDerivative = this.previousDerivative +
      OneEuroFilter.alpha(this.derivativeCutoff, dt) * (derivative - this.previousDerivative);
    const cutoff = this.minCutoff + this.beta * Math.abs(smoothedDerivative);
    const result = this.previous + OneEuroFilter.alpha(cutoff, dt) * (value - this.previous);
    this.previous = result;
    this.previousDerivative = smoothedDerivative;
    this.previousTime = timeMs;
    return result;
  }
}

export class PointFilter {
  constructor(options) {
    this.x = new OneEuroFilter(options);
    this.y = new OneEuroFilter(options);
  }

  reset() {
    this.x.reset();
    this.y.reset();
  }

  filter(point, timeMs) {
    return { x: this.x.filter(point.x, timeMs), y: this.y.filter(point.y, timeMs) };
  }
}

/**
 * Dwell-time selection.
 *
 * - Progress accumulates only while the gaze stays on one target.
 * - Short dropouts (blinks, a missed frame, a jitter into a gap) up to
 *   `graceMs` freeze progress instead of resetting it.
 * - After a selection the target is locked until the gaze has been off it for
 *   `rearmMs`, so one long look never types the same letter twice.
 * - A global cooldown prevents two selections in quick succession.
 */
export function createDwellSelector({ dwellMs = 1000, graceMs = 250, rearmMs = 200, cooldownMs = 400 } = {}) {
  let activeId = null;
  let accumulated = 0;
  let offTarget = 0;
  let lockedId = null;
  let lockedAway = 0;
  let cooldownUntil = 0;
  let lastTime = null;

  const state = () => ({ activeId, progress: 0, selectedId: null, lockedId });

  return {
    /** Target currently accumulating dwell (used for hit-test hysteresis). */
    get activeId() {
      return activeId;
    },

    setDwell(ms) {
      dwellMs = ms;
    },

    reset() {
      activeId = null;
      accumulated = 0;
      offTarget = 0;
      lockedId = null;
      lockedAway = 0;
      lastTime = null;
    },

    /**
     * @param targetId id under the gaze, null for none, undefined for "no
     *   reliable gaze this frame" (face lost, blink)
     * @param timeMs monotonic time
     * @param dwellScale per-target multiplier (e.g. longer for Clear/Alert)
     */
    update(targetId, timeMs, dwellScale = 1) {
      const dt = lastTime === null ? 0 : Math.min(100, Math.max(0, timeMs - lastTime));
      lastTime = timeMs;

      if (lockedId !== null) {
        if (targetId === lockedId) {
          lockedAway = 0;
        } else if (targetId !== undefined) {
          lockedAway += dt;
          if (lockedAway >= rearmMs) {
            lockedId = null;
            lockedAway = 0;
          }
        }
      }

      if (targetId === undefined || targetId === null || targetId === lockedId) {
        offTarget += dt;
        if (offTarget > graceMs || targetId === lockedId) {
          activeId = null;
          accumulated = 0;
        }
        return { ...state(), progress: activeId ? accumulated / (dwellMs * dwellScale) : 0 };
      }

      offTarget = 0;
      if (targetId !== activeId) {
        activeId = targetId;
        accumulated = 0;
        return state();
      }

      accumulated += dt;
      const required = dwellMs * dwellScale;
      if (accumulated >= required && timeMs >= cooldownUntil) {
        const selectedId = activeId;
        lockedId = activeId;
        lockedAway = 0;
        activeId = null;
        accumulated = 0;
        cooldownUntil = timeMs + cooldownMs;
        return { activeId: null, progress: 0, selectedId, lockedId };
      }
      return { activeId, progress: Math.min(1, accumulated / required), selectedId: null, lockedId };
    },
  };
}
