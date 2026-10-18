// Display languages for the Talk page, which can show English, Tamil or
// both together. Every piece of text is a { en, ta } pair, the
// same shape as the phrase and symbol data, so one helper turns any of them
// into what a mode shows. Pure, unit-tested.

import { localized } from "./phrases.js";

export const DISPLAY_MODES = Object.freeze(["en", "ta", "both"]);

/** The mode a page shows: its own choice, else the app's language. */
export function displayMode(choice, appLanguage) {
  if (DISPLAY_MODES.includes(choice)) return choice;
  return appLanguage === "ta" ? "ta" : "en";
}

/** English and Tamil side by side, once only when they are the same. */
export function bothText(value, separator = " / ") {
  const en = localized(value, "en");
  const ta = localized(value, "ta");
  if (!ta || !en || ta === en) return en || ta;
  return `${en}${separator}${ta}`;
}

/** One string for a mode: "Water", "தண்ணீர்" or "Water / தண்ணீர்". */
export function textIn(value, mode, separator) {
  return mode === "both" ? bothText(value, separator) : localized(value, mode);
}

/**
 * A button's text for a mode: { label, sublabel }. In both mode the Tamil
 * goes on a second line, so buttons do not grow wider.
 */
export function buttonText(value, mode) {
  if (mode !== "both") return { label: localized(value, mode) };
  const en = localized(value, "en");
  const ta = localized(value, "ta");
  return ta && ta !== en ? { label: en, sublabel: ta } : { label: en };
}

/** Fills {name} slots: fill("Page {page}", { page: 2 }) gives "Page 2". */
export function fill(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}

/** Fixed text on the Talk page: message bar, methods, language, pages. */
export const TALK_UI = Object.freeze({
  language: { en: "Language", ta: "மொழி" },
  languageGroup: { en: "Talk language", ta: "பேச்சு மொழி" },
  methods: { en: "Ways to talk", ta: "பேசும் வழிகள்" },
  phrases: { en: "Quick phrases", ta: "சொற்றொடர்கள்" },
  needs: { en: "Needs", ta: "தேவைகள்" },
  symbols: { en: "Symbols", ta: "குறியீடுகள்" },
  type: { en: "Type message", ta: "தட்டச்சு" },
  help: { en: "Call for help", ta: "உதவிக்கு அழை" },
  placeholder: { en: "Your message appears here", ta: "உங்கள் செய்தி இங்கே தோன்றும்" },
  placeholderType: { en: "Look at the letters below to type", ta: "தட்டச்சு செய்யக் கீழே உள்ள எழுத்துகளைப் பாருங்கள்" },
  speak: { en: "Speak", ta: "பேசு" },
  undo: { en: "Undo", ta: "செயல்தவிர்" },
  clear: { en: "Clear", ta: "அழி" },
  savePhrase: { en: "Save phrase", ta: "சேமி" },
  saved: { en: "Saved to My phrases in Quick phrases.", ta: "விரைவுச் சொற்றொடர்களில் என் சொற்றொடர்களில் சேமிக்கப்பட்டது." },
  alreadySaved: { en: "This phrase is already saved.", ta: "இந்தச் சொற்றொடர் ஏற்கெனவே சேமிக்கப்பட்டுள்ளது." },
  typeFirst: { en: "Type something first.", ta: "முதலில் ஏதாவது தட்டச்சு செய்யுங்கள்." },
  currentMessage: { en: "Current message", ta: "தற்போதைய செய்தி" },
  previous: { en: "Previous page", ta: "முந்தைய பக்கம்" },
  next: { en: "Next page", ta: "அடுத்த பக்கம்" },
  pageOf: { en: "Page {page} of {pages}", ta: "பக்கம் {page} / {pages}" },
});

/** Fixed text in the phrase and needs lists. */
export const PHRASES_UI = Object.freeze({
  groups: { en: "Phrase groups", ta: "சொற்றொடர்க் குழுக்கள்" },
  myPhrases: { en: "My phrases", ta: "என் சொற்றொடர்கள்" },
  empty: {
    en: "No saved phrases yet. Under Type message, type a phrase and choose Save phrase. A helper can also add phrases in Settings.",
    ta: "சேமித்த சொற்றொடர்கள் இன்னும் இல்லை. தட்டச்சு பகுதியில் ஒரு சொற்றொடரைத் தட்டச்சு செய்து சேமி என்பதைத் தேர்ந்தெடுங்கள். உதவியாளரும் அமைப்புகளில் சேர்க்கலாம்.",
  },
  more: { en: "More phrases", ta: "மேலும் சொற்றொடர்கள்" },
});

/** Fixed text in the symbol list. */
export const SYMBOLS_UI = Object.freeze({
  groups: { en: "Symbol groups", ta: "குறியீட்டுக் குழுக்கள்" },
  mySymbols: { en: "My symbols", ta: "என் குறியீடுகள்" },
  empty: {
    en: "No symbols of your own yet. A helper can add them in Settings, under Phrases and symbols.",
    ta: "உங்கள் சொந்தக் குறியீடுகள் இன்னும் இல்லை. உதவியாளர் அமைப்புகளில், சொற்றொடர்கள் மற்றும் குறியீடுகள் பகுதியில் அவற்றைச் சேர்க்கலாம்.",
  },
  more: { en: "More symbols", ta: "மேலும் குறியீடுகள்" },
});

/** Labels for a Pager in a display mode. */
export function pagerLabels(mode, region) {
  return {
    previous: buttonText(TALK_UI.previous, mode),
    next: buttonText(TALK_UI.next, mode),
    region: textIn(region, mode),
    page: (page, pages) => fill(textIn(TALK_UI.pageOf, mode, " · "), { page, pages }),
  };
}
