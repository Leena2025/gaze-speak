# One Talk page: what changed

Date: 18 October 2026.

> **Update: typing comes first.** See [Typing first](#typing-first) at the end. Talk now opens straight on the keyboard, and Quick phrases moved to `#/phrases`. The plan is in [TALK-PLAN.md](TALK-PLAN.md). The screenshots are in `docs/screenshots/talk/`.

## How it works now

```
┌ Talk ─────────────────────── English | தமிழ் | Both ─┐
│ [ Your message ............ ] Speak  Undo  Clear     │  ← one message bar, always here
│ [Quick phrases] [Needs] [Symbols] [Type message] [Call for help]
│ ┌ the chosen way to talk ───────────────────────────┐ │
│ │ groups (tabs) · cards or keyboard · page buttons  │ │
│ └───────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

- **One message.** The message lives in one place in the code (`MessageContext`). Phrases, needs, symbols and typed letters all change that same message, so they can be mixed in any order.
- **One message bar.** It is at the top of Talk and stays there when you switch method. Save phrase appears in it only while you type.
- **Choosing a phrase, need or symbol** adds it to the message and speaks it, when "speak at once" is on in Settings.
- **The language choice** (English / தமிழ் / Both) in the top bar now covers the whole Talk page: buttons, methods, phrases, needs and symbols. The keyboard letters stay English.
- **Side menu:** Home, Talk, Calls, Music, News and Settings.
- **Old addresses still work:**

  | Address | Opens Talk on |
  |---|---|
  | `#/communicate` | Quick phrases |
  | `#/needs` | Needs |
  | `#/symbols` | Symbols |
  | `#/keyboard` | Type message |

  Choosing a method changes the address, so the browser Back button returns to the previous method.
- **Home is not changed.** Its cards open the matching method.

## Files changed

| File | What changed |
|---|---|
| `src/features/communicate/CommunicateHub.jsx` | **Now the Talk page:** the message bar, the 4 method buttons, Call for help, the language choice and the area that shows the chosen method. It used to be a menu of links. |
| `src/features/needs/QuickNeeds.jsx` | **Now `PhrasePanel`, one list used twice:** Quick phrases (General, Family and assistance, My phrases) and Needs (Personal needs, Health and comfort). Choosing a phrase now adds it to the message. |
| `src/features/symbols/Symbols.jsx` | **Now `SymbolPanel`:** the same symbols, groups and pages, without its own message bar or language buttons. |
| `src/features/keyboard/KeyboardScreen.jsx` | **Now `KeyboardPanel`:** the same keys, tiles and word suggestions, without its own message bar. Save phrase moved to the Talk message bar. |
| `src/App.jsx` | The four addresses all open the Talk page. Switching method keeps the page in place instead of rebuilding it. |
| `src/app/router.js` | Marks Type, Needs and Symbols as part of Talk (`part: "communicate"`). The page title reads "Talk". |
| `src/components/AppShell.jsx` | The side menu hides those three and highlights Talk while you use them. |
| `src/content/i18n.js` | English and Tamil text for the Talk page (`TALK_UI`, `PHRASES_UI`, `SYMBOLS_UI`) and one helper for the page buttons. |
| `src/content/phrases.js` | "I need help." moved from Personal needs to General (Quick phrases). It was moved, not copied. |
| `src/styles/app.css` | **Talk layout:** a short message bar, a method row that is taller where there is room, cards that shrink to fit, and a phone layout. The unused styles of the old menu and old Needs page were removed. |
| `tests/v2.test.js` | 2 new unit tests. 2 language tests now use the new text names. |

**Not touched:** eye tracking, calibration, coordinate mapping, Home, Calls, Music, News, Settings and the saved data. No file was deleted and no package was added.

## Test results (run on 18 October 2026)

| Check | Result |
|---|---|
| Unit tests | 50/50 |
| Lint | OK |
| Build | OK |
| Browser tests | 26/26, 43/43, 17/17, 11/11 |
| Symbols language test | 47/47 |
| New Talk test | 41/41 |
| Screen-fit check for all pages | No hidden buttons |

**The new Talk test checks:**

- Home's cards and the 6-item side menu
- that every old address opens the right method, with exactly one message bar
- building one message from a quick phrase, a need, a symbol and typed letters
- Speak, Undo, Clear, and Undo after Clear
- symbol pages
- Save phrase, and the saved phrase showing in My phrases
- that the browser Back button returns to the previous method
- Call for help and its long dwell
- Tamil text and the Tamil voice
- that Calls, Music, News and Settings still open

**Browser tests changed because the pages changed.** Each check still tests the same thing:

- "9 menu items" became 6.
- "Open the keyboard from the menu" now goes through Talk → Type message.
- "Quick need shows in a box, then press Add to message" is now "the need goes straight into the message".
- In the simulated-gaze test, the eye now looks at an empty spot before opening Settings. Before this fix, the eye rested where Settings → Keyboard now sits and opened it, which made the test fail now and then. After the fix it passed 5 runs out of 5.

**Screen-fit check:**

- **Tested:** 4 methods × English/Tamil/Both × 3 text sizes × 7 screen sizes.
- **Fits with nothing hidden at normal and large text:** 1366×768, 1366×657, 1280×720, 1536×730, 1920×969 and 800×1280.

## Remaining issues

- **Extra-large text** does not fit on laptop screens on several Talk methods, and the keyboard keys get smaller than 44 px. Before this change it also failed for Needs, Symbols and the keyboard. Quick phrases is now affected too, because it shows cards instead of a short menu.
- **1024×600 screens** at large or extra-large text: the old pages failed here too.
- **Both mode on screens 800 px tall or less:** symbol cards show the two names but hide the two-language sentence, so the picture fits. The sentence is still added to the message and read by screen readers.
- **Not tested with a real camera and real eyes.** Gaze was tested with the simulator. It landed up to about 40 px from the centre of a button, so I made the method buttons taller (about 70 px on a 768-tall screen).
- **Voices were not heard.** The tests record what would be spoken and in which language.
- **Tamil wording** should be checked by a native speaker, for example சொற்றொடர்கள் for Quick phrases and உதவிக்கு அழை for Call for help.

## Typing first

**Before:** Talk opened on Quick phrases. To type, you had to look at Type message first.

**After:** Talk opens straight on the keyboard. The message bar with Speak, Save phrase, Undo and Clear is at the top. Under it, **Type message** is the first method, then Quick phrases, Needs, Symbols and Call for help, each one look away.

```
┌ Talk ─────────────────────── English | தமிழ் | Both ─┐
│ [ Your message ...... ] Speak  Save phrase  Undo  Clear
│ [Type message] [Quick phrases] [Needs] [Symbols] [Call for help]
│ ┌ word suggestions, then the keys ──────────────────┐ │
└───────────────────────────────────────────────────────┘
```

**Addresses now:**

| Address | Opens Talk on |
|---|---|
| `#/communicate` (the Talk menu item) | Type message |
| `#/keyboard` | Type message (still works) |
| `#/phrases` (new) | Quick phrases |
| `#/needs` | Needs |
| `#/symbols` | Symbols |

**On phones** (720 px wide or less), while typing, the four message buttons sit in one row and the four methods in another, so the keys keep most of the screen. If the screen is still too short, the page scrolls instead of making the keys tiny.

**Files changed:**

| File | What changed |
|---|---|
| `src/features/communicate/CommunicateHub.jsx` | Type message is first and is what Talk opens on. A small `talkMethod(route)` helper picks the method from the address. |
| `src/app/router.js` | New address `phrases` for Quick phrases, part of Talk. The side menu is unchanged. |
| `src/App.jsx` | `#/phrases` opens the Talk page. |
| `src/styles/app.css` | Phone layout for typing (see above). Laptop layout is unchanged. |
| `tests/v2.test.js` | The Talk address test now includes `phrases`. |

**Not touched:** eye tracking, calibration, coordinate mapping, Home and the saved data. No package was added. Nothing was removed: Quick phrases, Needs, Symbols, Save phrase and Call for help all still work.

### Test results (run on 18 October 2026)

| Check | Result |
|---|---|
| Unit tests | 50/50 |
| Lint | OK |
| Build | OK |
| Browser tests | 26/26, 43/43, 17/17, 12/12 |
| Symbols language test | 47/47 |
| Talk test | 51/51 (10 new checks) |
| Screen-fit check, all laptop sizes at normal and large text | No hidden buttons |
| Phone (390 px wide) | No sideways scrolling |

**New checks in the Talk test:**

- the Talk menu item opens the keyboard at once
- the method order is Type message, Quick phrases, Needs, Symbols
- the message bar is above the methods, and the methods are above the keys
- Speak, Undo and Clear are on screen together with the keys
- every Talk button is at least 44 px wide and tall
- all visible Talk text has a contrast of at least 4.5 to 1 against its background
- keyboard focus shows an outline of at least 3 px

**Tests changed because the addresses changed:** "Talk → Type message" became "Talk opens on the keyboard", and the Quick phrases checks now open `#/phrases`. Each still checks the same thing.

**Still the same problems as before:** extra-large text on laptop screens, and 1024×600 screens at large text. Not tested with a real camera and real eyes, and voices were not heard.

Screenshots: `docs/screenshots/talk/type-first-en-1366.png`, `type-first-both-1366.png`, `type-first-phone.png` and `phrases-1366.png`.
