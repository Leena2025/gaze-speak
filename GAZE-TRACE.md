# Why the gaze dot sits at the bottom: code trace

Checked on 17 Oct 2026, against the files in `D:\gaze project\gaze-v2\gaze-v2`.
I compared checksums first, so the code traced here is your code.

## Short answer

I traced every step from the camera to the dot and found **no coordinate
bug**. The new pages and the Classic keyboard use the same maths. The
coordinates are 0 to 1, the axes are not swapped, and the dot is drawn exactly
where the numbers say. This was tested in a browser at several sizes and at
125 % zoom.

So something on the camera side must differ between calibration and use.
The code can't show me which thing that is, so I added a diagnostic panel
that shows it on your laptop. I have **not** fixed anything for the dot yet,
because I have no evidence of the cause yet.

## Step-by-step trace

| Step | File and line | What happens | Checked |
|---|---|---|---|
| 1. Camera frame → 478 face points | `src/gaze/tracker.js` (`startFrameLoop`) | The video is 640×480. Points are in video pixels. | Same in calibration, new pages and Classic, because all three use `useGazeTracker`. |
| 2. Points → 14 features | `src/gaze/featureExtractor.js:143-144` and others | Iris position inside the eye, **eyelid gap (`eyeOpenness`, `lidRatio`)**, head angle, and face position and size. Divided by the video size, so the screen size doesn't matter. | Same function everywhere. |
| 3. Calibration targets | `src/screens/Calibration.jsx:105`, `:267` | Each dot's position is stored as a fraction of the window (0 to 1). x goes right and y goes down. The dot is drawn at `left: x*100%`, `top: y*100%` inside a full-window `.stage`. | Correct. |
| 4. Model | `src/gaze/ridgeModel.js:149` `predictRaw` | `y = biasY + Σ z_j · weightY_j`, where `z_j = (feature − calibration mean) / calibration std`. **No clamping**, so the output can go below 0 or above 1. | Correct. The test checks that the per-feature parts add up to exactly this result. |
| 5. Recenter offset | `src/gaze/GazeProvider.jsx:240` (`Demo.jsx:302` for Classic) | Adds the Recenter correction, at most ±0.2. It resets on reload. | Identical in both. |
| 6. Smoothing | `GazeProvider.jsx:241` (`Demo.jsx:303`) | One Euro filter, same settings (0.8 / 2.5). | Identical. |
| 7. Hit test | `src/gaze/targets.js:16` | Clamps the point to 0 to 1, then finds the button under it. | Clamping happens only here and in step 8. |
| 8. Dot drawing | `GazeProvider.jsx:190-191` (`Demo.jsx:349`, `:416`) | `clamp(x) × innerWidth`, `clamp(y) × innerHeight` CSS pixels, with `position: fixed`. | The drawn dot matched the expected pixel to within 1 px. |

**Axes:** x maps to width and y maps to height everywhere. Nothing is swapped.

**Clamping:** a model output of y > 1 (looking "below the screen") is drawn on
the bottom edge. This is the only way the code makes a dot stay on the
bottom edge. If your dot is stuck there, the model itself is predicting
y > 1. The diagnostic panel shows this as `OFF-SCREEN`.

**Zoom and window size:** both the model and the drawing use fractions of the
window. Browser zoom changes CSS pixels on both sides equally. In the test at
125 % zoom with a different window size, the dot still landed where the
simulated eyes looked.

**Full screen:** this one does matter physically. The model learns "fraction
of the window". If you calibrate full screen and then use a normal window,
the window starts lower on the physical screen, under the browser toolbar.
Every dot is then drawn a little lower than where you look, by roughly the
toolbar's share of the screen height (about 10 %). That moves the dot down,
but it does not pin it to the bottom edge.

## The new pages compared with the Classic keyboard

The gaze maths is identical. The only differences are:

1. **Screen brightness.** Calibration and the Classic keyboard both draw on
   the dark `.stage` (`Calibration.jsx:256`, `Demo.jsx:352`). The new pages
   use the **light** theme by default (`src/app/settingsModel.js:21`). The
   model uses eyelid features (`eyeOpenness`, `lidRatio`). Looking down
   closes the eyelids a little, so during calibration "narrower eyes" was
   learned as "looking lower". A bright white page can make the eyes narrower
   too, and the model would then read that as looking down. **This is a
   possible cause, not a proven one.**
2. **Camera preview.** Classic shows a small camera picture; the new pages
   hide it. The tracker reads the frame size from the stream, not from the
   picture size, so this doesn't change the numbers.

## Diagnostic panel (new)

Open the app with `?gazedebug` in the address bar:

    http://localhost:5173/?gazedebug

Then start eye control. A black panel on the right shows, five times a second:

- `raw`: the model output, not clamped. `OFF-SCREEN` is shown when it is
  outside 0 to 1.
- `corrected`: raw plus the Recenter offset.
- `filtered`: after smoothing. `(clamped to edge)` is shown when it is off
  screen.
- `dot px`: the real position of the drawn dot, read back from the page, next
  to the position the numbers say it should have.
- The window size compared with the calibration size, full screen yes or no,
  zoom and theme.
- **Y pushes**: the three features moving the vertical position most, with
  `z` = how many standard deviations each is away from calibration. A feature
  with |z| > 3 is listed under `OUT OF CALIBRATION RANGE`; the model is then
  guessing outside what it learned.

The same line is written to the browser console (F12) once a second, starting
with `[gaze app]` or `[gaze classic]`. The Classic keyboard shows the same
panel when it is opened from a page with `?gazedebug`.

Files: `src/gaze/diagnostics.js` (new), plus small hooks in
`src/gaze/GazeProvider.jsx` and `src/screens/Demo.jsx`, and the panel style at
the end of `src/styles/app.css`. A unit test checks that the panel's per-feature
numbers add up exactly to the model's prediction.

## What the panel will tell us

| What you see while looking at the top of the screen | Cause | Smallest fix |
|---|---|---|
| `raw` y > 1, `eyeOpenness` or `lidRatio` z below −3, and it gets better in the dark theme | Brightness changes the eyelid gap | Calibrate in the same theme you use, or make the app default to dark |
| `raw` y > 1, `faceY`, `faceScale` or `headPitch` far out of range | You sit differently from calibration | Recalibrate in the position you use the app in |
| `raw` y looks right but `dot px` differs from `expected` | A drawing bug | Fix in `GazeProvider.jsx` (not seen in testing) |
| Full screen "no" now but the calibration size equals the full screen size | Window and full-screen mismatch | Use F11, or recalibrate in the same window |
