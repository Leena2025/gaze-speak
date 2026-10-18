// Unit tests for the V2 modules: message editing, settings, word
// suggestions, gaze target hit testing, music queue rules, phone links and
// the news feed parser/API. Run with `npm test`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { addPunctuation, appendPhrase, atSentenceStart, casedLetter, deleteLastChar, deleteLastWord, pushHistory } from "../src/app/messageEdit.js";
import { clampDwell, DEFAULT_SETTINGS, normalizeSettings } from "../src/app/settingsModel.js";
import { parseHash, railSection, SECTIONS } from "../src/app/router.js";
import { applySuggestion, caseWord, createPredictor, learnFromText, splitPartial } from "../src/features/keyboard/predictor.js";
import wordlist from "../src/features/keyboard/wordlist.js";
import { KEY_ROWS, nextShift } from "../src/features/keyboard/layouts.js";
import { normalizeRect, pickTarget } from "../src/gaze/targets.js";
import { createDwellSelector } from "../src/gaze/filters.js";
import { guessFromFileName, nextIndex, normalizeLibrary, previousIndex, searchTracks, shuffledQueue, trackUrl, formatTime } from "../src/features/music/library.js";
import { initials, normalizePhone, smsHref, sortContacts, telHref, whatsappHref } from "../src/features/calls/phone.js";
import { createNewsHandler, decodeEntities, parseFeed, toPlainText } from "../server/news.js";
import { PHRASE_CATEGORIES, localized } from "../src/content/phrases.js";
import { authMode, friendlyAuthError, validateCredentials } from "../src/app/authConfig.js";
import { calibrationPassed, calibrationStatus, VERIFY_MIN_HIT_RATE } from "../src/gaze/calibrationStatus.js";
import { SYMBOL_CATEGORIES } from "../src/content/symbols.js";
import { bothText, buttonText, displayMode, fill, PHRASES_UI, SYMBOLS_UI, TALK_UI, textIn } from "../src/content/i18n.js";
import { splitByLanguage } from "../src/app/speech.js";

// ---------------------------------------------------------------------------
// Message editing
// ---------------------------------------------------------------------------

test("message editing: delete letter, delete word, punctuation, phrases", () => {
  assert.equal(deleteLastChar("Hi😊"), "Hi");
  assert.equal(deleteLastChar(""), "");
  assert.equal(deleteLastWord("I want wa"), "I want ");
  assert.equal(deleteLastWord("I want "), "I ");
  assert.equal(deleteLastWord("Hello"), "");
  assert.equal(deleteLastWord("   "), "");
  assert.equal(addPunctuation("hello ", "."), "hello. ");
  assert.equal(addPunctuation("hello", "?"), "hello? ");
  assert.equal(addPunctuation("don", "'"), "don'");
  assert.equal(appendPhrase("", "I am hungry."), "I am hungry.");
  assert.equal(appendPhrase("Hello", "I want water."), "Hello. I want water.");
  assert.equal(appendPhrase("Hi! ", "Yes."), "Hi! Yes.");
  assert.equal(appendPhrase("Hi", "   "), "Hi");
});

test("message editing: capitalization at sentence start, shift and caps lock", () => {
  assert.equal(atSentenceStart(""), true);
  assert.equal(atSentenceStart("Hello. "), true);
  assert.equal(atSentenceStart("Hello."), false, "no space yet: still the same word");
  assert.equal(atSentenceStart("Hello "), false);
  assert.equal(casedLetter("a", { text: "" }), "A");
  assert.equal(casedLetter("a", { text: "Hi " }), "a");
  assert.equal(casedLetter("a", { text: "", autoCapitalize: false }), "a");
  assert.equal(casedLetter("a", { text: "Hi ", shift: true }), "A");
  assert.equal(casedLetter("a", { text: "Hi ", capsLock: true }), "A");
  assert.deepEqual([nextShift("off"), nextShift("once"), nextShift("lock")], ["once", "lock", "off"]);
});

test("undo history is bounded and skips duplicates", () => {
  let history = [];
  for (let i = 0; i < 60; i++) history = pushHistory(history, `t${i}`, 50);
  assert.equal(history.length, 50);
  assert.equal(history[0], "t10");
  assert.deepEqual(pushHistory(["a"], "a"), ["a"]);
});

// ---------------------------------------------------------------------------
// Settings and routing
// ---------------------------------------------------------------------------

test("settings: defaults, clamping and rejection of bad stored values", () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  const settings = normalizeSettings({ dwellMs: 99999, theme: "neon", language: "ta", speechRate: "1.26", autoSpeak: "yes", unknown: 1 });
  assert.equal(settings.dwellMs, 3000);
  assert.equal(settings.theme, DEFAULT_SETTINGS.theme);
  assert.equal(settings.language, "ta");
  assert.equal(settings.speechRate, 1.3);
  assert.equal(settings.autoSpeak, DEFAULT_SETTINGS.autoSpeak, "wrong type falls back");
  assert.equal("unknown" in settings, false);
  assert.equal(clampDwell(140), 500);
  assert.equal(clampDwell(1234), 1200);
  assert.equal(clampDwell("abc"), DEFAULT_SETTINGS.dwellMs);
});

test("router: unknown hashes go home", () => {
  assert.equal(parseHash("#/keyboard"), "keyboard");
  assert.equal(parseHash("#/music?x=1"), "music");
  assert.equal(parseHash("#/nope"), "home");
  assert.equal(parseHash(""), "home");
});

// ---------------------------------------------------------------------------
// Word suggestions
// ---------------------------------------------------------------------------

const predictor = createPredictor(wordlist);

test("suggestions complete the current word (hun -> hungry first)", () => {
  const suggestions = predictor.suggest("I am hun");
  assert.equal(suggestions[0], "hungry");
  assert.ok(suggestions.includes("hunt") || suggestions.includes("hunger"));
  assert.ok(suggestions.length <= 5);
  for (const word of predictor.suggest("tha")) assert.ok(word.toLowerCase().startsWith("tha"));
});

test("suggestions are capitalized at sentence start and keep I capital", () => {
  assert.equal(predictor.suggest("hun")[0], "Hungry");
  assert.equal(predictor.suggest("Thanks. hun")[0], "Hungry");
  assert.ok(predictor.suggest("i").includes("I'm"));
  assert.equal(caseWord("i'll", false), "I'll");
});

test("next-word predictions after a space", () => {
  assert.ok(predictor.suggest("I ").includes("want"));
  assert.ok(predictor.suggest("Please ").includes("call"));
  assert.ok(predictor.suggest("").includes("I"));
});

test("no suggestions for unknown words does not break", () => {
  assert.deepEqual(predictor.suggest("zzqxj"), []);
});

test("applying a suggestion replaces only the partial word and handles punctuation", () => {
  assert.equal(applySuggestion("Hello, hun", "hungry"), "Hello, hungry ");
  assert.equal(applySuggestion("I am ", "hungry"), "I am hungry ");
  assert.equal(applySuggestion("", "Yes"), "Yes ");
  assert.equal(applySuggestion("I want to rest.", "Yes"), "I want to rest. Yes ");
  assert.ok(predictor.suggest("I want to rest.").every((word) => /^[A-Z]/.test(word)), "capitals right after a full stop");
  assert.deepEqual(splitPartial("I'm hun"), { before: "I'm ", partial: "hun" });
});

test("learned words and names rank in suggestions", () => {
  const user = learnFromText({}, "Please call Karan. Karan is my son.");
  assert.equal(user.display.karan, "Karan");
  assert.ok(predictor.suggest("Please call ", user).includes("Karan"));
  assert.equal(predictor.suggest("I like kar", user)[0], "Karan");
});

test("word list is clean of contraction fragments and has expected size", () => {
  const words = wordlist.split(" ");
  assert.ok(words.length >= 10000);
  assert.ok(!words.includes("don"));
  assert.ok(words.includes("hungry"));
});

test("keyboard rows all have 10 keys", () => {
  for (const rows of Object.values(KEY_ROWS)) for (const row of rows) assert.equal([...row].length, 10, row);
});

// ---------------------------------------------------------------------------
// Gaze targets (shared engine)
// ---------------------------------------------------------------------------

const rect = (left, top, right, bottom) => ({ left, top, right, bottom });

test("pickTarget: hit, gap, hysteresis, top-most wins, edge overshoot", () => {
  const targets = [
    { id: "a", rect: rect(0.1, 0.1, 0.3, 0.3) },
    { id: "b", rect: rect(0.32, 0.1, 0.5, 0.3) },
    { id: "modal", rect: rect(0.2, 0.2, 0.4, 0.4) },
  ];
  assert.equal(pickTarget({ x: 0.15, y: 0.15 }, targets), "a");
  assert.equal(pickTarget({ x: 0.31, y: 0.15 }, targets), null, "gap selects nothing");
  assert.equal(pickTarget({ x: 0.305, y: 0.15 }, targets, "a"), "a", "current target is sticky");
  assert.equal(pickTarget({ x: 0.25, y: 0.25 }, targets), "modal", "later (on top) target wins");
  assert.equal(pickTarget({ x: 0.6, y: 0.6 }, targets), null);
  assert.equal(pickTarget(null, targets), null);
  const edge = [{ id: "corner", rect: rect(0.9, 0.9, 1, 1) }];
  assert.equal(pickTarget({ x: 1.08, y: 1.2 }, edge), "corner", "overshoot past the edge is clamped");
});

test("normalizeRect clips to the scroll container and drops hidden boxes", () => {
  assert.deepEqual(normalizeRect({ left: 100, top: 50, right: 300, bottom: 150 }, 1000, 500), rect(0.1, 0.1, 0.3, 0.3));
  assert.deepEqual(normalizeRect({ left: 100, top: 0, right: 300, bottom: 150 }, 1000, 500, { left: 0, top: 100, right: 1000, bottom: 500 }), rect(0.1, 0.2, 0.3, 0.3));
  assert.equal(normalizeRect({ left: 100, top: 0, right: 300, bottom: 90 }, 1000, 500, { left: 0, top: 100, right: 1000, bottom: 500 }), null);
});

test("dwell selector: one long look selects once (re-arm needed)", () => {
  const selector = createDwellSelector({ dwellMs: 1000, rearmMs: 200, cooldownMs: 400 });
  let selections = 0;
  for (let t = 0; t <= 5000; t += 33) if (selector.update("KEY_A", t).selectedId) selections += 1;
  assert.equal(selections, 1);
  for (let t = 5033; t <= 5400; t += 33) selector.update(null, t);
  for (let t = 5433; t <= 6600; t += 33) if (selector.update("KEY_A", t).selectedId) selections += 1;
  assert.equal(selections, 2, "looking away and back selects again");
});

// ---------------------------------------------------------------------------
// Music
// ---------------------------------------------------------------------------

test("music library: validation, names from files, search", () => {
  const { tracks, skipped } = normalizeLibrary({ tracks: [
    { file: "A.R. Rahman - Song One.mp3", title: "", artist: "" },
    { file: "folder/Ilaiyaraaja - Melody.mp3", title: "Melody", artist: "Ilaiyaraaja", album: "Hits", durationSec: 200 },
    { file: "../secret.mp3" },
    { file: "cover.jpg" },
    "plain.mp3",
    { file: "plain.mp3" },
  ] });
  assert.equal(tracks.length, 3);
  assert.equal(skipped, 3);
  assert.equal(tracks[0].title, "Song One");
  assert.equal(tracks[0].artist, "A.R. Rahman");
  assert.equal(tracks[1].url, "/music/folder/Ilaiyaraaja%20-%20Melody.mp3");
  assert.equal(searchTracks(tracks, "ilaiya mel").length, 1);
  assert.equal(searchTracks(tracks, "  ").length, 3);
  assert.equal(searchTracks(tracks, "zzz").length, 0);
  assert.throws(() => normalizeLibrary({}), /tracks/);
  assert.deepEqual(guessFromFileName("x/My_Song.mp3"), { artist: "", title: "My Song" });
  assert.equal(trackUrl("a b#.mp3"), "/music/a%20b%23.mp3");
});

test("music queue: next/previous with repeat modes, shuffle keeps first", () => {
  assert.equal(nextIndex(3, 0, "off"), 1);
  assert.equal(nextIndex(3, 2, "off"), null, "stop at the end");
  assert.equal(nextIndex(3, 2, "all"), 0, "wrap around");
  assert.equal(nextIndex(0, 0, "all"), null);
  assert.equal(previousIndex(3, 0, "off"), 0);
  assert.equal(previousIndex(3, 0, "all"), 2);
  const shuffled = shuffledQueue(["a", "b", "c", "d"], "c", () => 0.3);
  assert.equal(shuffled[0], "c");
  assert.deepEqual([...shuffled].sort(), ["a", "b", "c", "d"]);
  assert.equal(formatTime(125), "2:05");
  assert.equal(formatTime(NaN), "–:––");
});

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

test("phone numbers and call/message links", () => {
  assert.equal(normalizePhone("+91 98765-43210"), "+919876543210");
  assert.equal(normalizePhone("(044) 2345 6789"), "04423456789");
  assert.equal(normalizePhone("12"), null);
  assert.equal(normalizePhone("call me"), null);
  assert.equal(telHref("+919876543210"), "tel:+919876543210");
  assert.equal(smsHref("+91987", "I need help."), "sms:+91987?body=I%20need%20help.");
  assert.equal(whatsappHref("+919876543210", "Hi"), "https://wa.me/919876543210?text=Hi");
  assert.equal(whatsappHref("09876543210"), null, "WhatsApp needs a country code");
  assert.equal(initials("ravi kumar"), "RK");
  assert.deepEqual(sortContacts([{ name: "B", calls: 1 }, { name: "A", calls: 1 }, { name: "C", calls: 5 }]).map((c) => c.name), ["C", "A", "B"]);
});

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

test("every phrase and symbol has English and Tamil text and a label", () => {
  for (const category of PHRASE_CATEGORIES) {
    for (const phrase of category.phrases) {
      assert.ok(phrase.text.en && phrase.text.ta, phrase.id);
    }
  }
  for (const category of SYMBOL_CATEGORIES) {
    for (const symbol of category.symbols) {
      assert.ok(symbol.label.en && symbol.label.ta && symbol.phrase.en && symbol.phrase.ta && symbol.emoji, symbol.id);
    }
  }
  assert.equal(localized({ en: "Yes" }, "ta"), "Yes", "falls back to English");
});

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

const SAMPLE = readFileSync(new URL("./fixtures/rss-sample.xml", import.meta.url), "utf8");

test("news parser: CDATA, entities, images, dates, unsafe links", () => {
  const items = parseFeed(SAMPLE);
  assert.equal(items.length, 3, "javascript: link is dropped");
  assert.equal(items[0].title, "First test headline & more");
  assert.equal(items[0].summary, "A short summary of the first story.");
  assert.equal(items[0].image, "https://example.org/img/1.jpg");
  assert.equal(items[0].published, "2026-10-16T08:30:00.000Z");
  assert.equal(items[1].title, "Second headline with entity & quote “x”");
  assert.equal(items[1].summary, "Plain escaped summary.");
  assert.equal(items[1].image, null);
  assert.equal(items[2].title, "தமிழ் தலைப்புச் செய்தி");
  assert.equal(items[2].published, null);
  assert.equal(items[2].image, "https://example.org/img/3.png");
  assert.equal(decodeEntities("&#x0BA4;&amp;"), "த&");
  assert.ok(toPlainText("word ".repeat(200), 50).endsWith("…"));
});

test("news parser reads Atom feeds", () => {
  const atom = `<feed><entry><title>Atom story</title><link rel="alternate" href="https://example.org/a"/><summary>Sum</summary><updated>2026-10-01T00:00:00Z</updated></entry></feed>`;
  const [item] = parseFeed(atom);
  assert.equal(item.link, "https://example.org/a");
  assert.equal(item.summary, "Sum");
});

function fakeResponse(handler, url) {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { resolve({ status: this.statusCode, body: JSON.parse(body) }); } };
    handler({ url }, res);
  });
}

test("news API: validates language, caches, limits refresh, serves stale copy on failure", async () => {
  let calls = 0;
  let fail = false;
  let clock = 1_000_000;
  const feeds = { en: [{ id: "top", label: "Top", source: "Test", url: "https://example.org/rss" }], ta: [] };
  const handler = createNewsHandler({
    feeds,
    now: () => clock,
    fetchImpl: async () => {
      calls += 1;
      if (fail) throw new Error("offline");
      return { ok: true, status: 200, text: async () => SAMPLE };
    },
  });
  const bad = await fakeResponse(handler, "/api/news?lang=fr");
  assert.equal(bad.status, 400);
  const none = await fakeResponse(handler, "/api/news?lang=ta");
  assert.equal(none.status, 404);

  const first = await fakeResponse(handler, "/api/news?lang=en");
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 3);
  assert.equal(first.body.items[0].source, "Test");
  assert.equal(calls, 1);

  clock += 60_000;
  await fakeResponse(handler, "/api/news?lang=en&refresh=1");
  assert.equal(calls, 1, "refresh within 2 minutes uses the cache");

  clock += 11 * 60_000;
  fail = true;
  const stale = await fakeResponse(handler, "/api/news?lang=en");
  assert.equal(calls, 2);
  assert.equal(stale.status, 200);
  assert.equal(stale.body.stale, true);
  assert.equal(stale.body.items.length, 3);
});

test("news API reports an error when nothing could ever be loaded", async () => {
  const handler = createNewsHandler({
    feeds: { en: [{ id: "top", label: "Top", source: "Test", url: "https://example.org/rss" }], ta: [] },
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => "" }),
  });
  const result = await fakeResponse(handler, "/api/news?lang=en");
  assert.equal(result.status, 502);
  assert.match(result.body.error, /HTTP 503/);
});

test("gaze diagnostics: contributions add up to the model output and flag out-of-range features", async () => {
  const { fitRidge, predictRaw } = await import("../src/gaze/ridgeModel.js");
  const { explainPrediction, featureLabels } = await import("../src/gaze/diagnostics.js");
  const { GAZE_FEATURE_COUNT } = await import("../src/gaze/featureExtractor.js");
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const samples = [];
  for (let i = 0; i < 200; i++) {
    const target = { x: rand(), y: rand() };
    const features = Array.from({ length: GAZE_FEATURE_COUNT }, () => (rand() - 0.5) * 0.1);
    features[0] = features[2] = (target.x - 0.5) * 0.4;
    features[1] = features[3] = (target.y - 0.5) * 0.3;
    features[5] = 0.3 - target.y * 0.05; // eye openness follows vertical gaze
    samples.push({ target, features });
  }
  for (const basis of ["linear", "quadratic"]) {
    const params = fitRidge(samples, { basis, lambda: 0.1 });
    assert.equal(featureLabels(basis).length, params.mean.length);
    const probe = samples[3].features;
    const explained = explainPrediction(params, probe);
    const direct = predictRaw(params, probe);
    assert.ok(Math.abs(explained.x - direct.x) < 1e-9 && Math.abs(explained.y - direct.y) < 1e-9);
    assert.deepEqual(explained.outOfRange, []);
    const squinting = probe.slice();
    squinting[5] = 0.05; // much narrower eyes than in calibration
    assert.ok(explainPrediction(params, squinting).outOfRange.includes("eyeOpenness"));
  }
});

// ---------------------------------------------------------------------------
// Symbols page languages: English, Tamil or both
// ---------------------------------------------------------------------------

test("symbol language: the page follows the app language until one is chosen", () => {
  assert.equal(normalizeSettings({}).symbolLanguage, "auto");
  assert.equal(normalizeSettings({ symbolLanguage: "both" }).symbolLanguage, "both");
  assert.equal(normalizeSettings({ symbolLanguage: "fr" }).symbolLanguage, "auto");
  assert.equal(displayMode("auto", "ta"), "ta");
  assert.equal(displayMode("auto", "en"), "en");
  assert.equal(displayMode("both", "ta"), "both");
  assert.equal(displayMode("en", "ta"), "en");
});

test("symbol language: text in English, Tamil and both", () => {
  const water = SYMBOL_CATEGORIES[0].symbols.find((symbol) => symbol.id === "water");
  assert.equal(textIn(water.label, "en"), "Water");
  assert.equal(textIn(water.label, "ta"), "தண்ணீர்");
  assert.equal(textIn(water.label, "both"), "Water / தண்ணீர்");
  assert.equal(textIn(water.phrase, "both"), "I want water. / எனக்குத் தண்ணீர் வேண்டும்.");
  assert.equal(bothText({ en: "Same", ta: "Same" }), "Same");
  assert.equal(bothText({ en: "Only English" }), "Only English");
  assert.deepEqual(buttonText(TALK_UI.speak, "both"), { label: "Speak", sublabel: "பேசு" });
  assert.deepEqual(buttonText(TALK_UI.speak, "ta"), { label: "பேசு" });
  assert.equal(fill(textIn(TALK_UI.pageOf, "both", " · "), { page: 1, pages: 3 }), "Page 1 of 3 · பக்கம் 1 / 3");
});

test("symbol language: every fixed text and every symbol has English and Tamil", () => {
  for (const [key, value] of Object.entries({ ...TALK_UI, ...PHRASES_UI, ...SYMBOLS_UI })) {
    assert.ok(value.en && value.ta, `${key} needs en and ta`);
  }
  for (const category of SYMBOL_CATEGORIES) {
    assert.ok(category.label.en && category.label.ta, category.id);
    for (const symbol of category.symbols) {
      assert.ok(symbol.label.en && symbol.label.ta && symbol.phrase.en && symbol.phrase.ta, symbol.id);
    }
  }
});

test("speech: a two-language message is split so each part gets its own voice", () => {
  assert.deepEqual(splitByLanguage("I want water. / எனக்குத் தண்ணீர் வேண்டும்."), [
    { language: "en", text: "I want water." },
    { language: "ta", text: "எனக்குத் தண்ணீர் வேண்டும்." },
  ]);
  assert.deepEqual(splitByLanguage("I want water. / எனக்குத் தண்ணீர் வேண்டும். I am happy. / நான் மகிழ்ச்சியாக இருக்கிறேன்.").map((part) => part.language), ["en", "ta", "en", "ta"]);
  assert.deepEqual(splitByLanguage("நன்றி."), [{ language: "ta", text: "நன்றி." }]);
  assert.deepEqual(splitByLanguage("I am 2 years old."), [{ language: "en", text: "I am 2 years old." }]);
  assert.deepEqual(splitByLanguage("😊 / 123"), []);
  assert.deepEqual(splitByLanguage(""), []);
});

// ---------------------------------------------------------------------------
// Talk: one page for phrases, needs, symbols and typing
// ---------------------------------------------------------------------------

test("talk: Type, Quick phrases, Needs and Symbols have addresses that belong to Talk", () => {
  for (const id of ["keyboard", "phrases", "needs", "symbols"]) {
    assert.equal(parseHash(`#/${id}`), id, "old address still works");
    assert.equal(railSection(id), "communicate");
  }
  assert.equal(railSection("communicate"), "communicate");
  assert.equal(railSection("calls"), "calls");
  assert.deepEqual(SECTIONS.filter((section) => !section.part).map((section) => section.id), ["home", "communicate", "calls", "music", "news", "settings"]);
});

test("talk: every phrase is in exactly one of Quick phrases or Needs", () => {
  const quick = ["general", "family"];
  const needs = ["personal", "health"];
  assert.deepEqual(PHRASE_CATEGORIES.map((category) => category.id).sort(), [...quick, ...needs].sort());
  const ids = PHRASE_CATEGORIES.flatMap((category) => category.phrases.map((phrase) => phrase.id));
  assert.equal(new Set(ids).size, ids.length, "no phrase is listed twice");
  const general = PHRASE_CATEGORIES.find((category) => category.id === "general").phrases.map((phrase) => phrase.text.en);
  for (const text of ["Yes.", "No.", "Thank you.", "I need help."]) assert.ok(general.includes(text), text);
});

// ---------------------------------------------------------------------------
// Sign-in, calibration status and the Netlify news function
// ---------------------------------------------------------------------------

test("auth: real sign-in when configured, open only on localhost, closed elsewhere", () => {
  const config = { url: "https://abcd.supabase.co", anonKey: "x".repeat(40) };
  assert.equal(authMode({ ...config, hostname: "gaze.netlify.app" }), "supabase");
  assert.equal(authMode({ ...config, hostname: "localhost" }), "supabase", "configured sign-in is used locally too");
  assert.equal(authMode({ hostname: "localhost" }), "local");
  assert.equal(authMode({ hostname: "127.0.0.1" }), "local");
  assert.equal(authMode({ hostname: "gaze.netlify.app" }), "unconfigured", "a website without sign-in stays closed");
  assert.equal(authMode({ url: "http://abcd.supabase.co", anonKey: "x".repeat(40), hostname: "gaze.netlify.app" }), "unconfigured", "http is not accepted");
  assert.equal(authMode({ url: "https://abcd.supabase.co", anonKey: "short", hostname: "gaze.netlify.app" }), "unconfigured");
});

test("auth: form checks and readable error messages", () => {
  assert.deepEqual(validateCredentials({ email: "a@b.co", password: "secret" }), {});
  assert.ok(validateCredentials({ email: "", password: "" }).email);
  assert.ok(validateCredentials({ email: "not-an-email", password: "x" }).email);
  assert.ok(validateCredentials({ email: "a@b.co", password: "" }).password);
  assert.ok(validateCredentials({ email: "a@b.co", password: "short" }, { signUp: true }).password, "sign-up needs 8+ characters");
  assert.match(friendlyAuthError({ message: "Invalid login credentials" }), /email or password is not right/);
  assert.match(friendlyAuthError({ message: "Email not confirmed" }), /confirm your email/);
  assert.match(friendlyAuthError(new TypeError("Failed to fetch")), /Cannot reach/);
  assert.match(friendlyAuthError({ message: "New password should be different from the old password." }), /different from your old one/);
});

test("calibration status: missing, failed check, big screen change, ok", () => {
  const viewport = { width: 1366, height: 768 };
  const doc = (rate, vp = viewport) => ({ calibration: { viewport: vp }, metrics: { validation: { groupedKeyHitRate: rate } } });
  assert.equal(calibrationStatus(null, viewport).state, "missing");
  assert.equal(calibrationStatus(doc(VERIFY_MIN_HIT_RATE - 0.01), viewport).state, "failed");
  assert.equal(calibrationStatus(doc(0.9), viewport).state, "ok");
  assert.equal(calibrationStatus(doc(0.9), { width: 1366, height: 657 }).state, "ok", "a 14% change (window not full screen) is allowed");
  assert.equal(calibrationStatus(doc(0.9), { width: 1920, height: 1080 }).state, "outdated");
  const imported = calibrationStatus({ calibration: { viewport } }, viewport);
  assert.equal(imported.state, "ok");
  assert.equal(imported.unverified, true);
  assert.equal(calibrationPassed(undefined), false);
});

test("netlify news function answers like the local news server", async () => {
  const rss = `<?xml version="1.0"?><rss><channel><item><title>Fixture headline</title><link>https://example.org/a</link><description>Short text</description><pubDate>Thu, 16 Oct 2026 08:30:00 GMT</pubDate></item></channel></rss>`;
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    return new Response(rss, { status: 200, headers: { "content-type": "application/rss+xml" } });
  };
  try {
    const { default: news, config } = await import("../netlify/functions/news.mjs");
    assert.equal(config.path, "/api/news");
    const response = await news(new Request("https://gaze.example/api/news?lang=en"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.items[0].title, "Fixture headline");
    assert.ok(asked[0].startsWith("https://"), "only the configured feed is fetched");
    const bad = await news(new Request("https://gaze.example/api/news?lang=xx"));
    assert.equal(bad.status, 400);
  } finally {
    globalThis.fetch = realFetch;
  }
});
