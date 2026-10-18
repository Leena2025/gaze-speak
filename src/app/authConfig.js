// Which sign-in mode the app runs in. Pure, unit-tested.
//
//   "supabase"     – VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set:
//                    everyone must sign in with a real account.
//   "local"        – not set, and the app is opened on this computer
//                    (localhost): no sign-in, exactly like before. A web
//                    address on the internet can never use this mode.
//   "unconfigured" – not set on a real web address: the app is blocked with
//                    setup instructions, so a deployed site is never open.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function authMode({ url, anonKey, hostname }) {
  const configured = /^https:\/\/\S+$/.test(String(url || "")) && String(anonKey || "").length > 20;
  if (configured) return "supabase";
  return LOCAL_HOSTS.has(String(hostname || "")) ? "local" : "unconfigured";
}

/** Simple checks before anything is sent, so the person gets a clear message. */
export function validateCredentials({ email, password }, { signUp = false } = {}) {
  const errors = {};
  const trimmed = String(email || "").trim();
  if (!trimmed) errors.email = "Enter your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) errors.email = "This does not look like an email address.";
  if (!password) errors.password = "Enter your password.";
  else if (signUp && password.length < 8) errors.password = "Use at least 8 characters.";
  return errors;
}

/** Turns a sign-in service error into a sentence a person can act on. */
export function friendlyAuthError(error) {
  const text = String(error?.message || error || "");
  if (/invalid login credentials/i.test(text)) return "The email or password is not right. Check them and try again.";
  if (/email not confirmed/i.test(text)) return "Please confirm your email first. Open the link we sent you, then sign in.";
  if (/user already registered/i.test(text)) return "An account with this email already exists. Sign in instead.";
  if (/rate limit|too many/i.test(text)) return "Too many tries. Wait a minute, then try again.";
  if (/failed to fetch|network|load failed/i.test(text)) return "Cannot reach the sign-in service. Check the internet connection and try again.";
  if (/different from the old password/i.test(text)) return "Choose a password that is different from your old one.";
  if (/password/i.test(text) && /least|short|weak/i.test(text)) return "That password is too short or too simple. Use at least 8 characters.";
  return text ? `Sign-in failed: ${text}` : "Sign-in failed. Please try again.";
}
