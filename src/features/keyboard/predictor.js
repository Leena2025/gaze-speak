// Word suggestions for the gaze keyboard. Runs locally (no network):
// - completions of the word being typed, ranked by everyday frequency
//   (wordlist.js), with a boost for words people need most in care settings;
// - next-word predictions after a space, from a small built-in table and
//   from what this user has spoken before;
// - words and word pairs the user speaks are remembered in this browser, so
//   names and personal words start appearing.
// Pure functions, unit-tested.

import { atSentenceStart } from "../../app/messageEdit.js";

/** Words people often need in care settings; ranked above their raw frequency. */
export const CORE_WORDS = [
  "hungry", "thirsty", "tired", "pain", "help", "water", "food", "bathroom", "toilet", "medicine",
  "doctor", "nurse", "please", "thank", "thanks", "yes", "no", "want", "need", "feel", "sleep",
  "rest", "cold", "hot", "uncomfortable", "sick", "better", "worse", "family", "son", "daughter",
  "mother", "father", "wife", "husband", "brother", "sister", "friend", "call", "come", "stay",
  "turn", "move", "sit", "lie", "bed", "chair", "blanket", "pillow", "light", "fan", "music", "tv",
  "news", "outside", "home", "happy", "sad", "scared", "love", "head", "back", "stomach", "chest",
  "breathe", "breathing", "itchy", "wet", "change", "clothes", "wash", "bath", "eat", "drink",
  "tea", "coffee", "milk", "juice", "now", "later", "today", "tomorrow", "morning", "night",
];

export const CONTRACTIONS = [
  "don't", "i'm", "it's", "can't", "didn't", "doesn't", "isn't", "i'll", "i've", "you're", "that's",
  "won't", "wasn't", "let's", "what's", "i'd", "there's", "we're", "they're", "couldn't", "wouldn't",
  "shouldn't", "haven't", "aren't", "he's", "she's", "where's", "who's",
];

const SENTENCE_STARTERS = ["I", "please", "yes", "no", "thank", "can", "where", "what", "my", "when"];

/** Small next-word table for common care sentences. */
export const NEXT_WORDS = {
  i: ["am", "want", "need", "feel", "don't", "love", "have", "can"],
  "i'm": ["hungry", "thirsty", "tired", "in", "cold", "hot", "okay", "not"],
  am: ["hungry", "thirsty", "tired", "in", "feeling", "not", "okay", "cold", "hot", "happy", "sad"],
  want: ["to", "water", "food", "some", "my", "music", "tea", "you"],
  need: ["help", "to", "my", "water", "the", "a", "some", "medicine", "rest"],
  to: ["go", "eat", "drink", "sleep", "sit", "rest", "talk", "see", "the", "call", "lie"],
  please: ["call", "help", "come", "give", "bring", "wait", "turn", "stop", "open", "close"],
  feel: ["sick", "tired", "cold", "hot", "better", "pain", "good", "bad", "dizzy"],
  feeling: ["sick", "tired", "cold", "hot", "better", "good", "bad", "uncomfortable"],
  my: ["son", "daughter", "wife", "husband", "mother", "father", "medicine", "family", "head", "back"],
  call: ["my", "the", "doctor", "nurse", "me"],
  in: ["pain", "the", "bed", "my"],
  thank: ["you"],
  can: ["you", "i", "we"],
  you: ["please", "help", "come", "are", "can"],
  the: ["doctor", "nurse", "light", "fan", "tv", "window", "door", "bathroom"],
  turn: ["on", "off", "me", "the"],
  give: ["me"],
  me: ["water", "food", "my", "the", "some", "a"],
  go: ["to", "home", "outside", "out"],
  some: ["water", "food", "tea", "rest", "help"],
  a: ["little", "lot", "doctor", "drink", "blanket", "bit"],
  not: ["hungry", "tired", "now", "okay", "well", "good"],
};

const WORD_TAIL = /[A-Za-z']+$/;

/** Splits "I want wa" into { before: "I want ", partial: "wa" }. */
export function splitPartial(text) {
  const match = text.match(WORD_TAIL);
  const partial = match ? match[0] : "";
  return { before: text.slice(0, text.length - partial.length), partial };
}

function previousWord(before) {
  if (/[.!?]\s*$/.test(before)) return "";
  const match = before.trim().match(/([A-Za-z']+)[,;:]?$/);
  return match ? match[1].toLowerCase() : "";
}

/** "i" -> "I", "i'm" -> "I'm"; capitalizes when asked. */
export function caseWord(word, capitalize) {
  if (word === "i" || word.startsWith("i'")) return `I${word.slice(1)}`;
  return capitalize ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

export function createPredictor(wordString) {
  const words = wordString.split(" ").filter(Boolean);
  const rank = new Map();
  words.forEach((word, index) => rank.set(word, index));
  // Contractions are missing from the source list; give them the rank of a common word.
  CONTRACTIONS.forEach((word, index) => {
    if (!rank.has(word)) rank.set(word, 40 + index * 3);
  });
  const core = new Set(CORE_WORDS);
  CORE_WORDS.forEach((word) => {
    if (!rank.has(word)) rank.set(word, 3000);
  });
  const vocabulary = [...rank.keys()];

  /**
   * @param text the whole message
   * @param user { words: {word: count}, pairs: {"prev next": count}, display: {word: "Name"} } learned in this browser
   */
  function suggest(text, user = { words: {}, pairs: {} }, limit = 5) {
    const { before, partial } = splitPartial(text);
    const prev = previousWord(before);
    const sentenceStart = atSentenceStart(before);
    const userWords = user.words || {};
    const userPairs = user.pairs || {};
    const scores = new Map();
    const add = (word, score) => scores.set(word, Math.max(scores.get(word) ?? -Infinity, score));
    const nextList = NEXT_WORDS[prev] ?? (prev ? [] : SENTENCE_STARTERS.map((w) => w.toLowerCase()));
    const builtinNext = new Map(nextList.map((word, index) => [word, 2 + (nextList.length - index) * 0.2]));

    const score = (word) => {
      const r = rank.get(word);
      let value = r === undefined ? -9 : -Math.log(r + 10);
      if (core.has(word)) value += 1.5;
      if (userWords[word]) value += 1.5 * Math.log2(1 + userWords[word]);
      if (prev && userPairs[`${prev} ${word}`]) value += 6 * Math.log2(1 + userPairs[`${prev} ${word}`]);
      value += builtinNext.get(word) ?? 0;
      return value;
    };

    if (partial) {
      const p = partial.toLowerCase();
      for (const word of vocabulary) {
        if (word.length > p.length && word.startsWith(p)) add(word, score(word));
      }
      for (const word of Object.keys(userWords)) {
        if (word.length > p.length && word.startsWith(p)) add(word, score(word));
      }
    } else {
      for (const word of builtinNext.keys()) add(word, score(word));
      for (const key of Object.keys(userPairs)) {
        const [first, second] = key.split(" ");
        if (first === prev) add(second, score(second));
      }
    }

    const capitalize = sentenceStart || /[.!?]\s*$/.test(before) || (partial && /^[A-Z]/.test(partial));
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word]) => caseWord(user.display?.[word] ?? word, capitalize));
  }

  return { suggest, size: vocabulary.length };
}

/** Replaces the word being typed with the suggestion and adds a space. */
export function applySuggestion(text, word) {
  const { before } = splitPartial(text);
  // "rest." + "Yes" -> "rest. Yes ": a word never sticks to punctuation.
  const glue = before && !/\s$/.test(before) && /[.,!?;:)]$/.test(before) ? " " : "";
  return `${before}${glue}${word} `;
}

/** Records the words and word pairs of a spoken message. Returns new data. */
export function learnFromText(user, text, maxEntries = 2000) {
  const words = { ...user?.words };
  const pairs = { ...user?.pairs };
  const display = { ...user?.display };
  for (const sentence of text.split(/[.!?]+/)) {
    const original = sentence.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
    const tokens = original.map((token) => token.toLowerCase());
    tokens.forEach((token, index) => {
      // A capital letter inside a sentence marks a name: keep that spelling.
      if (index > 0 && /^[A-Z][a-z]/.test(original[index])) display[token] = original[index];
      if (token.length > 1 || token === "i" || token === "a") words[token] = (words[token] || 0) + 1;
      if (index > 0) {
        const key = `${tokens[index - 1]} ${token}`;
        pairs[key] = (pairs[key] || 0) + 1;
      }
    });
  }
  const trim = (object) => Object.fromEntries(Object.entries(object).sort((a, b) => b[1] - a[1]).slice(0, maxEntries));
  const kept = trim(words);
  return { words: kept, pairs: trim(pairs), display: Object.fromEntries(Object.entries(display).filter(([word]) => word in kept)) };
}
