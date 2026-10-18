# GAZE V2 redesign plan

Date: 17 October 2026

## What the app is built with (checked in the code)

- **React 19 + Vite**, with plain CSS. There is no UI library and no Tailwind,
  and the redesign adds no new dependencies.
- **Design tokens** in `src/styles/tokens.css` hold the colours, corners,
  spacing and fonts, with light, dark and high-contrast themes.
- **All component styles** are in `src/styles/app.css`.
- **Shared parts:**
  - `GazeButton` is every selectable button. It does dwell, the progress fill
    and the locked and flash states.
  - `Icon` is one line-icon set.
  - The rest are `AppShell` (rail, top bar, banners), `TrackingStatus`,
    `MessageBar` and `Pager`.
- **Eye tracking:** the `GazeProvider`, tracker, model and calibration files
  are **not touched**, except one small addition for the camera preview (see
  Settings).

## What looks wrong today (from screenshots at 1366×768)

- **Home** says "Pointer dwell on" twice, in the top-bar pill and in a big
  status card. The 8 cards are tall, with empty space in the middle.
- **Settings:** each setting is a full-width box with its own big On/Off
  buttons. Only 2–3 settings fit on screen and the rest needs scrolling. The
  six category tabs look like the other big buttons.
- **Overall:** the borders are heavy (2 px grey everywhere), the background is
  a grey-beige, and the panels and shadows differ from page to page.

## Page-by-page plan

| Page | Change |
|---|---|
| **Everywhere (tokens)** | A calm teal and mint palette on a soft mint-grey background. Lighter borders, one soft shadow, consistent corners (10, 14 and 18 px) and one spacing scale. The dark and high-contrast themes are kept and adjusted to match. Text contrast stays at WCAG AA or better. |
| **App frame** | The rail gets a small GAZE mark and a clear teal "current page" marker. The top bar gets a tidier status pill (with a moving dot while the camera starts) and a lighter Pause button. The warning banners get an icon and a consistent style. |
| **Home** | One compact status strip, with no repeated text, and the right action beside it. Real tracking numbers (frames per second) are shown only when they exist. Below that sits the current message, then two clear rows: **Talk** (Communicate, Type, Quick needs, Symbols) as larger cards, and **Everyday** (Calls, Music, News, Call for help) as smaller cards. Everything still fits on one screen. |
| **Settings** | A **left category list** (Eye control, Display, Speech, Keyboard, Phrases & symbols, Gaze model), each with an icon and a one-line description. Each setting becomes a **compact row**: the name and hint on the left, the choice buttons on the right. **Eye control** starts with a status card with a **live camera preview** and the actions (Start or Stop camera, Recenter, Calibrate, Accuracy test). |
| **Communicate, Needs, Symbols, Calls** | The same card style, icon chips and spacing. The empty states get an icon and one clear action. |
| **Music, News** | The same panel style. The empty and error states are cleaned up. |
| **Keyboard** | Only the shared colours and borders change. The key sizes and layout stay as they are, because they were tuned for gaze. |
| **States** | One consistent look for: loading (a moving dot), empty (an icon, a message and an action), error (a red notice with retry), paused (an amber banner), dwell (teal fill), selected (teal with a tick), and disabled (faded). |
| **Keyboard use and focus** | Every button keeps a visible 3 px focus ring. The Settings category list keeps `role="tab"`, and arrow-key movement is added there. |

## Live gaze preview and calibration access

- **Camera preview:** possible and correct. The app already has a hidden
  `<video>` that the tracker reads. The preview shows that same video in a box
  on the Eye control page while the camera is on. It does not start the camera
  by itself and does not change any tracking maths. When the camera is off,
  the box says so.
- **Gaze point preview:** the existing gaze dot already shows where the app
  thinks you are looking. I won't add a second, separate gaze marker, because
  it would only repeat the dot.
- **Calibration:** reachable from Home (when needed) and from Settings → Eye
  control and Gaze model, as today.

## Files I expect to change

- `src/styles/tokens.css`: the palette, shadows and radii.
- `src/styles/app.css`: most of the visual work.
- `src/components/AppShell.jsx`: the rail mark and banner icons.
- `src/components/TrackingStatus.jsx`: the pill states.
- `src/components/Icon.jsx`: a few new icons (display, model, camera, target,
  info).
- `src/features/home/HomeScreen.jsx`: the new Home layout.
- `src/features/settings/SettingsScreen.jsx`: the new Settings layout.
- `src/gaze/GazeProvider.jsx`: the camera preview only (a "where to show the
  video" slot). There is no change to the gaze maths.
- Small markup changes for empty states in Music, News, Calls and Symbols.

## Stages (build and tests after each)

1. Tokens and base styles.
2. App frame and Home.
3. Settings, plus the camera preview.
4. Other pages and states.
5. Final checks: all browser tests, the screen-fit check at 5 sizes, the
   three themes, then a copy to your folder.
