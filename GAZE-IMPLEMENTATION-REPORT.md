# GAZE V2: sign-in, calibration and Netlify report

Date: 18 October 2026. Written in simple English.

## In short

- **Sign-in is real.** It uses Supabase Auth, and passwords are kept only on Supabase's server. No password is in the code, and the app does not trust a value in the browser by itself.
- **The order is now fixed:** Sign in → Calibration → Calibration check → the app. A calibration that fails its check never opens eye control.
- **Ready for Netlify, but not deployed.** Deploying needs your own accounts. GAZE-NETLIFY-DEPLOYMENT.md gives the steps.
- **All automatic tests pass** (numbers below).
- **Not tested yet:**
  - a real Supabase project
  - a real webcam with real eyes
  - a real Netlify site

## What you must do (only you can)

1. Create a free **Supabase** project. Copy its Project URL and anon public key.
2. Put the code on **GitHub** and import it into **Netlify**.
3. In Netlify, add the two variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then deploy.
4. In Supabase, set Site URL and Redirect URLs to your Netlify address.
5. Test sign-in and calibration on the real site, with your webcam.

Every step is in **GAZE-NETLIFY-DEPLOYMENT.md**.

---

## Phase 1: what I found

- **What the project is:** React 19 with Vite 8, plain CSS and JavaScript. Before this work it had no accounts at all.
- **Calibration already existed and is real.** It uses 25 learning points and 8 check points at new places. It throws out blinks and glances away, fits a ridge-regression model, and measures it on the check points. The model is saved with version numbers.
- **What was missing in calibration:**
  - nothing decided whether the check had *passed*
  - "Start using eye control" was offered even after a bad check
- **The README was out of date in places:**
  - it said "I-Gaze 2", "Communicate" and "43 unit tests"
  - it did not mention Talk or the 7 Settings groups
  - it had no sign-in or deployment section
- **News** needs a small server (`server/news.js`). A plain static host has no server, so News would break on Netlify.

## What changed

### Sign-in (Phase 3)

The sign-in page has two parts: a dark brand panel on the left and a card on the right. On a phone they stack. The card has five views:

- sign in
- create account
- forgot password (sends an email)
- choose a new password (after opening the email link)
- "sign-in is not set up yet" (a website that has no sign-in settings)

Other features:

- **Fields:** a show/hide password button, field checks before anything is sent (email format, password of 8 or more characters for new accounts), clear error messages, and a "Signing in…" busy state.
- **Accessibility:** fields have labels, and errors are announced to screen readers. It works with keyboard, mouse and touch. Every button is at least 56 px.
- **Protected pages:** nothing of the app shows until the session has been checked *with the Supabase server*.
- **Ended sessions:** if a session has expired or was cancelled, the person goes back to sign-in. If this happens while the app is open, it says "Your session has ended. Please sign in again."
- **Sign out:** in Settings → Account, and on the calibration page.
- **On your own computer (localhost)** with no Supabase settings, the app opens without sign-in, as before. Settings → Account says so.
- **On any other address** with no Supabase settings, the app stays closed. It does not open for everyone.
- **Email links:** confirmation and reset links use Supabase's PKCE method (`?code=…`). This does not clash with the app's `#/` page addresses, and a link only works in the browser that asked for it.

### Calibration step (Phase 4)

- After sign-in, GAZE checks this device's calibration. This happens only when "How to select" is Eye gaze. The four results are:

  | Result | What it means |
  |---|---|
  | **Missing** | Not calibrated yet. |
  | **Failed** | The last check was under 70%. |
  | **Outdated** | The screen size changed by more than 20%. |
  | **OK** | Calibration is usable. |

- If it is not OK, a calibration page appears. It explains:
  - posture (50–70 cm from the screen)
  - the camera permission (allowed, blocked, or "will ask")
  - the 4 steps
- **Start calibration** opens the existing calibration screens. Their maths was **not changed**.
- **The results page now gives a verdict.** The check passes when at least 70% of the check-point frames land on the right tile of the large-tile keyboard. This is the same 70% the app already used to recommend large tiles.
  - Passed: "Start using eye control".
  - Not passed: only "Calibrate again".
- **"Use touch or click instead"** switches to touch and does **not** save anything as calibrated.
- Sign-in status and calibration status are kept separate. Calibration lives in the browser, and sign-in lives in Supabase.

### Netlify (Phase 7)

- **`netlify.toml`:**
  - build command `npm run build`, publish folder `dist`, Node 22
  - security headers: the camera is allowed only for this site, framing is blocked, and other sites cannot guess file types
- **`netlify/functions/news.mjs`:** the same news code, running as a Netlify function at `/api/news`.
- **No redirect rules are needed**, because the app uses `#/` addresses.
- **No secrets in the bundle.** The only values built in are the public Supabase URL and the anon key.

### Look (Phase 5)

- The indigo theme from the last pass is kept, with its light, dark and high-contrast modes.
- The new pages use the same tokens.
- **The browser tab icon and colour** were still teal, so they are now indigo, and the tab title is "GAZE".
- **The song list** in Music had 8 px between songs. It now has 12 px, like every other button.

## Files

**New:**

| File | What it is |
|---|---|
| `src/app/authConfig.js` | Picks the mode (Supabase, local or closed), checks the form, and turns errors into plain messages. |
| `src/app/AuthContext.jsx` | Sign-in state for the whole app: sign in, create account, reset password, new password, sign out. |
| `src/features/auth/LoginPage.jsx` | The sign-in page. |
| `src/features/calibration/CalibrationGate.jsx` | The page before calibration. |
| `src/gaze/calibrationStatus.js` | Decides missing, failed, outdated or OK. |
| `netlify.toml`, `netlify/functions/news.mjs` | Netlify setup. |
| `GAZE-NETLIFY-DEPLOYMENT.md`, this report | Documentation. |
| `docs/screenshots/login/` | Screenshots. |

**Changed:**

| File | What changed |
|---|---|
| `src/App.jsx` | The journey: sign-in check, then calibration check, then the app. |
| `src/screens/Results.jsx` | The pass or not-passed verdict. "Start using eye control" shows only after a pass. |
| `src/features/settings/SettingsScreen.jsx` | New **Account** group. |
| `src/components/Icon.jsx` | lock, logout, mail and globe icons. |
| `src/styles/app.css` | Styles for sign-in, the calibration page and loading, plus the song-list gap. |
| `server/news.js` | Small export changes so Netlify can reuse it. Its behaviour is the same. |
| `index.html`, `public/favicon.svg` | Indigo colour, and the title "GAZE". |
| `package.json`, `package-lock.json` | Added `@supabase/supabase-js`, the only new package. Lint now also checks `netlify/`. |
| `.env.example` | The two Supabase settings, with a warning about the secret key. |
| `tests/v2.test.js` | New tests for sign-in modes, form checks, error messages, calibration status and the Netlify news function. |
| `README.md` | Rewritten to match the code. |

**Not changed:**

- the gaze model, the calibration maths and the coordinate mapping
- the dwell timing
- Home
- the routes and the saved settings

## Test results (run on 18 October 2026, in this container)

| Check | Result |
|---|---|
| Unit tests (`npm test`) | **54 of 54 pass** |
| Lint (`npm run lint`) | OK, 0 problems |
| Build (`npm run build`) | OK |
| Browser test: part 1 | 26/26 |
| Browser test: part 2 | 43/43 |
| Browser test: part 3b (now including the calibration step) | 18/18 |
| Browser test: sweep (now including the calibration step) | 13/13 |
| Browser test: Symbols languages | 47/47 |
| Browser test: Talk | 51/51 |
| **Browser test: sign-in (new)** | **30/30** |
| Design check: 9 pages × 3 themes × 3 text sizes | 81 of 81 clean, after the song-list fix |
| Design check: 7 Settings groups × 3 themes × 3 text sizes | 63 of 63 clean |
| Design check: sign-in page and calibration page, 3 themes × 3 text sizes | 18 of 18 clean |
| Screen fit (laptop sizes) | No hidden buttons outside Settings |
| Netlify news function, bundled with esbuild 0.25 and called | Returned headlines (with a stand-in feed) |

**What the sign-in browser test checks.** It runs the real app in Chromium with the real Supabase library. Supabase's server is replaced by a stand-in that answers like Supabase. It checks:

- an empty form sends nothing
- a wrong password shows an error, and the right one opens the app
- `#/settings` cannot skip sign-in or calibration
- a reload keeps the person signed in and re-checks with the server
- a session cancelled on the server goes back to sign-in, even though the browser still had it
- "Use touch or click instead" opens the app in touch mode and saves no calibration
- sign out works
- create account asks for email confirmation
- forgot password, then the reset link, then choose a new password, then the app
- keyboard Tab order
- no console errors
- no sideways scrolling in dark, high contrast and phone width
- a deployed site without settings stays closed

**What was not tested (manual checks needed):**

- **A real Supabase project:** sign-up, confirmation emails, reset emails, and Supabase's own password rules and rate limits.
- **A real Netlify deploy:** the build on Netlify, the news function on Netlify, the headers and HTTPS.
- **A real webcam with real eyes:** calibration quality, how often the 70% check passes, and eye control in daily use. **Accuracy has not been measured with real users.**
- **Voices heard aloud**, and how the Inter font looks (it is not installed in the test browser).
- **Other browsers:** Safari and Firefox were not tested.

**Note on the logs.** The test browser here cannot reach Google's face-model hosting, so one browser test logs "ERR_TUNNEL_CONNECTION_FAILED". These tests use the built-in gaze simulator, so this does not affect their results.

## Known limits

- Calibration is saved per browser and device, not in the account. A new device asks again.
- The sign-in and calibration pages are in English only.
- **Supabase's free email sender** sends only a few emails per hour. For real use, add your own email server (SMTP) in Supabase.
- **Music is empty on Netlify**, because music files are not uploaded to GitHub.
- **Offline:** if the internet drops, a session that is still valid keeps working. A new sign-in needs internet.

## Next steps

1. Do the 5 steps under "What you must do".
2. On the real site, do the checks in GAZE-NETLIFY-DEPLOYMENT.md, Step 6.
3. Calibrate with real users, write down how often the check passes, and adjust the advice if needed.
4. Ask a native speaker to check the Tamil texts.
