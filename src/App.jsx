import { useCallback, useEffect, useState } from "react";

import ScreenCheck from "./screens/ScreenCheck.jsx";
import Calibration from "./screens/Calibration.jsx";
import Results from "./screens/Results.jsx";
import Demo from "./screens/Demo.jsx";
import AppShell from "./components/AppShell.jsx";
import { installModel, loadActiveModel } from "./gaze/modelStore.js";
import { GazeProvider, useGaze } from "./gaze/GazeProvider.jsx";
import { SettingsProvider } from "./app/SettingsContext.jsx";
import { NoticeProvider } from "./app/NoticeContext.jsx";
import { MessageProvider } from "./app/MessageContext.jsx";
import { UserContentProvider } from "./app/UserContentContext.jsx";
import { AlertProvider } from "./app/AlertContext.jsx";
import { AuthProvider, useAuth } from "./app/AuthContext.jsx";
import { useSettings } from "./app/SettingsContext.jsx";
import { INPUT_MODES } from "./app/settingsModel.js";
import { calibrationPassed, calibrationStatus } from "./gaze/calibrationStatus.js";
import { readViewport } from "./gaze/layout.js";
import LoginPage from "./features/auth/LoginPage.jsx";
import CalibrationGate from "./features/calibration/CalibrationGate.jsx";
import { railSection, useHashRoute } from "./app/router.js";
import { MusicProvider } from "./features/music/MusicProvider.jsx";
import HomeScreen from "./features/home/HomeScreen.jsx";
import TalkPage from "./features/communicate/CommunicateHub.jsx";
import Calls from "./features/calls/Calls.jsx";
import Music from "./features/music/Music.jsx";
import News from "./features/news/News.jsx";
import SettingsScreen from "./features/settings/SettingsScreen.jsx";

export default function App() {
  return (
    <SettingsProvider>
      <NoticeProvider>
        <MessageProvider>
          <UserContentProvider>
            <AuthProvider>
              <AuthGate />
            </AuthProvider>
          </UserContentProvider>
        </MessageProvider>
      </NoticeProvider>
    </SettingsProvider>
  );
}

/**
 * Step 1 of the journey: sign in. Nothing of the app is rendered (and no
 * route can be opened) until the session is checked. On this computer
 * (localhost) without a sign-in service, the app opens directly.
 */
function AuthGate() {
  const auth = useAuth();
  if (auth.status === "loading") {
    return (
      <main className="boot" role="status">
        <span className="spinner" aria-hidden="true" />
        <p>Checking your sign-in…</p>
      </main>
    );
  }
  if (auth.status === "signedIn" || auth.status === "local") return <Root key={auth.user?.id || "local"} />;
  return <LoginPage />;
}

function Root() {
  const [model, setModel] = useState({ loading: true, doc: null, source: null, message: "" });
  // Full-screen flows kept from V1, shown instead of the app shell:
  // check -> calibration -> results, and check -> classic (accuracy test).
  const [flow, setFlow] = useState(null);
  // Step 2 of the journey: a usable calibration, checked once per sign-in.
  // Being signed in never counts as being calibrated.
  const { settings, update } = useSettings();
  const auth = useAuth();
  const [gatePassed, setGatePassed] = useState(false);
  const status = model.loading ? null : calibrationStatus(model.doc, readViewport());
  const needsGate = !gatePassed && !flow && status && status.state !== "ok" && settings.inputMode === INPUT_MODES.gaze;

  const applyResult = useCallback((result) => {
    setModel({ loading: false, doc: result.doc, source: result.source ?? null, message: result.message ?? "" });
    return result.doc;
  }, []);
  const refreshModel = useCallback(async () => applyResult(await loadActiveModel()), [applyResult]);

  useEffect(() => {
    let cancelled = false;
    loadActiveModel().then((result) => {
      if (!cancelled) applyResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyResult]);

  return (
    <GazeProvider modelDoc={model.doc} enabled={!flow}>
      <AlertProvider>
        <MusicProvider>
          {model.loading && !flow ? (
            <main className="boot" role="status"><span className="spinner" aria-hidden="true" /><p>Loading your calibration…</p></main>
          ) : needsGate ? (
            <CalibrationGate
              status={status}
              onStart={() => setFlow({ name: "check", next: "calibration" })}
              onSkip={() => {
                update({ inputMode: INPUT_MODES.touch });
                setGatePassed(true);
              }}
              onSignOut={auth.mode === "supabase" ? auth.signOut : null}
            />
          ) : flow ? (
            <Flow flow={flow} setFlow={setFlow} model={model} refreshModel={refreshModel} onVerified={() => setGatePassed(true)} />
          ) : (
            <Main model={model} refreshModel={refreshModel} setFlow={setFlow} />
          )}
        </MusicProvider>
      </AlertProvider>
    </GazeProvider>
  );
}

function Flow({ flow, setFlow, model, refreshModel, onVerified }) {
  const gaze = useGaze();
  const leave = () => setFlow(null);
  const handleInstall = async (doc) => {
    installModel(doc);
    await refreshModel();
  };

  switch (flow.name) {
    case "check":
      return <ScreenCheck purpose={flow.next === "classic" ? "demo" : "calibration"} modelDoc={model.doc} onContinue={() => setFlow({ name: flow.next })} onBack={leave} />;
    case "calibration":
      return <Calibration onCancel={leave} onComplete={(result) => setFlow({ name: "results", result })} />;
    case "results":
      return (
        <Results
          result={flow.result}
          hasActiveModel={Boolean(model.doc)}
          onInstall={handleInstall}
          onStartDemo={() => {
            // Step 3: only a calibration that passed its check opens the app with eye control.
            if (!calibrationPassed(flow.result.metrics.validation)) return;
            onVerified();
            gaze.start();
            setFlow(null);
          }}
          onRecalibrate={() => setFlow({ name: "check", next: "calibration" })}
          onHome={leave}
        />
      );
    case "classic":
      return model.doc
        ? <Demo modelDoc={model.doc} onExit={leave} onRecalibrate={() => setFlow({ name: "check", next: "calibration" })} />
        : null;
    default:
      return null;
  }
}

function Main({ model, refreshModel, setFlow }) {
  const [route, navigate] = useHashRoute();
  const calibrate = () => setFlow({ name: "check", next: "calibration" });

  let page;
  switch (route) {
    // Quick phrases, needs, symbols and typing are all on the Talk page.
    case "communicate":
    case "keyboard":
    case "phrases":
    case "needs":
    case "symbols":
      page = <TalkPage route={route} navigate={navigate} modelDoc={model.doc} />;
      break;
    case "calls": page = <Calls />; break;
    case "music": page = <Music />; break;
    case "news": page = <News />; break;
    case "settings":
      page = <SettingsScreen model={model} onModelChanged={refreshModel} onCalibrate={calibrate} onClassic={() => setFlow({ name: "check", next: "classic" })} />;
      break;
    default: page = <HomeScreen navigate={navigate} onCalibrate={calibrate} />;
  }

  return (
    <AppShell route={route} navigate={navigate} onCalibrate={calibrate}>
      {/* Keyed by rail section, so switching between Talk's methods keeps the page (and its message bar) in place. */}
      <div className={`page-v2 page-v2--${railSection(route)}`} key={railSection(route)}>{page}</div>
    </AppShell>
  );
}
