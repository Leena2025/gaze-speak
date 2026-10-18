# GAZE V2 design pass: plan and report

Date: 18 October 2026. All six phases are done. The summary comes first, and the Phase 1 check and plan are further down.

## Update: premium indigo look, no green

**Before:** teal and mint colours, with a white side menu.

**After:** a calm, premium web-app look:
- cool porcelain-grey pages and white cards
- one **indigo** accent for chosen and active things
- a **dark ink side menu** with a lit chip on the current page
- a pink focus outline, so focus never looks like "chosen"

Green is used only for real success messages, never as the theme colour. High contrast stays black with yellow.

- **Files changed:** `src/styles/tokens.css` (the new colours, plus side-menu colour tokens for each theme) and `src/styles/app.css` (the side menu now uses those tokens).
- **Font:** Inter is used first if it is installed on the computer, then Segoe UI Variable, then Segoe UI. Nothing is downloaded.
- **Measured contrast (light):**
  - text 17:1
  - secondary text 6.2:1
  - indigo on white 6.3:1
  - side menu text 11:1
  - focus outline 5.6:1
  - All are measured against their real backgrounds.
- **Tests (run on 18 October 2026):**
  - unit 50/50, lint OK, build OK
  - browser tests 26/26, 43/43, 17/17, 12/12, 47/47 and Talk 51/51
  - design check 81/81 pages clean and 54/54 Settings groups clean, in all 3 themes and 3 text sizes
  - phone width: no sideways scrolling
- **Not checked:** how Inter looks, because it is not installed in the test browser.
- **Screenshots:** `docs/screenshots/indigo/`.

## Summary

- **Disabled buttons stay readable.** Before, they faded to 45%. Now they have a flat background, readable text (5.5:1 contrast or better) and a **dashed border** that means "not available now". This works in all three themes.
- **A pressed look.** A tap or click now tints the button at once.
- **Every page says what it is for.** A short line sits under the title on Talk, Calls, Music, News and Settings. Home is unchanged.
- **12 px between all neighbouring buttons.** This covers the side menu, the Settings groups, the language buttons, Speak/Save/Undo/Clear, the music controls and the button rows.
- **56 px minimum for every button and text box.** This covers Add contacts, Check again, Calibrate, Accuracy test and the search box.
- **The design check passes everywhere.** It covers all pages and all 6 Settings groups, in light, dark and high contrast, at normal, large and extra-large text. It found 0 problems for contrast, size, gaps or sideways scrolling.

**Not changed:** eye tracking, calibration, the coordinate mapping, the camera, dwell timing, Home's layout, the routes, the saved settings, and the text and translations.

## Page by page

| Page | What changed |
|---|---|
| Home | Nothing on the page itself. The side menu items are now 12 px apart. |
| Talk | A purpose line ("Type or choose words, then speak them."). 12 px between the English/தமிழ்/Both buttons and between Speak, Save phrase, Undo and Clear. Disabled Speak/Undo/Clear (when the message is empty) are now readable. Talk already had one message bar, the 4 ways to talk and one shared message from the earlier work. |
| Type, Needs, Symbols | These are parts of Talk, so they got the same fixes. No separate pages exist any more. |
| Calls | Purpose line. Add contacts is now full size. |
| Music | Purpose line. 12 px between the playing controls. Check again and the search box are now full size. |
| News | Purpose line. Nothing else needed changing. |
| Settings | Purpose line. 12 px between the 6 groups and between buttons in a row. Calibrate, Accuracy test and all text boxes are now full size. It still uses the 6 groups as tabs, so only one group shows at a time. |

## Files changed

| File | What changed, in simple words |
|---|---|
| `src/styles/tokens.css` | 3 new colour tokens for disabled buttons (`--disabled-bg`, `--disabled-text`, `--disabled-border`), set separately for light, dark and high contrast. A token is a named colour that every page uses, so changing it in one place changes it everywhere. |
| `src/styles/app.css` | The disabled and pressed looks. 12 px gaps (`--gap-target`) and the 56 px minimum (`--target-min`) where they were missing. The style for the purpose line, which is hidden on screens narrower than 1000 px. |
| `src/app/router.js` | Each page in the list now has a `purpose` line. Home has none. |
| `src/components/AppShell.jsx` | The top bar shows the title with its purpose line under it. |

No package was added, and no file was deleted.

## Test results (run on 18 October 2026)

| Check | Result |
|---|---|
| Unit tests | 50/50 |
| Lint | OK |
| Build | OK |
| Browser tests | 26/26, 43/43, 17/17, 12/12 |
| Symbols language test | 47/47 |
| Talk test | 51/51 |
| Design check: 9 pages × 3 themes × 3 text sizes | 81 of 81 clean, with no contrast, size, gap or sideways-scroll problems |
| Design check: 6 Settings groups × 3 themes × 3 text sizes (whole page) | 54 of 54 clean |
| Focus outline | 3 px in every theme. Its contrast against the page is 6.7:1 (light), 11.9:1 (dark) and 13.7:1 (high contrast) |
| Talk screen-fit | The same results as before this change. All laptop sizes fit at normal and large text |
| Phone width (390 px) | No sideways scrolling |

**How the design check works:** a script opens each page in a real browser (Chromium) and measures what is drawn. For every piece of visible text it compares the text colour with the real background colour behind it. It needs 4.5:1, or 3:1 for big text. It also measures every button's size and the space between neighbouring buttons. The scripts are `audit.mjs` and `settingsaudit.mjs`. They are test tools I ran here and are not added to your project.

## Known limitations

- **Not tested with a real camera and real eyes.** Dwell and gaze were tested with the mouse and the built-in gaze simulator only.
- **Extra-large text** still does not fit on some Talk methods on laptop screens, and **1024×600 screens** at large text still do not fit. Both failed before this pass too.
- **Settings scrolls** at laptop sizes. Its lower rows are below the screen until you scroll, as before.
- **The purpose lines are in English only.** The page titles in the top bar are English too.
- **Disabled buttons:** the dashed border has lower contrast in light theme (about 1.9:1). The accessibility rules (WCAG) do not require contrast for disabled controls, and their text is 5.5:1 or better.
- **Voices were not heard.** The tests record what would be spoken.

## How to run it and see the changes

1. Open a terminal in `D:\gaze project\gaze-v2\gaze-v2`.
2. Run `npm install` (only the first time), then `npm run dev`.
3. Open the address it prints (usually http://localhost:5173).
4. Look at:
   - Talk with an empty message: Speak, Undo and Clear have dashed borders but are still readable
   - the line under each page title
   - Settings → Display → Colours, to switch between light, dark and high contrast

Screenshots are in `docs/screenshots/design-pass/`. `before-overview.png` shows the pages before this pass.


## Phase 1: what I found in the real code (before the changes)

### How the project is built

- **Framework:** React 19 with Vite 8. Plain CSS, no Tailwind. Checks: `npm test` (unit tests), `npm run lint` (oxlint), `npm run build`.
- **Styles:** three CSS files, loaded in this order by `src/main.jsx`:
  - `src/styles/tokens.css`: the colours, spacing and sizes ("tokens") for the three themes
  - `src/index.css`: the old V1 screens (calibration, classic keyboard)
  - `src/styles/app.css`: all V2 pages
- **Theme switching:** `src/app/SettingsContext.jsx` writes `data-theme` (light, dark or contrast) and `data-text-size` (normal, large or xlarge) on the page's root element. `tokens.css` then picks the right colours and font size. The choice is saved in the browser's local storage with the other settings (`src/app/settingsModel.js`). The default text size is **large**. There is only one theme system, and I will keep it that way.
- **One button for everything:** `src/components/GazeButton.jsx`. Every button that eyes can select uses it. It already has dwell progress (a fill plus a bar along the bottom), focus, selected, disabled and danger styles.
- **Pages and addresses:** `src/app/router.js`. The side menu already has only 6 items: **Home, Talk, Calls, Music, News, Settings**. Type, Needs and Symbols are **not separate pages any more**. They are parts of Talk (this was done earlier today), and their old addresses still open the right part of Talk.
- **Talk:** `src/features/communicate/CommunicateHub.jsx`.
  - It has one message bar (Speak, Save phrase, Undo, Clear), then 4 ways to talk (Type message, Quick phrases, Needs, Symbols), then Call for help, then one area that changes.
  - One shared message (`src/app/MessageContext.jsx`) collects everything.
  - It opens on the keyboard.
  - English, தமிழ் and Both are supported, and mixed text is spoken with each language's own voice.
- **Settings** already has the 6 groups you asked for: Eye control, Display, Speech, Keyboard, Phrases & symbols, and Gaze model.

So most of sections 5 and 9 of your request already exist. What is left is mostly polish and fixing measured problems.

### What I measured

I wrote a browser check (`audit.mjs`) that opens every page in all 3 themes at 3 text sizes and measures what the browser really draws. It checks:

- the contrast of every piece of visible text against its real background
- the size of every button
- the gap between neighbouring buttons
- sideways scrolling
- the focus outline

| Check | Result today |
|---|---|
| Text contrast (4.5:1, or 3:1 for big text) | **Passes everywhere**: 0 problems in light, dark and high contrast, at every text size |
| Focus outline | 3 px in every theme. Its contrast against the page is 6.7:1 (light), 11.9:1 (dark) and 13.7:1 (high contrast) |
| Sideways scrolling at 1366×768 | None |
| Buttons smaller than 56 px | 5 buttons: Add contacts (Calls, 43 px tall), Check again and the song search box (Music), Calibrate and Accuracy test (Settings, 42 px tall) |
| Neighbouring buttons closer than 12 px | Side menu items (6 px apart), Settings groups (5 px), language buttons, Speak/Undo/Clear, music controls, On/Off and other choice pairs (9 px) |
| Disabled buttons | They are faded to 45% see-through, so their text gets hard to read, especially in high contrast |
| Pressed state | No look of its own |
| Page purpose | Only Settings shows a one-line explanation. Other pages show just a title |
| Fixed colours inside components | 27 places in `app.css` use a fixed colour instead of a token. Most are deliberate (the emergency alarm screen, the camera picture overlay, the contact avatars) |

## The plan

Small steps. After each step, I run all tests. I will not touch eye tracking, calibration, the coordinate mapping, the camera code or dwell timing. I will not change Home's layout.

**Phase 2: tokens and shared parts**
- Add disabled-state tokens for each theme, so disabled buttons stay readable. They get a dashed border instead of fading.
- Add a pressed state.
- Make the 12 px gap (`--gap-target`) and the 56 px minimum (`--target-min`) apply everywhere they are missing.
- Give every page a short purpose line under its title, from one list in `router.js`. It is hidden when the screen is too short, so it never pushes buttons off screen.

**Phase 3: Talk**
- It already meets the brief. I will fix the 9 px gaps (language buttons and Speak/Undo/Clear) and recheck that everything fits.

**Phase 4: other pages**
- Calls: Add contacts at full size.
- Music: 12 px gaps between the playing controls, and Check again and the search box at full size.
- Side menu: 12 px between items.
- Home: no layout change.

**Phase 5: Settings and themes**
- 12 px between the Settings groups.
- Calibrate and Accuracy test at full size.
- Rerun the contrast check in all three themes, including the new disabled and pressed looks.

**Phase 6: testing and the final report**
- All existing tests.
- The design check at 3 themes × 3 text sizes.
- The screen-fit check, Tamil and Both text, and a phone width.
- Screenshots and this report finished.

**Files likely to change:** `src/styles/tokens.css`, `src/styles/app.css`, `src/app/router.js`, `src/components/AppShell.jsx`, and maybe `src/features/settings/SettingsScreen.jsx` (only if a size fix needs it). Plus this report and the tests.
