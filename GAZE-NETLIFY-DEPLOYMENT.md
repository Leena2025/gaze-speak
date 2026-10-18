# Putting GAZE V2 on the internet with Netlify

This guide is for a beginner. Follow the steps in order. It takes about 20–30
minutes the first time.

**Status today:** the project is **ready** for Netlify, but it has **not been
deployed**. Deploying needs your own GitHub, Netlify and Supabase accounts,
and only you can create and approve those. No website address exists yet.

## What you need

- A **GitHub** account (free), to hold the code.
- A **Netlify** account (free), to host the website. Sign in with GitHub.
- A **Supabase** account (free), for sign-in.

## What is already prepared in the project

| File | What it does |
|---|---|
| `netlify.toml` | Tells Netlify: build command `npm run build`, publish folder `dist`, Node 22, and adds security headers (camera allowed for this site only). |
| `netlify/functions/news.mjs` | The news service, running on Netlify at `/api/news`. |
| `.env.example` | Lists the two sign-in settings you must add. |

The app uses `#/` addresses (for example `/#/settings`), so Netlify needs no
extra redirect rules.

---

## Step 1. Create the Supabase project (sign-in)

1. Go to <https://supabase.com>, sign in, press **New project**. Choose a
   name (for example `gaze`), a strong database password (keep it private),
   and the region closest to you. Wait until it is ready.
2. Open **Project Settings → API** (in newer dashboards: **Project Settings →
   API Keys** and **Data API**). Copy two values into a note:
   - **Project URL**, looks like `https://abcd1234.supabase.co`
   - **anon public** key (may be called **publishable** key), a long text
3. **Do not copy the `service_role` or secret key.** It must never go into
   this app or into Netlify for this app.
4. Decide about email confirmation: **Authentication → Sign In / Providers →
   Email → Confirm email**.
   - On (safer): new users must click a link in an email before signing in.
   - Off (simpler for a family device): accounts work at once.

You will finish the Supabase settings in Step 5, after you know the Netlify
address.

## Step 2. Put the code on GitHub

1. On GitHub, press **New repository**, name it (for example `gaze-v2`),
   choose **Private**, and create it.
2. In a terminal inside `D:\gaze project\gaze-v2\gaze-v2`:

   ```bash
   git init
   git add .
   git commit -m "GAZE V2"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/gaze-v2.git
   git push -u origin main
   ```

   `.gitignore` already keeps out `node_modules`, `dist`, `.env` and your
   music files. Check that `.env` is **not** in the list of files GitHub
   shows.

## Step 3. Create the Netlify site

1. Go to <https://app.netlify.com>, press **Add new site → Import an existing
   project → GitHub**, and pick your repository.
2. Netlify reads `netlify.toml` and fills in:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Functions directory:** `netlify/functions` (found automatically)
   If the boxes are empty, type these values.
3. **Before pressing Deploy**, open **Add environment variables** (or after
   creating the site: **Site configuration → Environment variables → Add a
   variable**). Add:

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Project URL from Step 1 |
   | `VITE_SUPABASE_ANON_KEY` | your anon public key from Step 1 |

4. Press **Deploy**. Wait for "Published".

Important: these values are put into the website **when it is built**. If you
add or change them later, go to **Deploys → Trigger deploy → Deploy site** so
the site is built again.

## Step 4. Note your website address

Netlify gives an address like `https://gentle-otter-1234.netlify.app`. You can
rename it in **Site configuration → Change site name**. It always uses
**HTTPS**, which the camera needs.

## Step 5. Tell Supabase your website address

In Supabase: **Authentication → URL Configuration**:

- **Site URL:** `https://your-site.netlify.app`
- **Redirect URLs:** add `https://your-site.netlify.app` and, for local
  testing, `http://localhost:5173`

Without this, confirmation and password-reset emails send people to the wrong
address.

## Step 6. Test the website

Open your Netlify address in Chrome or Edge and check:

1. **Sign-in page appears.** If you see "Sign-in is not set up yet", the two
   variables are missing or the site was not rebuilt (Step 3, note).
2. **Create an account**, confirm the email if asked, then **sign in**.
3. **Wrong password** shows "The email or password is not right".
4. **Calibration page** appears (on a new device). Press **Start
   calibration**, allow the camera, follow the dots. The results page says
   whether the check passed.
5. **News** loads headlines (this tests the news function).
6. **Settings → Account → Sign out** returns to the sign-in page.
7. **Forgot password?** sends an email; open the link in the same browser,
   choose a new password.

These checks need a real Supabase project, a real webcam and real eyes, so
they have not been done yet (see GAZE-IMPLEMENTATION-REPORT.md).

## If something goes wrong

| Problem | Where to look / what to do |
|---|---|
| Deploy failed | Netlify → **Deploys** → the failed deploy → **Deploy log**. Look for the first red error. |
| "Sign-in is not set up yet" | Variables missing or misspelt (must start with `VITE_`). Add them, then **Trigger deploy**. |
| "Cannot reach the sign-in service" | Supabase URL wrong, or the free project was paused (Supabase pauses unused free projects; press Restore). |
| Emails link to `localhost` | Step 5: Site URL and Redirect URLs. |
| No confirmation email | Check spam. Supabase's built-in email sender sends only a few emails per hour; for real use add your own SMTP in Supabase → Authentication → Emails. |
| News is empty or errors | Netlify → **Logs → Functions → news**. The BBC feeds must be reachable. |
| Camera does not start | The address must be `https://`. Allow the camera in the address bar. |
| Music is empty | Expected: music files are not uploaded to GitHub. |

## Safety notes

- The two `VITE_` values are public by design; it is fine that they are
  visible in the website. Supabase protects the accounts.
- Never put the Supabase `service_role` key, a database password or any other
  secret into Netlify variables for this site or into the code.
- Without the two variables a deployed site stays **closed** (it does not
  open without sign-in).
