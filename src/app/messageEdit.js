// Text editing operations for the shared message. Pure functions, unit-tested.

/** True when the next letter starts a sentence (empty text, or after . ! ? and a space). */
export function atSentenceStart(text) {
  const trimmed = text.replace(/\s+$/, "");
  if (!trimmed) return true;
  return /[.!?]$/.test(trimmed) && /\s$/.test(text);
}

/** Removes the last character (one emoji or combined character counts as one). */
export function deleteLastChar(text) {
  const chars = Array.from(text);
  chars.pop();
  return chars.join("");
}

/** Removes the last word, plus the spaces after it. "I want wa" -> "I want ". */
export function deleteLastWord(text) {
  const withoutSpaces = text.replace(/\s+$/, "");
  const match = withoutSpaces.match(/^(.*?)(\S+)$/s);
  return match ? match[1] : "";
}

/**
 * Adds punctuation, removing a space typed just before it ("hello ." -> "hello."),
 * then adds a space after sentence/clause punctuation so typing can continue.
 */
export function addPunctuation(text, mark) {
  const base = text.replace(/ +$/, "");
  if (mark === "'" || mark === "-") return base + mark;
  return `${base}${mark} `;
}

/**
 * Joins a ready-made phrase onto the message as its own sentence.
 * "" + "I am hungry." -> "I am hungry."
 * "Hello" + "I want water." -> "Hello. I want water."
 */
export function appendPhrase(text, phrase) {
  const clean = phrase.trim();
  if (!clean) return text;
  const base = text.replace(/\s+$/, "");
  if (!base) return clean;
  const separator = /[.!?]$/.test(base) ? " " : ". ";
  return base + separator + clean;
}

/** Applies typed letter casing: shift/caps lock/auto capital at sentence start. */
export function casedLetter(letter, { shift = false, capsLock = false, autoCapitalize = true, text = "" } = {}) {
  const upper = shift || capsLock || (autoCapitalize && atSentenceStart(text));
  return upper ? letter.toUpperCase() : letter.toLowerCase();
}

/** Keeps a bounded undo history: returns the new history array. */
export function pushHistory(history, previous, limit = 50) {
  if (history[history.length - 1] === previous) return history;
  const next = [...history, previous];
  return next.length > limit ? next.slice(next.length - limit) : next;
}
