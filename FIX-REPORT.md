# GAZE V2: check and fix report

Date: 17 October 2026
Folder checked: `D:\gaze project\gaze-v2\gaze-v2` (your own copy)

## 1. What I checked first

- I compared all 72 source files in your folder with the copy I test, using
  checksums (a fingerprint of each file). They were all identical, so every
  result below is about your actual code.
- Your folder also contains `legacy/`. That is the older TensorFlow version.
  It is not part of the app and is not built, so I left it alone.

## 2. Errors found

| # | Problem | Kind | Status |
|---|---|---|---|
| 1 | **A new calibration was not used.** The app kept using an older gaze model. | Logic bug | **Fixed and tested** |
| 2 | The calibration results page could not scroll, so its buttons were hidden. | Layout bug | Fixed earlier today |
| 3 | The Home page could not show all its buttons on smaller laptop screens. | Layout bug | Fixed earlier today |
| – | Compile errors | – | None. Build succeeds and lint has 0 warnings. |
| – | Runtime errors | – | None. All 9 pages were opened with eye control on, and there were no app errors in the browser console. |

## 3. Problem 1: the gaze dot stuck at the bottom

### What was wrong (root cause)

File: `src/screens/Results.jsx`

After a calibration, the app only switched to the **new** model if this was
the very first model. If a model already existed, the new one was used **only
after you pressed "Use this model"**. That button is at the very bottom of
the results page.

You hadn't pressed it if:
- the page couldn't scroll (problem 2), or
- you left the page in any other way, for example with Back to the app,
  reloading, or closing the tab.

In those cases the app silently kept the **old model**.

Where can an old model come from? Version 1 and Version 2 both run at the same
address, `http://localhost:5173`. The browser keeps one shared storage per
address, and both versions save the model under the same name
(`igaze.model.active`). So **V2 automatically uses a model saved by V1**,
calibrated at a different time, in a different seat and a different window.

An old model gives wrong positions. When a wrong position is below the
screen, the dot is drawn on the bottom edge, because the app keeps the dot
inside the screen. That is exactly "the dot stays at the bottom".

### Proof (browser test, simulated eyes, 1366×657 window)

I put an old, wrong model in place, recalibrated from Settings, and then left
the results page without pressing the button.

| | Before the fix | After the fix |
|---|---|---|
| Model in use after recalibrating | the **old** one (dated 1 Jan) | the **new** one |
| "Use this model" button | at y = 971 px on a 657 px tall window, so off screen | not needed |
| Looking at the screen centre (683, 329) | dot at **(684, 657)**, the bottom edge | dot at **(683, 344)** |
| Looking near the top (683, 131) | dot at **(680, 604)**, near the bottom | dot at **(664, 148)** |

### The fix (smallest safe change)

```js
// Before
useEffect(() => {
  if (hadModel || autoInstalled.current) return;   // skipped when a model existed
  ...

// After
// Install the new calibration right away. The older model is kept as a
// backup and can be restored in Settings, Gaze model.
useEffect(() => {
  if (autoInstalled.current) return;
  ...
```

Nothing is lost by this change. The app already keeps the previous model as a
backup, and **Settings → Gaze model → Restore** brings it back.

### What I could not prove

I can't see your browser's storage, so I can't be 100 % sure your laptop had
an old model. You can check it yourself in **Settings → Gaze model**: the
"Calibrated" line shows the date and screen size of the model in use. If
that date is earlier than your last calibration, this was your problem.

## 4. Does the bright background affect gaze detection?

- Calibration and the Classic keyboard use a **dark** screen. The new pages
  use a **light** theme by default.
- The model uses how open your eyes are as one of its clues, because the
  eyelids lower slightly when you look down. A bright screen can also make
  people narrow their eyes.
- So brightness **can** shift the dot. I could not measure it, because my
  test browser has no real camera. I did **not** change anything for it.
- To test it yourself: open the app with `?gazedebug`, look at the top of
  the screen, and read `eyeOpenness z=` in the black panel. A value below
  about −3 means your eyes are much narrower than during calibration. If so,
  try **Settings → Display → Dark**.

## 5. Calibration in GAZE V2

**It exists and works.** V2 uses the same 33-dot calibration as V1. Only two
small V1 bug fixes were made in the gaze code; the model maths is unchanged.

How to use it:
1. Sit the way you will use the app. Press **F11** for full screen.
2. Go to **Home → Calibrate**, or **Settings → Eye control → Recalibrate**.
3. Press **Continue**, then **Start**, and look at each dot until its ring
   fills (about 1 minute).
4. On the results page the new model is now **used straight away**. Press
   **Start using eye control**.

**Old V1 calibration data:** fully compatible. It uses the same storage name,
the same model version (3) and the same feature set. That is why V2 picked it
up on its own. After this fix, calibrating once in V2 replaces it.

## 6. Files changed today

| File | Change |
|---|---|
| `src/screens/Results.jsx` | Uses the new calibration right away (problem 1). |
| `src/gaze/diagnostics.js` | **New.** Diagnostic panel for `?gazedebug`; now also shows the date of the model in use. |
| `src/gaze/GazeProvider.jsx` | Sends numbers to the diagnostic panel. Gaze maths unchanged. |
| `src/screens/Demo.jsx` | Same, for the Classic keyboard. |
| `src/index.css` | Results page scrolls (problem 2). |
| `src/styles/app.css` | Home fits the screen (problem 3), plus the panel style. |
| `src/components/AppShell.jsx` | No duplicate status banner on Home. |
| `tests/v2.test.js` | One new test for the diagnostic numbers. |

## 7. Tests and results

| Test | Result |
|---|---|
| Unit tests (`npm test`) | **44 passed, 0 failed** |
| Lint (`npm run lint`) | **0 warnings** |
| Build (`npm run build`) | **Succeeds** |
| Browser: typing, keyboard, tiles, settings, layouts | **25 / 25 passed** |
| Browser: quick needs, symbols, calls, music, news, alert | **42 / 42 passed** |
| Browser: calibration, eye control, face lost, recenter, Classic, camera errors | **17 / 17 passed** |
| Browser: all 9 pages with eye control on, console errors | **9 / 9 pages, no app errors** |
| Browser: old-model test (section 3) | **Fails before the fix, passes after** |
| Browser: dot position at 5 screen points, Classic, and 125 % zoom | **11 / 12 passed.** The miss was a timing issue in the test: the Classic screen draws its dot one frame later, so reading it back immediately is off by a few pixels. It is not a fault in the app. |

**Not tested** (needs your hardware): a real webcam and real face, real
speech voices, live BBC news, and a real phone dialer. All browser tests use
the built-in eye simulator.

## 8. Remaining problems

- Webcam eye tracking is never perfect. Recalibrate after moving the laptop
  or changing seats.
- The bright-screen effect (section 4) is not measured yet.

## 9. How to run and use the corrected app

1. Open a terminal in `D:\gaze project\gaze-v2\gaze-v2` and run
   `npm run dev`, or double-click `run-project.bat`.
2. Open http://localhost:5173 in Chrome or Edge and press **F11**.
3. **Recalibrate once**: Settings → Eye control → Recalibrate. This replaces
   any old V1 model.
4. On the results page, press **Start using eye control**.
5. If the dot is still wrong, open http://localhost:5173/?gazedebug and send
   me a screenshot of the black panel while you look at the top of the screen.
