# Symbols page in English, Tamil or both

Date: 18 October 2026

> **Update:** Symbols is now part of the Talk page ([TALK-REPORT.md](TALK-REPORT.md)). The English / தமிழ் / Both choice now covers the whole Talk page.

## How it works

- **Where the choice is.** Three buttons sit at the top of the Symbols page, beside the title: **English**, **தமிழ்** and **Both**. They look the same in every mode, so anyone can find their language. The chosen button has a tick.
- **What follows the choice.** Everything on the page changes with it:
  - the group tabs, symbol names and sentences
  - the empty message hint
  - the Speak, Undo and Clear buttons
  - the "My symbols" empty message
  - the page buttons and "Page 1 of 2"
  - the names that screen readers hear
- **Both mode.** The English name sits on top with the Tamil name under it, for example "Water" and then "தண்ணீர்". Choosing a symbol adds "I want water. / எனக்குத் தண்ணீர் வேண்டும்." to the message.
- **When nothing has been chosen yet.** The page follows Settings → Speech → Language. Your choice here is saved, so it is still there after a reload. Changing it here does not change the rest of the app.
- **Speaking.** Speak, and the automatic speaking when you choose a symbol, read English with the English voice and Tamil with the Tamil voice. A Both message is read in two parts: English first, then Tamil.
- **When a voice is missing.** If the device has no Tamil voice, English is still spoken and Tamil is still tried. A single yellow notice says no Tamil voice is installed. Nothing crashes.
- **Your own symbols.** Symbols you added yourself ("My symbols") are shown exactly as you typed them.

## Files changed

| File | What changed |
|---|---|
| `src/content/i18n.js` (new) | The translation helper. It has one list of every fixed text on the Symbols page in English and Tamil, plus small functions that turn a `{ en, ta }` pair into what each mode shows. The symbol data in `symbols.js` already had both languages and was not changed. |
| `src/features/symbols/Symbols.jsx` | Adds the language buttons and uses the helper for all text on the page. |
| `src/app/settingsModel.js` | Adds a new saved setting, `symbolLanguage`: auto, en, ta or both. |
| `src/app/speech.js` | Adds `splitByLanguage` and `speakMixed`, which read each English or Tamil part with its own voice. Starting a new speech stops a two-part speech that is still playing. |
| `src/app/useSpeak.js` | Adds a new language option, `"auto"`, which uses `speakMixed`. |
| `src/components/MessageBar.jsx`, `src/components/Pager.jsx` | Add optional `labels`, so a page can pass translated button text. Other pages pass nothing and still show English. |
| `src/components/AppShell.jsx` | Adds an empty spot in the top bar where a page can put its own buttons. Only Symbols uses it. |
| `src/styles/app.css` | Styles the language buttons and the two-language cards. Long sentences now stop after two lines, so the picture is never cut off. |
| `tests/v2.test.js` | 4 new unit tests. |

## Test results (run on 18 October 2026)

| Check | Result |
|---|---|
| Unit tests | 48/48 (44 old + 4 new) |
| Lint | OK |
| Build | OK |
| Browser tests (4 old sets) | 25/25, 42/42, 17/17, 11/11 |
| Screen-fit check for all pages | No hidden buttons |
| New Symbols language browser test | 45/45 |

**The new browser test checks:**

- English, Tamil and Both text on the tabs, cards, buttons, hint, page counter and screen-reader names
- that choosing a symbol adds the right sentence
- undo, clear, next page and previous page
- that the choice is saved after a reload
- that the Tamil app language opens the page in Tamil
- that a missing Tamil voice shows its warning once
- that looking at a language button (pointer dwell) selects it
- that other pages still show English buttons

**Fit check on the Symbols page:**

- **Tested:** 7 screen sizes × 3 text sizes × 3 modes.
- **Laptop sizes all fit with nothing hidden in every mode:** 1366×768, 1366×657, 1280×720, 1536×730 and 1920×969.
- **Also improved:** before this change, cards were cut off at 1280×720.
- **Still a problem:** very small screens (1024×600) and extra-large text on a tall portrait screen. These were already too full before this change.

## Not tested

- **Hearing the voices.** The test browser has no speakers or real voices. The tests replace speech with a recorder and check which text, language and voice would be used. Please listen on your laptop.
- **Real eye gaze.** Gaze on the new buttons was not tested; only mouse dwell was.
- **Tamil wording.** The new Tamil words (for example செயல்தவிர் for Undo) should be checked by a native speaker, like the existing symbol text.
