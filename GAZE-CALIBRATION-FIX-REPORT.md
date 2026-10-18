# GAZE V2 calibration fix report

Date: 18 October 2026. Written in simple English.

## In short

- **Most likely cause.** The 25 learning dots were shown **row by row**: the top row first and the bottom row last. During that minute, the head slowly sinks or leans, and that changes the head features the model uses. Because the dots went from top to bottom at the same time, the model learned "head moved = looking lower". It fitted the learning dots well, then missed the check dots, which are shown afterwards, **mostly up and down**. Your numbers match this pattern exactly:
  - learning dots: 51 px error
  - leave-one-point-out: 68 px
  - check dots: 207 px
  - vertical error 199 px, against only 44 px horizontal
- **This is not confirmed on your own camera yet.** It comes from the code plus a simulation that reproduces your numbers. Please calibrate again after redeploying (see the end) and send me the new results page.
- **The fix.** The learning dots now come in a balanced mixed order. Every round of 5 dots covers every row and every column, so time no longer matches height.
- **Two more real bugs fixed:**
  - The installed model was not the one that was checked: it was refitted on all 33 points.
  - A calibration that **failed** its check was still installed, replacing a working model.
- **Not lowered:** the 70% threshold. No metric is hidden or changed.

## Phase 1: the real pipeline (files and functions)

| Step | File · function |
|---|---|
| Webcam and frames | `src/hooks/useGazeTracker.js`, `src/gaze/tracker.js` (MediaPipe FaceMesh through TF.js) |
| Face and eye landmarks | `src/gaze/tracker.js` (478 landmarks with iris) |
| Gaze features (14 numbers) | `src/gaze/featureExtractor.js` · `extractGazeFeatures`: iris position in each eye, lid, eye openness, head roll/yaw/pitch, face position and size |
| Calibration dots and order | `src/gaze/layout.js` · `createCalibrationPlan` |
| Drawing the dot | `src/screens/Calibration.jsx`: dot at `x*100%`, `y*100%` of a full-page fixed stage |
| Collecting frames | `Calibration.jsx` · `onFrame` / `completeTarget`: 0.7 s settle, ≥15 frames, blink filter, outlier filter, up to 2 repeats |
| Learning vs check data | `src/gaze/calibrationData.js` · `trainFromCalibration`: `pass: "train"` vs `"validation"` |
| Model fit and choice | `src/gaze/ridgeModel.js` · `trainGazeRegressor` (leave-one-point-out picks basis and λ), `fitRidge`, `predictRaw` |
| Coordinates | Everything uses **0–1 page units** (fraction of `innerWidth` × `innerHeight`). `pixelError` converts to px once, for reporting only. |
| Saving and restoring | `src/gaze/modelStore.js` · `installModel`, `restorePreviousModel`; localStorage `igaze.model.active` and `igaze.model.previous` |
| Gaze to tile | `src/gaze/GazeProvider.jsx` (prediction × `innerWidth`/`innerHeight`), `src/gaze/targets.js`, `src/gaze/layout.js` · `hitTest` |
| Results page | `src/screens/Results.jsx` |
| Build and Netlify | `vite.config.js`, `netlify.toml`. There is no gaze setting in the environment variables. |

## Phase 2: what I checked

**A. Coordinate mismatch: none found.**
- The dot is placed at `x*100%`, `y*100%` of a stage that covers the whole page (`position: fixed; inset: 0`).
- The labels are the same `x`, `y` values.
- Predictions are in the same 0–1 units, and are turned into px with `innerWidth` and `innerHeight` (CSS px) in exactly one place.
- Device pixel ratio and zoom never enter the maths. No axis is swapped or flipped (new unit test).

The numbers also argue against a coordinate bug. A wrong scale or origin would make the learning dots wrong too, but they fitted at 51 px.

**B. Sample labels: correct.**
- Each frame is labelled with the dot that was on screen. Only frames taken **after** that dot's collection window opened are used, so nothing leaks from the previous dot.
- Frames without a face are not used.

**C. Why 51 px on learning dots but 207 px on check dots.**
- **Row-by-row order.** Leave-one-point-out cannot see the problem, because neighbouring dots in time share the same head drift. That is also why it chose the weakest regularisation (λ = 0.01).
- **Simulation** (synthetic eye data shaped like a webcam's, with a head sinking about 4% of the camera frame over the minute, 8 runs):

  | Order | Learning | Leave-one-out | Check | Horizontal | Vertical | Large-tile hits |
  |---|---|---|---|---|---|---|
  | Old (row by row) | 88 px | 93 px | 201 px | 69 px | 177 px | 31% (12–58%) |
  | New (balanced) | 97 px | 103 px | 99 px | 67 px | 60 px | 85% (82–88%) |
  | Old, no head drift | ≈ 91 px | ≈ 96 px | ≈ 99 px | 66 px | 60 px | ≈ 84% |

  With no head drift, both orders are equally good, so the new order costs nothing.
- **These are simulated numbers, not your camera.**

**D. Production vs local: no Netlify-specific cause found.**
- It is the same code.
- The model is stored in the browser for each site address, so the Netlify site has its own models, separate from localhost.
- No environment variable affects gaze.
- Two real problems were found:
  - The installed model was **refitted on all 33 points**, so the model in use had never been checked.
  - **A failed calibration was installed anyway**, so it replaced a working model.

**E. Real-world tracking.** Light, head movement and camera angle still matter. The page now shows when the face is lost, and counts unusable frames.

## Phase 3: the fix

| File | Change |
|---|---|
| `src/gaze/layout.js` | `createCalibrationPlan`: balanced Latin-square order of the 25 learning dots. Every round of 5 visits every row and column, and the order inside each round is random. The check dots are unchanged. |
| `src/gaze/calibrationData.js` | The installed model is now **exactly the model the check measured** (learning points only), and the model file says so (`fittedOn`). Check results now include the signed average shift (`meanDxPx`, `meanDyPx`) and the average landing point per check dot. New `diagnoseCalibration()` explains a failure from measured numbers only. The CSV now also contains the 14 eye features of every frame. |
| `src/screens/Calibration.jsx` | Counts frames without a face, blinks, outliers, repeated points and points that stayed unsteady. The bar shows "Learning point n of 25" or "Check point n of 8", and "Face tracked" or "Face lost: these frames do not count". The intro explains the mixed order and asks you to rest your head. |
| `src/screens/Results.jsx` | Installs **only if the check passed**. A failed check says "not installed; your previous model is still in use", shows the **most likely cause** and offers only "Calibrate again". New check-point map and frame-quality facts. The wrong "refitted on all points" sentence is corrected. |
| `src/gaze/diagnostics.js`, `src/gaze/GazeProvider.jsx` | The `?gazedebug` panel now also shows the model version, how it was fitted, its check result and shift, the tile under the gaze, and all 14 features. |
| `src/index.css` | Styles for the tracking label and the map. |
| `tests/calibration.test.js` | New, 9 tests. |
| `README.md` | Calibration section updated. |

**Not changed:**
- the feature extractor and the face tracker
- the ridge-regression maths and the λ grid
- the 70% threshold, the dwell, the filters and the tile layout
- login, Talk, themes and accessibility

## Phase 4: calibration feedback (what the person sees)

- **Before starting:** steps, the mixed order, "rest your head", and the camera and face status.
- **During:** which dot (learning or check, n of total), the ring filling as frames are collected, and the face status.
  - "Keep looking at the center of the dot" appears when a dot is repeated.
- **After:**
  - pass or fail
  - the most likely cause:
    - **shift**: the head moved between the learning and the check dots
    - **tracking**: too many frames thrown out or the face was lost, so fix the light or the camera position
    - **noisy**: even the learning dots fit badly
  - the map, the frame-quality counts, the per-point table, and a CSV download
  - "Calibrate again"

## Phase 5: debugging

Open the site with **`?gazedebug`**, for example `https://gaze-speak.netlify.app/?gazedebug`. The panel shows:
- the raw, corrected and filtered prediction (0–1)
- the dot position in px and where it was expected
- screen size, zoom (device pixel ratio) and full-screen state
- the model's version, feature set, basis, λ, how it was fitted, and its check result and shift
- the tile under the gaze
- lost frames
- all 14 eye features
- which features push the vertical prediction most

There are no pictures and no personal data, and it is off unless the address asks for it.

Expected against predicted for every frame is on the results page: the map, the per-point table and the CSV. In normal use the app cannot know where you meant to look, so live error cannot be measured there.

## Phase 6: tests (run on 18 October 2026, in this container)

| Check | Result |
|---|---|
| Unit tests | **63 of 63 pass**: the 54 earlier ones plus 9 new calibration tests |
| Lint | OK |
| Build | OK |
| Browser tests: part 1, part 2, part 3b, sweep, Symbols, Talk, sign-in | 26/26, 43/43, 18/18, 13/13, 47/47, 51/51, 30/30 |
| New browser check of calibration (simulated eyes) | 16/16 |
| `?gazedebug` panel with a test model | Shows all new lines, with no page errors |

**What the new browser check covers:**
- Learning dots are no longer row by row.
- A good calibration passes, is installed and draws the map.
- When the check dots are deliberately looked at 180 px too low:
  - the check fails
  - it says "not installed"
  - it names a shift "too low"
  - only "Calibrate again" is offered
  - the working model is **not** replaced

**The new unit tests cover:**
- the balanced order, and that it is unrelated to height
- head drift (synthetic): the old order failed 6 of 6 times, the new order passed 6 of 6
- the installed model reproducing the reported check numbers exactly
- labels
- CSV columns
- save and reload
- pixel conversion
- the gaze-to-tile hit test
- the diagnosis

**Before and after on your camera: not measured.** The only real "before" is your screenshot. The "after" numbers above are simulated.

## Remaining manual checks (need your webcam)

1. Redeploy, then calibrate again on the Netlify site. Note the check result and the "Most likely cause" line.
2. If it still fails, press **Download CSV** and send it to me. It now has the eye features, so I can re-analyse your real frames.
3. Try with light in front of you, the laptop camera at eye level, and your head resting if possible.

## How to redeploy and verify

1. Run `npm test` in `D:\gaze project\gaze-v2\gaze-v2`. It should say 63 pass.
2. Push the code:
   ```
   git add -A
   git commit -m "Fix calibration order and install only checked models"
   git push
   ```
3. Wait for Netlify to show "Published".
4. Open `https://gaze-speak.netlify.app` and press **Ctrl+F5** so the browser loads the new version.
5. Go to Settings → Eye control → **Recalibrate**. Check that the learning dots jump around the screen instead of going row by row.
6. Read the results page. To watch live numbers afterwards, open `https://gaze-speak.netlify.app/?gazedebug`.
