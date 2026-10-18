import { useEffect, useRef, useState } from "react";

import Icon from "../../components/Icon.jsx";
import { validateCredentials } from "../../app/authConfig.js";
import { useAuth } from "../../app/AuthContext.jsx";

const COPY = {
  signIn: { title: "Welcome back", lead: "Sign in to continue to GAZE.", submit: "Sign in", busy: "Signing in…" },
  signUp: { title: "Create your account", lead: "One account for the person using GAZE, or for their helper.", submit: "Create account", busy: "Creating account…" },
  reset: { title: "Reset your password", lead: "We will email you a link to choose a new password.", submit: "Send reset link", busy: "Sending…" },
  newPassword: { title: "Choose a new password", lead: "Your reset link worked. Type a new password to finish.", submit: "Save new password", busy: "Saving…" },
};

/**
 * The sign-in page. Mouse, touch and keyboard friendly; eye control starts
 * only after sign-in and calibration, so this page uses normal form controls.
 */
export default function LoginPage() {
  const auth = useAuth();
  // A password-reset link signs the person in just far enough to set a new password.
  const recovering = auth.status === "recovery";
  const [chosenView, setView] = useState("signIn");
  const view = recovering ? "newPassword" : chosenView;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(auth.notice ? { tone: "info", text: auth.notice } : null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  useEffect(() => {
    (view === "newPassword" ? passwordRef : emailRef).current?.focus();
  }, [view]);

  const copy = COPY[view];
  const switchTo = (next) => {
    setView(next);
    setErrors({});
    setMessage(null);
    setPassword("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    // A reset needs only the email, so the password check is given a stand-in.
    const found = validateCredentials({ email, password: view === "reset" ? "-" : password }, { signUp: view === "signUp" || view === "newPassword" });
    if (view === "newPassword") delete found.email; // the reset link already says whose account it is
    setErrors(found);
    setMessage(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      if (view === "signIn") {
        await auth.signIn(email, password);
        return; // the app moves on by itself once the session exists
      }
      if (view === "signUp") {
        const needsConfirm = await auth.signUp(email, password);
        if (needsConfirm) {
          setView("signIn");
          setPassword("");
          setMessage({ tone: "success", text: `Account created. We sent a confirmation link to ${email.trim()}. Open it, then sign in here.` });
        }
        return;
      }
      if (view === "newPassword") {
        await auth.updatePassword(password);
        return; // the app opens by itself once the password is saved
      }
      await auth.resetPassword(email);
      setMessage({ tone: "success", text: `If an account exists for ${email.trim()}, a reset link is on its way. Check your inbox.` });
    } catch (error) {
      setMessage({ tone: "danger", text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const fieldProps = (name) => ({
    "aria-invalid": errors[name] ? "true" : undefined,
    "aria-describedby": errors[name] ? `login-${name}-error` : undefined,
  });

  return (
    <div className="login">
      <aside className="login__brand" aria-label="About GAZE">
        <div className="login__logo">
          <Icon name="eye" size={30} />
          <span>GAZE</span>
        </div>
        <div className="login__pitch">
          <h1 className="login__headline">Your voice, at a glance.</h1>
          <p className="login__sub">
            GAZE lets people who cannot easily speak or type say what they need, using only their eyes and a webcam.
          </p>
          <ul className="login__points">
            <li><Icon name="target" size={20} /><span>Calibrated to your own eyes, then checked on new points</span></li>
            <li><Icon name="globe" size={20} /><span>Talk in English, தமிழ் or both</span></li>
            <li><Icon name="camera" size={20} /><span>Camera pictures stay on this device</span></li>
          </ul>
        </div>
        <p className="login__foot">Independence, dignity and communication, for everyone.</p>
      </aside>

      <main className="login__main">
        <div className="login__card">
          {auth.status === "unconfigured" ? (
            <UnconfiguredNotice />
          ) : (
            <>
              <header className="login__head">
                <span className="login__badge"><Icon name="lock" size={18} /></span>
                <h2 className="login__title">{copy.title}</h2>
                <p className="login__lead">{copy.lead}</p>
              </header>

              {message && (
                <p className={`login__message login__message--${message.tone}`} role={message.tone === "danger" ? "alert" : "status"}>
                  <Icon name={message.tone === "danger" ? "alert" : message.tone === "success" ? "check" : "info"} size={20} />
                  <span>{message.text}</span>
                </p>
              )}

              <form className="login__form" onSubmit={submit} noValidate>
                {view === "newPassword" ? (
                  <p className="login__lead">Account: <strong>{auth.user?.email}</strong></p>
                ) : (
                <div className="login__field">
                  <label htmlFor="login-email">Email</label>
                  <div className="login__input">
                    <Icon name="mail" size={20} />
                    <input
                      ref={emailRef}
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      disabled={busy}
                      {...fieldProps("email")}
                    />
                  </div>
                  {errors.email && <p className="login__error" id="login-email-error">{errors.email}</p>}
                </div>
                )}

                {view !== "reset" && (
                  <div className="login__field">
                    <div className="login__label-row">
                      <label htmlFor="login-password">{view === "newPassword" ? "New password" : "Password"}</label>
                      {view === "signIn" && <button type="button" className="login__link" onClick={() => switchTo("reset")}>Forgot password?</button>}
                    </div>
                    <div className="login__input">
                      <Icon name="lock" size={20} />
                      <input
                        ref={passwordRef}
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={view === "signIn" ? "current-password" : "new-password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={busy}
                        {...fieldProps("password")}
                      />
                      <button
                        type="button"
                        className="login__reveal"
                        aria-pressed={showPassword}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword((value) => !value)}
                      >
                        <Icon name={showPassword ? "eyeOff" : "eye"} size={22} />
                      </button>
                    </div>
                    {errors.password && <p className="login__error" id="login-password-error">{errors.password}</p>}
                    {(view === "signUp" || view === "newPassword") && !errors.password && <p className="login__hint">At least 8 characters.</p>}
                  </div>
                )}

                <button type="submit" className="login__submit" disabled={busy} aria-busy={busy}>
                  {busy && <span className="spinner spinner--inline" aria-hidden="true" />}
                  {busy ? copy.busy : copy.submit}
                </button>
              </form>

              <p className="login__switch">
                {view === "signIn" && <>New to GAZE? <button type="button" className="login__link" onClick={() => switchTo("signUp")}>Create an account</button></>}
                {view === "newPassword" && <button type="button" className="login__link" onClick={auth.signOut}>Cancel and sign out</button>}
                {view !== "signIn" && view !== "newPassword" && <button type="button" className="login__link" onClick={() => switchTo("signIn")}>Back to sign in</button>}
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function UnconfiguredNotice() {
  return (
    <div className="login__setup" role="alert">
      <span className="login__badge login__badge--warn"><Icon name="alert" size={18} /></span>
      <h2 className="login__title">Sign-in is not set up yet</h2>
      <p className="login__lead">
        This website has no account service connected, so it stays closed. Nobody can use it without signing in.
      </p>
      <p className="login__lead">
        <strong>For the site owner:</strong> add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in
        Netlify (Site configuration → Environment variables), then deploy again. GAZE-NETLIFY-DEPLOYMENT.md explains each step.
      </p>
    </div>
  );
}
