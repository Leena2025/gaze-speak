// Key layouts for the gaze keyboard. Every row has 10 cells so keys keep the
// same large size; the two-step tile mode reuses V1's letter groups.

import { LETTER_GROUPS } from "../../gaze/layout.js";

export const KEY_ROWS = Object.freeze({
  abc: ["abcdefghij", "klmnopqrst", "uvwxyz,.?!"],
  qwerty: ["qwertyuiop", "asdfghjkl'", "zxcvbnm,.?"],
  symbols: ["1234567890", "-/:;()&@\"'", ".,?!#%+=*_"],
});

export const TILE_GROUPS = LETTER_GROUPS.map((group) => group.toLowerCase());

export const PUNCTUATION = new Set([",", ".", "?", "!", ":", ";"]);

/** Shift cycles off -> next letter -> caps lock -> off. */
export const SHIFT_STATES = Object.freeze(["off", "once", "lock"]);
export function nextShift(state) {
  return SHIFT_STATES[(SHIFT_STATES.indexOf(state) + 1) % SHIFT_STATES.length];
}
