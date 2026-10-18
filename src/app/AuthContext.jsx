// Sign-in state for the whole app, backed by Supabase Auth.
//
// Supabase stores passwords hashed on its server; this app never sees or
// saves a password. Its browser library keeps the session (a signed token
// that expires) and refreshes it. On start the token is checked with the
// server (getUser), so a copied or edited local value is not trusted alone.
// Only the public "anon" key is used here; it is safe in the browser.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { authMode, friendlyAuthError } from "./authConfig.js";

const AuthContext = createContext(null);

const URL_ENV = import.meta.env.VITE_SUPABASE_URL;
const KEY_ENV = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const AUTH_MODE = authMode({ url: URL_ENV, anonKey: KEY_ENV, hostname: window.location.hostname });

let clientPromise = null;
function getClient() {
  // Loaded only when sign-in is configured, so local use downloads nothing extra.
  clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) => createClient(URL_ENV, KEY_ENV, {
    // PKCE: email links come back as ?code=…, which does not clash with the
    // app's #/ page addresses, and only work in the browser that asked.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  }));
  return clientPromise;
}

export function AuthProvider({ children }) {
  // status: loading | signedOut | signedIn | recovery | local | unconfigured
  // ("recovery": opened a password-reset link and must choose a new password)
  const [state, setState] = useState(() => ({
    status: AUTH_MODE === "supabase" ? "loading" : AUTH_MODE,
    user: null,
    notice: "",
  }));

  useEffect(() => {
    if (AUTH_MODE !== "supabase") return undefined;
    let cancelled = false;
    let subscription = null;
    (async () => {
      const client = await getClient();
      // Listen first, so the "password reset link opened" event is not missed.
      subscription = client.auth.onAuthStateChange((event, session) => {
        if (event === "INITIAL_SESSION") return; // checked with the server below
        setState((previous) => {
          if (event === "PASSWORD_RECOVERY" && session?.user) return { status: "recovery", user: session.user, notice: "" };
          if (previous.status === "loading") return previous;
          if (session?.user) {
            // While choosing a new password, stay on that form until it is saved.
            return previous.status === "recovery" ? { ...previous, user: session.user } : { status: "signedIn", user: session.user, notice: "" };
          }
          // Signed out by the person, or the session ended (expired or revoked).
          const ended = previous.status === "signedIn" && !previous.leaving && event === "SIGNED_OUT";
          return { status: "signedOut", user: null, notice: ended ? "Your session has ended. Please sign in again." : previous.notice };
        });
      }).data.subscription;
      const { data } = await client.auth.getSession();
      let user = null;
      if (data.session) {
        // Check the stored session with the server. If the server says it is
        // no longer valid, sign out. If the server cannot be reached, keep the
        // signed, unexpired token so the person is not locked out offline.
        const check = await client.auth.getUser();
        if (check.data?.user) user = check.data.user;
        else if (check.error && check.error.status && check.error.status !== 0) await client.auth.signOut({ scope: "local" });
        else user = data.session.user;
      }
      if (cancelled) return;
      setState((previous) => (previous.status === "recovery" ? previous : { status: user ? "signedIn" : "signedOut", user, notice: "" }));
    })().catch((error) => {
      if (!cancelled) setState({ status: "signedOut", user: null, notice: friendlyAuthError(error) });
    });
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const client = await getClient();
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(friendlyAuthError(error));
  }, []);

  /** Returns true when the account still needs its email confirmed. */
  const signUp = useCallback(async (email, password) => {
    const client = await getClient();
    const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } });
    if (error) throw new Error(friendlyAuthError(error));
    return !data.session;
  }, []);

  const resetPassword = useCallback(async (email) => {
    const client = await getClient();
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (error) throw new Error(friendlyAuthError(error));
  }, []);

  /** Saves a new password after a reset link was opened, then opens the app. */
  const updatePassword = useCallback(async (password) => {
    const client = await getClient();
    const { data, error } = await client.auth.updateUser({ password });
    if (error) throw new Error(friendlyAuthError(error));
    setState({ status: "signedIn", user: data.user, notice: "" });
  }, []);

  const signOut = useCallback(async () => {
    if (AUTH_MODE !== "supabase") return;
    setState((previous) => ({ ...previous, leaving: true }));
    const client = await getClient();
    await client.auth.signOut();
    setState({ status: "signedOut", user: null, notice: "You have signed out." });
  }, []);

  const value = useMemo(() => ({ ...state, mode: AUTH_MODE, signIn, signUp, resetPassword, updatePassword, signOut }), [state, signIn, signUp, resetPassword, updatePassword, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
