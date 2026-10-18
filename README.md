# GAZE V2

GAZE is an eye-gaze communication app for people who find it hard to speak,
type or use a touch screen. The person looks at a button and keeps looking;
when the dwell time is reached, the button is selected. It needs only a normal
laptop webcam and a browser (Chrome or Edge). **Camera pictures never leave
the device.**

With GAZE a person can:

- type a message on a large keyboard with word suggestions, and have it spoken;
- say common needs and quick phrases with one look;
- build sentences from picture symbols, in English, தமிழ் (Tamil) or both;
- call or message family through the device's own phone app;
- play their own music;
- read English and Tamil news headlines, and have them read aloud.

Everything can be selected with the eyes. A mouse, touch screen, keyboard or
head pointer also works.

**Contents:** 1. Quick start · 2. Sign-in · 3. Calibration · 4. Pages ·
5. Eye control · 6. Speech and languages · 7. Themes · 8. Music · 9. News ·
10. Calls · 11. Commands and tests · 12. Settings you can change (environment
variables) · 13. Putting it on the internet (Netlify) · 14. How it is built ·
15. Troubleshooting · 16. Limitations

---

## 1. Quick start (on your own computer)

You need **Node.js 20 or newer** (from nodejs.org) and **Chrome or Edge**.

```bash
npm install        # first time only
npm run dev        # then open http://localhost:5173
```

On Windows you can double-click `run-project.bat` instead.

On your own computer (`localhost`) the app opens **without sign-in** unless
you add the sign-in settings (section 2). Everything else works the same.

The first time eye control starts, the browser downloads the face-tracking
model (a few MB) from Google's model hosting, so it needs internet once.

---

## 2. Sign-in

GAZE uses **Supabase Auth** (a hosted sign-in service, free plan available)
for accounts. The app itself never sees or stores passwords: Supabase keeps
them hashed on its server. The browser keeps only Supabase's session token,
which expires and is renewed automatically.

**The journey:** Sign in → Calibration → Calibration check → the app.

What the sign-in page does:

- **Sign in** with email and password, with a show/hide password button.
- **Create an account.** Passwords need at least 8 characters. If your
  Supabase project asks for email confirmation, the person gets an email and
  signs in after clicking the link.
- **Forgot password?** sends a reset email. Opening the link in the **same
  browser** shows "Choose a new password"; after saving it, the app opens.
- Clear messages for a wrong password, unconfirmed email, too many tries and
  no internet. The button shows "Signing in…" while it works.
- **Protected pages:** no page of the app (not even `#/settings`) is shown
  until the session has been checked **with the Supabase server**. A token
  copied or edited in the browser is not trusted on its own.
- **Session ended:** if the session expires or is cancelled on the server,
  the app returns to the sign-in page. When this happens while the app is
  open, it says "Your session has ended. Please sign in again."
- **Sign out:** Settings → Account → Sign out (or on the calibration page).

### Three modes

| Where the app runs | Sign-in settings filled in? | What happens |
|---|---|---|
| Anywhere | Yes | Sign-in is required. |
| `localhost` / `127.0.0.1` | No | The app opens without sign-in (for development and for use on one personal computer). Settings → Account says so. |
| Any other address (for example a Netlify site) | No | The app stays **closed** and shows "Sign-in is not set up yet" with instructions for the site owner. Nobody can use it. |

### Setting up Supabase (once)

1. Create a free project at <https://supabase.com>.
2. In the project: **Project Settings → API**. Copy the **Project URL** and
   the **anon public** key (also called "publishable" key).
   **Never copy the `service_role` / secret key into this app.**
3. Copy `.env.example` to `.env` and fill in:

   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

4. In Supabase: **Authentication → URL Configuration**. Set **Site URL** to
   where the app runs (for example `http://localhost:5173`, later your Netlify
   address) and add the same address to **Redirect URLs**. Without this,
   confirmation and reset emails link to the wrong place.
5. Restart `npm run dev`. The sign-in page now appears.

Both values are **public by design**: they are built into the website and
anyone can see them. Supabase protects accounts on its server. `.env` is
listed in `.gitignore`, so it is not uploaded to GitHub by accident.

---

## 3. Calibration

Every face, camera and screen is different, so GAZE must learn where **this**
person's eyes look on **this** screen.

**When it is asked for.** After sign-in, if "How to select" is **Eye gaze**
(the default), GAZE checks the saved calibration on this device. The
calibration page appears when:

- there is **no** calibration yet;
- the last calibration **did not pass** its check; or
- the **screen size changed** by more than 20% since calibrating.

The page explains posture (50–70 cm from the screen), checks whether the
camera is allowed, and lists the steps. You can:

- **Start calibration**, or
- **Use touch or click instead.** This switches GAZE to touch/click. It does
  **not** mark the device as calibrated; eye control stays off until you
  calibrate in Settings → Eye control.

**What calibration does (real measurements, nothing invented):**

1. **Screen check:** confirms the window size and face position.
2. **25 learning points** in a 5 × 5 grid. For each dot, GAZE waits 0.7 s for
   the eyes to settle, then collects at least 15 good camera frames.
   Blinks (eyes less than 70% open) and glances away (statistical outliers)
   are thrown out.
3. GAZE fits a **ridge-regression model** from eye features to screen
   positions.
4. **8 check points** at new places that were not used for learning. GAZE
   measures how far its guesses land from the dots.
5. **Results page.** The check **passes** when at least **70%** of the
   check-point frames land on the right tile of the large-tile keyboard.
   - Passed: "Start using eye control" opens the app.
   - Not passed: only "Calibrate again" is offered. A failed calibration is
     never treated as ready.

The model is saved in this browser with its format version, feature version,
screen size and check results (`igaze.model.active`; the one before it is
kept as `igaze.model.previous`). Settings → Gaze model can download, import
or restore it. Calibration is stored **per browser and device**, not per
account, and is checked again after each sign-in.

How accurate it is depends on the camera, light and the person. This has not
been measured with real users yet (see section 16).

---

## 4. Pages

The side menu has six items: **Home, Talk, Calls, Music, News, Settings**.

| Page | What it does |
|---|---|
| **Home** | Big buttons for each feature, eye-tracking status, the current message and **Call for help** (a loud alarm in the room). |
| **Talk** | One message bar (Speak, Save phrase, Undo, Clear) and four ways to build the message: **Type message** (opens first), **Quick phrases**, **Needs** and **Symbols**. Switching between them never loses the message. Language: English, தமிழ் or Both. |
| **Calls** | Contact cards. Choosing one offers **Call**, **Send my message by SMS** and **Send my message on WhatsApp**. |
| **Music** | Your own songs: search, play/pause, previous/next, ±15 s, repeat, shuffle, volume. Keeps playing on other pages. |
| **News** | English and Tamil headlines with source, date and picture; open one to hear it or open the original article. |
| **Settings** | Seven groups: Eye control, Display, Speech, Keyboard, Phrases & symbols, Gaze model, **Account**. Saved in this browser. |

The old addresses `#/keyboard`, `#/phrases`, `#/needs` and `#/symbols` open
the matching part of Talk. Lists never scroll with the eyes; they have
**Previous page / Next page** buttons instead.

---

## 5. Eye control

- **Dwell time:** 0.5 to 3.0 s (Settings → Eye control). Risky buttons
  (Clear, Call for help) need 1.6× longer; navigation buttons 1.2×.
- **Progress:** the button under your gaze gets an outline and fills, with a
  bar along the bottom.
- **No repeats:** after a selection the button will not fire again until the
  eyes leave it.
- **Pause eyes** (top right) stops all selection except **Resume**.
- **Tracking problems are always shown** ("Face not found", "Eyes not
  visible", "Camera problem") with a Retry button. Selection stops while
  tracking is lost.
- **Recenter** (Settings → Eye control): look at a dot for 2 seconds to fix a
  small shift.
- **Other ways to select** (Settings → Eye control → How to select):
  *Pointer dwell* (mouse or head pointer) or *Touch or click*.

**Webcam permission.** The browser asks once. If you clicked "Block": click
the camera or lock icon in the address bar, allow the camera, reload. The
camera works only on `http://localhost` or an `https://` address.

**No camera for development:** open `http://localhost:5173/?simulate`. The
simulated eyes follow the mouse (F = face lost, B = blink).

---

## 6. Speech and languages

Speech uses the browser's built-in voices (Web Speech API). English voices
exist on almost every device. **Tamil needs a Tamil voice on the device**:

- Android: Google Text-to-speech with Tamil installed.
- Windows: Settings → Time & language → Language → add Tamil with speech.

Talk, phrases and symbols can be shown in English, தமிழ் or both. Mixed text
is spoken with each language's own voice. If no Tamil voice exists, the app
says so. The Tamil texts (in `src/content/`) **should be checked by a native
speaker**. The keyboard and word suggestions are English only. The sign-in
and calibration pages are in English.

---

## 7. Themes

Settings → Display: **Light**, **Dark** and **High contrast** (black and
yellow), and three text sizes (Normal, Large, Extra large). The look uses an
indigo accent, a dark side menu and a pink focus outline. All colours are
"tokens" in `src/styles/tokens.css`. Buttons are at least 56 px and 12 px
apart, for eye control.

---

## 8. Music

1. Copy MP3 files into `public/music/` (sub-folders are fine).
2. Run `npm run music:index`. It writes `public/music/library.json`.
3. Open **Music** and press **Check again**, or reload.

Music files are in `.gitignore`, so they are not uploaded to GitHub. **On a
Netlify site the music library is therefore empty** unless you deliberately
add the files to the repository (only do that with music you are allowed to
publish).

---

## 9. News

- **Source:** BBC News public RSS feeds (English: Top stories, India, World,
  Health, Technology; Tamil: BBC News தமிழ்). **No API key is needed.**
- Browsers cannot read these feeds directly, so a small server part fetches
  them: `server/news.js`. It runs inside `npm run dev` and `npm start`, and on
  Netlify as the function `netlify/functions/news.mjs` (address `/api/news`).
- It fetches only the feeds in `server/news-feeds.json`, caches each for 10
  minutes and allows a manual refresh at most every 2 minutes.
- Only the headline, short description, picture and link are shown; the full
  article opens on the publisher's site.

---

## 10. Calls

A web page cannot place phone calls by itself. GAZE uses the device: **Call**
opens a `tel:` link (the phone's dialer, or Phone Link / FaceTime on a
computer), **SMS** opens the messaging app, **WhatsApp** opens WhatsApp with
the message filled in. Someone presses Send there. Contacts are stored only in
this browser.

---

## 11. Commands and tests

```bash
npm run dev        # development server, http://localhost:5173
npm test           # 54 unit tests (node --test)
npm run lint       # oxlint
npm run build      # production files into dist/
npm start          # production server (app + news), http://localhost:4173
npm run music:index
```

The unit tests cover the gaze maths, calibration data, model files, settings,
the message and language logic, news parsing, the sign-in mode and form
checks, the calibration status and the Netlify news function.

---

## 12. Settings you can change (environment variables)

All are optional. See `.env.example`.

| Name | Used by | What it does |
|---|---|---|
| `VITE_SUPABASE_URL` | the website (build time) | Supabase Project URL. Must start with `https://`. |
| `VITE_SUPABASE_ANON_KEY` | the website (build time) | Supabase anon/public key. |
| `PORT`, `HOST` | `npm start` | Address of the production server (default `127.0.0.1:4173`). |
| `NEWS_FEEDS_FILE` | news server | Your own feed list instead of `server/news-feeds.json`. |

`VITE_` values are copied **into the website when it is built**. After
changing them, run `npm run build` again (or redeploy on Netlify). Never put a
secret in a `VITE_` variable.

---

## 13. Putting it on the internet (Netlify)

Short version: `netlify.toml` is ready. Build command `npm run build`,
publish directory `dist`, news function included. You must add the two
`VITE_SUPABASE_*` variables in Netlify and set the Netlify address in
Supabase. **Step-by-step guide: [GAZE-NETLIFY-DEPLOYMENT.md](GAZE-NETLIFY-DEPLOYMENT.md).**

Netlify gives every site HTTPS, which the camera needs. `server/index.js` is
not used on Netlify; Netlify serves `dist/` and runs the news function.

---

## 14. How it is built

React 19 + Vite, plain JavaScript and CSS. No database of our own; accounts
are in Supabase, everything else stays in the browser.

```
camera → tracker.js (FaceMesh) → featureExtractor.js (eye features)
       → ridgeModel.js (screen x,y) → recenter offset → One Euro filter
       → targets.js: hit test against every visible [data-gaze] button
       → filters.js: dwell selector → button.click()
```

| Folder / file | What is in it |
|---|---|
| `src/App.jsx` | The journey: sign-in gate → calibration gate → app. |
| `src/app/AuthContext.jsx`, `authConfig.js` | Sign-in with Supabase; mode choice, form checks, error messages. |
| `src/features/auth/LoginPage.jsx` | The sign-in, create-account, reset and new-password page. |
| `src/features/calibration/CalibrationGate.jsx` | The page before calibration. |
| `src/gaze/calibrationStatus.js` | Decides if calibration is missing, failed, outdated or OK. |
| `src/gaze/` | Gaze engine, calibration data, model storage. |
| `src/screens/` | Screen check, calibration, results, classic keyboard. |
| `src/features/` | One folder per page. |
| `src/content/` | Phrases and symbols in English and Tamil. |
| `src/styles/` | `tokens.css` (colours, sizes, themes) and `app.css`. |
| `server/` | News service and the production server for `npm start`. |
| `netlify/functions/news.mjs` | The news service on Netlify. |
| `netlify.toml` | Netlify build settings and security headers. |
| `tests/` | Unit tests. |
| `legacy/` | The older version, not built. |

---

## 15. Troubleshooting

| Problem | What to do |
|---|---|
| "Sign-in is not set up yet" on the website | Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify, then **redeploy**. |
| "Cannot reach the sign-in service" | Check the internet. Check the Supabase URL is right and the project is not paused. |
| "Please confirm your email first" | Open the confirmation email. Or turn off "Confirm email" in Supabase → Authentication → Sign In / Providers → Email. |
| Confirmation or reset link opens the wrong site | Set Site URL and Redirect URLs in Supabase (section 2, step 4). |
| Reset link shows the sign-in page instead of "Choose a new password" | Open the link in the **same browser** where you asked for it. |
| Camera blocked | Address bar → camera/lock icon → allow → reload. Must be `https://` or `localhost`. |
| Calibration check keeps failing | Light in front of you, face in the middle, sit still, look at the centre of each dot. Try a bigger window. |
| Calibration asked again | The screen size changed by more than 20%, or the last check failed. |
| News says the service is not running | On Netlify, check the function in **Logs → Functions**. Locally, use `npm run dev` or `npm start`. |
| Music is empty on Netlify | Expected: music files are not uploaded (section 8). |

---

## 16. Limitations

- Webcam gaze tracking is far less precise than infrared eye trackers.
  Accuracy with real users and real webcams has **not** been measured yet.
- Calibration is saved per browser and device, not in the account.
- Settings, contacts, phrases and music live in one browser; there is no sync.
- Browsers need one click or tap before camera, speech and music can start.
- Tamil speech needs a Tamil voice; Tamil typing is not supported.
- The sign-in and calibration pages are English only.
- News depends on BBC's public feeds being reachable.
