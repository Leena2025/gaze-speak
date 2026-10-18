# I-Gaze Version 2: what was built

Version 2 was built on a copy of the prototype in `gaze project/gaze-v2/`.
The original folder is unchanged. Run steps and day-to-day use are in
[README.md](README.md); this file is the hand-over report.

## 1. What the existing app was

- React 19 + Vite 8, plain JavaScript, no backend or database. Tests use
  Node's built-in test runner; lint uses oxlint.
- Eye tracking: webcam → TensorFlow.js MediaPipe FaceMesh (478 face points)
  → 14 eye/head features → ridge regression trained by a 33-dot calibration →
  One Euro smoothing → key hit test → dwell selector with re-arm lock.
- One typing screen (28 keys or 6 large tiles), Speak through the browser's
  speech engine, a local Alert, an accuracy test, and model
  import/export/backup in the browser's localStorage.
- Navigation was a simple screen switch in `App.jsx`. The dwell logic lived
  inside the Demo screen only.
- It worked well (19/19 tests passing). The mentor bug report listed one
  medium and five low issues.

## 2. Features implemented

**Shared gaze engine.** One engine (`GazeProvider`) now drives every page,
using the V1 model, filter and dwell selector unchanged. Any button marked as
a gaze target works by eye. It shows dwell progress, a selection flash, a
dashed "look away to repeat" state after selecting, and a gaze ring. It also
has Pause/Resume by eye, Recenter, and pointer-dwell and touch modes. Inside a
dialog, only the dialog's buttons can be selected. Status is always honest:
not started, needs calibration, starting, tracking on, face not found, eyes
not visible, camera problem (with the reason and Retry). Selection stops while
tracking is lost.

**App shell.** Nine sections with a large labelled navigation rail (a bottom
bar on phones), a top bar with the title, music and tracking status, and
warning banners. The browser Back button and page reloads work (hash routes).

**Communication.**
- Shared message with Undo, saved in the browser.
- Communicate hub.
- Full-screen keyboard: A–Z or QWERTY, Shift/Caps, auto capitals, numbers
  and punctuation, delete letter or word, Space, Speak, Undo, Clear (longer
  dwell), Save phrase, and a large-tile mode.
- Local word suggestions, with next-word prediction and learning of the
  user's words and names.
- Quick needs: 24 phrases in 4 groups plus My phrases, spoken automatically.
- Symbols: 32 symbols in 5 groups plus My symbols; symbols add sentences to
  the message.
- English and Tamil text for every phrase and symbol.

**Calls.** Contacts managed by a helper, most-called first. Call through a
`tel:` link (the device's dialer), SMS or WhatsApp with the current message,
and a clear status that never claims a call connected.

**Music.** One audio player for the whole app, with search (including a gaze
search keyboard), play/pause, previous/next, ±15 s, repeat list/song/off,
shuffle, volume, automatic next song, a stop at the end of the list, skipping
of broken files, a mini player in every section, and an autoplay-block
message. A script builds the library list from your MP3 files.

**News.** BBC News RSS in English (5 topics) and Tamil, through a small
server endpoint with caching and refresh limits. Each story shows its
headline, source, date and picture. The publisher's summary is clearly
labelled. You can have a story read aloud or open the original article.
Loading, empty, error and stale states are handled.

**Settings.** Input mode, dwell time (0.5–3 s), sound, gaze ring, text size,
light/dark/high-contrast colours, language, voices, speech speed, auto-speak,
keyboard order and key size, learned words, my phrases and symbols, and the
gaze model (moved here from V1's home screen).

**Mentor bug fixes.**
- Hidden typing behind the test result box.
- The Restore button staying visible.
- The CPU fallback.
- The unfair shuffle.
- The hard-coded Node path.
- The lint warnings.

The mentor's suggested improvements were also done: dismiss the alert by
eye, word prediction, keeping the typed text, and loading TF.js only when
needed (the first download dropped from 1.29 MB to 372 kB).

## 3. Files

**New**
- `src/gaze/GazeProvider.jsx`, `src/gaze/targets.js`: the shared engine
- `src/app/`: settings, message, speech, notices, alert, user content,
  router, storage
- `src/components/`: `AppShell`, `GazeButton`, `Icon`, `MessageBar`,
  `TrackingStatus`, `Pager`, `SearchKeyboard`
- `src/features/home`, `communicate`, `keyboard` (with `predictor.js`,
  `layouts.js` and `wordlist.js`), `needs`, `symbols`, `calls`, `music`,
  `news`, `settings`
- `src/content/phrases.js`, `src/content/symbols.js`
- `src/styles/tokens.css`, `src/styles/app.css`: the design system
- `server/news.js`, `server/news-feeds.json`, `server/index.js`
- `scripts/build-music-library.mjs`, `scripts/build-wordlist.mjs`
- `tests/v2.test.js`, `tests/fixtures/rss-sample.xml`
- `.env.example`, `.gitignore`, `public/music/README.txt`, `V2-REPORT.md`

**Changed**
- `src/App.jsx`: providers, routes and the V1 flows
- `src/main.jsx`, `index.html`, `public/favicon.svg`
- `src/index.css`: now uses the design tokens; the calibration screen stays
  dark
- `src/hooks/useGazeTracker.js`: loads TF.js on demand
- `src/gaze/tracker.js`: CPU fallback fix
- `src/gaze/ridgeModel.js`: lint fix
- `src/screens/Demo.jsx`: mentor bug fixes 1 and 4
- `src/screens/Results.jsx`, `src/screens/ScreenCheck.jsx`: wording
- `vite.config.js`: news API in the dev and preview servers
- `package.json`: version 2.0.0, plus the `start` and `music:index` scripts
- `run-project.bat`: removed the fixed Node path
- `README.md`: rewritten

**Removed**
- `src/screens/Home.jsx`: replaced by the new Home. Its model
  import/export/restore is now in Settings → Gaze model.

## 4. Run

```bash
npm install
npm run dev          # http://localhost:5173  (or double-click run-project.bat)
```

For production, run `npm run build`, then `npm start`, then open
http://localhost:4173. On first use a helper calibrates once and presses
**Start eye control**.

## 5. Environment variables

No API keys are needed. All of these are optional (see `.env.example`):

- `PORT` and `HOST` for `npm start`
- `NEWS_FEEDS_FILE` to use your own news feed list

## 6. Adding the MP3 library

1. Copy the files into `public/music/`.
2. Run `npm run music:index`.
3. Reload the Music page.

Titles and artists come from the MP3 tags, or from the file name in the form
`Artist - Title`. You can edit `library.json` by hand; your edits are kept
when you run the command again.

## 7. News integration and language limits

- The news comes from BBC News public RSS (no key).
  - English: Top stories, India, World, Health and Technology.
  - Tamil: BBC News தமிழ் `https://feeds.bbci.co.uk/tamil/rss.xml`. Its
    existence and format (headline, summary, date and picture per story) were
    checked through BBC's own World Service feed listing.
- Tamil has one topic only, because no Tamil category feeds were verified.
- The cloud machine used to build this could not reach BBC (blocked
  network). So the live feeds were not loaded here. The full path was tested
  with a local copy of a feed in the same format. Please open News once on
  your computer to confirm.
- BBC allows personal, non-commercial use of its feeds with credit. The app
  shows the credit and links to the original article.

## 8. Calling on this platform

- The app is a web app, so calls go through the device:
  - `tel:` opens the phone dialer on Android and iPhone, or Phone Link or
    FaceTime on a computer when one is set up.
  - `sms:` opens the messaging app.
  - `wa.me` opens WhatsApp.
- The app cannot know whether a call connected or ended, and it says so.
- No VoIP provider was added. Opening the device's own dialer meets the need
  without accounts, servers or costs.

## 9. Tests and builds run (actual results)

- `npm test`: **43 passed, 0 failed**. These are the 19 original tests plus
  24 new ones: message editing, settings, suggestions, gaze hit testing, the
  dwell re-arm, the music queue, phone links, phrase and symbol content, the
  news parser, and the news API cache and errors.
- `npm run lint`: no warnings.
- `npm run build`: succeeds. The main bundle is 372 kB, the word list is
  113 kB (loaded when the keyboard opens), and face tracking is 918 kB
  (loaded when eye control starts).
- **Browser tests: 84 of 84 checks passed** (Playwright, headless Chromium,
  driving the real app). They covered:
  - Navigation by dwell.
  - Typing by dwell, with no repeat on a long look and a visible progress
    indicator.
  - Suggestions, punctuation, Shift and Caps, numbers, delete, Undo, and
    Clear needing its longer dwell.
  - Tile mode and the QWERTY setting.
  - Quick needs, symbols building one shared message, and Tamil phrases.
  - Contacts with phone number checks, `tel:`/WhatsApp links, and blocking
    background targets while a dialog is open.
  - Pause/Resume by eye, and raising and stopping the help alert by eye.
  - Music: play, keeping play across sections, the automatic next song,
    search, skipping a broken file, the end of the list, and volume.
  - News: English/Tamil, the publisher label, the error state, and the
    refresh limit.
  - Settings kept after a reload, and themes.
  - Phone, tablet and desktop layouts with no sideways scrolling.
  - The full camera path with the built-in simulator: a 55-second
    calibration, a trained model, eye control on, navigating and typing by
    simulated gaze, "face not found" pausing selection, recovery, Recenter,
    and the V1 accuracy test screen.
  - Without a camera: the clear "No camera was found" message. With a fake
    camera but no model download: the clear "Could not load the
    face-landmark model" message, never a fake "tracking" status.
- The production server (`npm start`) was checked: it serves the app,
  supports seeking within songs, refuses requests for files outside the app
  folder, and serves the news API.
- **Not tested here** (this needs your hardware): a real webcam with a real
  face, real voices (the test browser had none, and the app reported that
  correctly), real BBC feeds, and a real phone dialer.

## 10. What still needs hardware, credentials or more work

- Test eye control on your laptop with the real camera and calibration.
- Check the Tamil phrase and symbol wording with a native speaker. Install a
  Tamil voice on the device that will be used.
- Open News once to confirm the BBC feeds load on your network.
- Add your 60 MP3 files as described in section 6.
- Try a call on the actual phone or computer; some browsers ask "Open this
  app?" the first time.
- Possible next steps:
  - Tamil keyboard and Tamil word suggestions.
  - Phrase predictions.
  - Syncing settings and contacts between devices (this needs a backend and
    accounts).
  - Bundling the face model files so the app works fully offline.
