# GAZE V2 redesign: what changed

Date: 17 October 2026. The plan is in [REDESIGN-PLAN.md](REDESIGN-PLAN.md).

## Screenshots

- After: `docs/screenshots/redesign/`
- Before: `docs/screenshots/before-redesign/`

All screenshots were taken in Chrome at 1366×768 (or 1366×657 where the file
name ends in 657). The contacts, messages and news headlines are test data.

| | |
|---|---|
| ![Home](docs/screenshots/redesign/home-768.png) | ![Settings, Eye control](docs/screenshots/redesign/settings-Eye_control-768.png) |
| ![Settings, Display](docs/screenshots/redesign/settings-Display-768.png) | ![Home, dark theme](docs/screenshots/redesign/home-768-dark.png) |

## Test results after each stage

| Stage | Unit tests | Lint | Build | Browser tests (4 sets) | Screen-fit check |
|---|---|---|---|---|---|
| 1. Colours and borders | 44/44 | 0 warnings | OK | 25/25, 42/42, 17/17, 11/11 | No hidden buttons |
| 2. App frame and Home | 44/44 | 0 warnings | OK | 25/25, 42/42, 17/17, 11/11 | No hidden buttons |
| 3. Settings and camera preview | 44/44 | 0 warnings | OK | 25/25, 42/42, 17/17, 11/11 | No hidden buttons |
| 4. Other pages and states | 44/44 | 0 warnings | OK | 25/25, 42/42, 17/17, 11/11 | No hidden buttons |

Notes:
- The screen-fit check covers every page except Settings at 1366×768,
  1366×657, 1280×720, 1536×730 and 1920×969. Settings is a helper page that
  scrolls with the mouse.
- **Three browser tests were updated, not removed:**
  - Home no longer shows the top-bar status pill, so the tests now read the
    status from the pill or from the Home status card.
  - Recenter moved into the new Eye control card, so its test now looks there.
  - The checks themselves did not change.
- **Also checked:**
  - In Settings, the arrow keys move between categories, and the focused item
    shows a visible focus ring.
  - All three themes were screenshotted.

## Not tested

- **The live camera picture with a real camera and face.** I tested that the
  preview box is placed correctly and hides when you scroll it out of view.
  In my test browser the face-tracking model can't download, so the
  camera stops before showing a picture. Please check it on your laptop:
  Settings → Eye control → Start eye control.
- **Real eye gaze on the new layout.** Selection by gaze was tested with the
  built-in simulator only.

## Files changed, in simple words

| File | What changed |
|---|---|
| `src/styles/tokens.css` | **New colours.** A calm teal and mint on a soft mint-grey background, lighter borders and one soft shadow. The dark and high-contrast themes were updated to match. Text contrast meets WCAG AA (checked with a contrast calculator). |
| `src/styles/app.css` | **Most of the new look:** <ul><li>the rail with the GAZE mark and a teal "you are here" bar</li><li>the tidier status pill and banners with icons</li><li>the new Home layout</li><li>the new Settings layout</li><li>a tick on selected choices, so selection never depends on colour alone</li><li>an info icon on every empty state, red error states and faded disabled buttons</li><li>a news icon when a story has no picture</li><li>a fix for the symbol form boxes running off the edge</li></ul> |
| `src/index.css` | Adds the style for the camera preview box. |
| `src/components/AppShell.jsx` | Adds the GAZE mark at the top of the rail and an icon to each warning banner. Hides the top-bar status pill on Home only, because Home already shows the full status. |
| `src/components/TrackingStatus.jsx` | The pill can now be hidden (used on Home). It also has a moving dot while the camera starts. |
| `src/components/Icon.jsx` | 5 new icons in the same style: monitor, chip, camera, target and info. |
| `src/features/home/HomeScreen.jsx` | **New Home layout:** <ul><li>A status card with an icon. It shows frames per second only when tracking is really on, and a Recenter button only while tracking.</li><li>A "Your message" card that is always visible, with Speak and Edit, or Start when there is no message yet.</li><li>A **Talk** row (Communicate, Type, Quick needs, Symbols) and an **Everyday** row (Calls, Music, News, Call for help).</li></ul>The same 8 destinations as before, with the same dwell times. |
| `src/features/settings/SettingsScreen.jsx` | **New Settings layout:** <ul><li>A category list on the left (Eye control, Display, Speech, Keyboard, Phrases & symbols, Gaze model), each with an icon and a short description. The arrow keys work.</li><li>Each setting is a compact row: the name on the left, the choice on the right.</li><li>Eye control starts with a status card that holds the **live camera preview**, the status, frames per second, and all the old buttons: Start or Stop camera, Recenter, Remove recenter offset, Recalibrate, and Accuracy test.</li><li>"No phrases or symbols yet" messages.</li></ul>Every setting from before is still there. |
| `src/gaze/GazeProvider.jsx` | **Camera preview only.** The tracker's existing hidden video is drawn over the preview box while Settings → Eye control is open. The video is never restarted or moved, and **no gaze maths changed**. |
| `src/features/music/Music.jsx`, `src/features/news/News.jsx` | The loading messages use the new loading style, with a spinner. |

## What did not change

- **Eye tracking and calibration:** the tracker, model, filters, the
  calibration screens and the Classic keyboard.
- **Routes:** the same 9 pages at the same addresses.
- **Data:** the saved settings, phrases, symbols, contacts and model.
- **Typing:** the keyboard's key layout and sizes, which were tuned for gaze.
- **Live gaze preview:** I did not add a second gaze marker. The existing
  gaze dot already shows where the app thinks you are looking.
