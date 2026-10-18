// Text-to-speech through the browser's Web Speech API (speechSynthesis).
// Voices come from the operating system, so what is available differs per
// device: most have English voices; Tamil needs a Tamil voice installed
// (Android: Google Tamil; Windows: the Tamil language pack's voice).

import { useEffect, useState } from "react";

export const SPEECH_LANGS = Object.freeze({ en: "en-IN", ta: "ta-IN" });

export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function voicesFor(lang) {
  if (!speechSupported()) return [];
  const prefix = lang.slice(0, 2).toLowerCase();
  return window.speechSynthesis.getVoices().filter((voice) => voice.lang?.toLowerCase().replace("_", "-").startsWith(prefix));
}

/** Picks the saved voice when it still exists, else the best match for the language. */
export function pickVoice(lang, voiceURI) {
  const candidates = voicesFor(lang);
  return candidates.find((voice) => voice.voiceURI === voiceURI) ||
    candidates.find((voice) => voice.lang === lang) ||
    candidates.find((voice) => voice.localService) ||
    candidates[0] ||
    null;
}

/**
 * Speaks text and resolves when finished: { ok: true } or
 * { ok: false, message } with a reason a person can act on. Never throws.
 */
export function speak(text, options = {}) {
  speechRun += 1;
  return speakOne(text, options);
}

// Each speak or speakMixed call gets a number, so a mixed message that is
// still being read stops when anything new is spoken.
let speechRun = 0;

const TAMIL_LETTER = /[\u0B80-\u0BFF]/;
const LATIN_LETTER = /[A-Za-z]/;

/**
 * Splits text into runs of one language, for reading "I want water. /
 * எனக்குத் தண்ணீர் வேண்டும்." with an English voice and then a Tamil one.
 * Spaces, digits and punctuation stay with the run they follow; the " / "
 * between the two languages is dropped. Runs with no letters are dropped.
 */
export function splitByLanguage(text) {
  const runs = [];
  for (const char of String(text || "")) {
    const language = TAMIL_LETTER.test(char) ? "ta" : LATIN_LETTER.test(char) ? "en" : null;
    const last = runs[runs.length - 1];
    if (last && (language === null || language === last.language)) last.text += char;
    else if (last && !last.hasLetter && language) {
      last.text += char;
      last.language = language;
      last.hasLetter = true;
    } else runs.push({ language, text: char, hasLetter: Boolean(language) });
  }
  return runs
    .filter((run) => run.hasLetter)
    .map((run) => ({ language: run.language, text: run.text.replace(/(^|\s)\/(\s|$)/g, " ").replace(/\s*\/\s*$/, "").trim() }))
    .filter((run) => run.text);
}

/**
 * Speaks text that may mix English and Tamil, each part with its own
 * language's voice: voices = { en: voiceURI, ta: voiceURI }. Resolves like
 * speak(); a missing-voice warning is given once per language.
 */
export async function speakMixed(text, { voices = {}, rate = 1, fallbackLanguage = "en" } = {}) {
  speechRun += 1;
  const run = speechRun;
  const parts = splitByLanguage(text);
  if (parts.length === 0) return speakOne(text, { language: fallbackLanguage, voiceURI: voices[fallbackLanguage], rate });
  const warnings = [];
  for (const part of parts) {
    if (run !== speechRun) return { ok: true };
    const result = await speakOne(part.text, { language: part.language, voiceURI: voices[part.language], rate });
    if (!result.ok) return result;
    if (result.warning && !warnings.includes(result.warning)) warnings.push(result.warning);
  }
  return { ok: true, warning: warnings.join(" ") };
}

function speakOne(text, { language = "en", voiceURI = "", rate = 1 } = {}) {
  const clean = String(text || "").trim();
  if (!clean) return Promise.resolve({ ok: false, message: "There is nothing to speak yet." });
  if (!speechSupported()) {
    return Promise.resolve({ ok: false, message: "Speech is not available in this browser. Try Chrome or Edge." });
  }
  const lang = SPEECH_LANGS[language] || SPEECH_LANGS.en;
  const voice = pickVoice(lang, voiceURI);
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = voice?.lang || lang;
      if (voice) utterance.voice = voice;
      utterance.rate = rate;
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      utterance.onend = () => finish({ ok: true, warning: voice ? "" : missingVoiceMessage(language) });
      utterance.onerror = (event) => {
        if (event.error === "interrupted" || event.error === "canceled") return finish({ ok: true });
        finish({
          ok: false,
          message: event.error === "not-allowed"
            ? "The browser blocked speech until someone taps or clicks the page once. Tap anywhere, then try again."
            : `Speech failed (${event.error || "unknown error"}).${voice ? "" : ` ${missingVoiceMessage(language)}`}`,
        });
      };
      synth.speak(utterance);
      // Some engines never fire events when no voice can speak the text.
      setTimeout(() => finish({ ok: true, warning: voice ? "" : missingVoiceMessage(language) }), Math.max(8000, clean.length * 180));
    } catch (error) {
      resolve({ ok: false, message: `Speech failed: ${error?.message || error}` });
    }
  });
}

function missingVoiceMessage(language) {
  return language === "ta"
    ? "No Tamil voice is installed on this device, so the text may not be read correctly."
    : "No English voice was found on this device.";
}

export function stopSpeaking() {
  speechRun += 1;
  if (speechSupported()) window.speechSynthesis.cancel();
}

/** Live list of the device's voices (they load asynchronously in Chrome). */
export function useVoices() {
  const [voices, setVoices] = useState(() => (speechSupported() ? window.speechSynthesis.getVoices() : []));
  useEffect(() => {
    if (!speechSupported()) return undefined;
    const update = () => setVoices(window.speechSynthesis.getVoices());
    update();
    window.speechSynthesis.addEventListener?.("voiceschanged", update);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", update);
  }, []);
  return voices;
}
