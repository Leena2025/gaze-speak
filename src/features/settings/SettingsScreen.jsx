import { useRef, useState } from "react";

import GazeButton from "../../components/GazeButton.jsx";
import Icon from "../../components/Icon.jsx";
import { useGaze } from "../../gaze/GazeProvider.jsx";
import { useNotice } from "../../app/NoticeContext.jsx";
import { useAuth } from "../../app/AuthContext.jsx";
import { useSettings } from "../../app/SettingsContext.jsx";
import { useUserContent } from "../../app/UserContentContext.jsx";
import { useSpeak } from "../../app/useSpeak.js";
import { DWELL_MAX_MS, DWELL_MIN_MS, DWELL_STEP_MS, INPUT_MODES } from "../../app/settingsModel.js";
import { SPEECH_LANGS, speechSupported, useVoices } from "../../app/speech.js";
import { downloadModel, hasPreviousModel, installModel, readModelFile, restorePreviousModel } from "../../gaze/modelStore.js";
import { readViewport, viewportChanged } from "../../gaze/layout.js";
import { formatDate, formatPx } from "../../ui/format.js";

const TABS = [
  { id: "eyes", label: "Eye control", hint: "Camera, dwell, recenter", icon: "eye" },
  { id: "display", label: "Display", hint: "Text size and colours", icon: "monitor" },
  { id: "speech", label: "Speech", hint: "Language, voice, speed", icon: "speaker" },
  { id: "keyboard", label: "Keyboard", hint: "Letter order, key size", icon: "keyboard" },
  { id: "phrases", label: "Phrases & symbols", hint: "Your own phrases and pictures", icon: "message" },
  { id: "model", label: "Gaze model", hint: "Calibration and backups", icon: "chip" },
  { id: "account", label: "Account", hint: "Signed-in person, sign out", icon: "user" },
];

const DESCRIPTIONS = {
  eyes: "How selection works, and the camera that follows your eyes.",
  display: "Make text easier to read and choose the colours.",
  speech: "The language and voice used to speak messages.",
  keyboard: "How the typing keyboard is laid out.",
  phrases: "Phrases and symbols you add yourself. A helper usually types these.",
  model: "The calibration in use, with import, download and restore.",
  account: "Who is signed in on this device.",
};

/** One setting as a compact row: name and hint on the left, control on the right. */
function Row({ label, hint, labelId, children, wide = false }) {
  return (
    <div className={`setting setting--row${wide ? " setting--wide" : ""}`} role="group" aria-labelledby={labelId}>
      <div className="setting__text">
        <span className="setting__label" id={labelId}>{label}</span>
        {hint && <span className="setting__hint">{hint}</span>}
      </div>
      <div className="setting__control">{children}</div>
    </div>
  );
}

function rowId(label) {
  return `set-${String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function Choice({ label, hint, options, value, onChange }) {
  const wide = options.length > 2 || options.some((option) => option.hint);
  return (
    <Row label={label} hint={hint} labelId={rowId(label)} wide={wide}>
      <div className="segmented-v2">
        {options.map((option) => (
          <GazeButton key={option.value} label={option.label} sublabel={option.hint} aria-pressed={value === option.value} onClick={() => onChange(option.value)} />
        ))}
      </div>
    </Row>
  );
}

function Toggle({ label, hint, value, onChange }) {
  return (
    <Row label={label} hint={hint} labelId={rowId(label)}>
      <div className="segmented-v2 segmented-v2--toggle">
        <GazeButton label="On" aria-pressed={value} onClick={() => onChange(true)} />
        <GazeButton label="Off" aria-pressed={!value} onClick={() => onChange(false)} />
      </div>
    </Row>
  );
}

function Stepper({ label, hint, display, onMinus, onPlus, minusDisabled, plusDisabled }) {
  return (
    <Row label={label} hint={hint} labelId={rowId(label)}>
      <div className="stepper">
        <GazeButton icon="minus" label="Less" disabled={minusDisabled} onClick={onMinus} />
        <output className="stepper__value" aria-live="polite">{display}</output>
        <GazeButton icon="plus" label="More" disabled={plusDisabled} onClick={onPlus} />
      </div>
    </Row>
  );
}

export default function SettingsScreen({ model, onModelChanged, onCalibrate, onClassic }) {
  const [tab, setTab] = useState("eyes");
  const current = TABS.find((item) => item.id === tab);

  // Up and down arrows move between categories, like a list of tabs.
  const onNavKey = (event) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = (TABS.findIndex((item) => item.id === tab) + step + TABS.length) % TABS.length;
    setTab(TABS[index].id);
    event.currentTarget.querySelectorAll("[role=tab]")[index]?.focus();
  };

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings groups">
        <div className="settings-nav__list" role="tablist" aria-orientation="vertical" onKeyDown={onNavKey}>
          {TABS.map((item) => (
            <GazeButton
              key={item.id}
              role="tab"
              id={`tab-${item.id}`}
              aria-controls="settings-panel"
              tabIndex={tab === item.id ? 0 : -1}
              className="tabs__tab settings-nav__item"
              aria-selected={tab === item.id}
              icon={item.icon}
              label={item.label}
              sublabel={item.hint}
              onClick={() => setTab(item.id)}
            />
          ))}
        </div>
      </nav>
      <div className="settings__panel" role="tabpanel" id="settings-panel" aria-labelledby={`tab-${tab}`}>
        <header className="settings__head">
          <h2 className="settings__title">{current.label}</h2>
          <p className="settings__desc">{DESCRIPTIONS[tab]}</p>
        </header>
        {tab === "eyes" && <EyeSettings onCalibrate={onCalibrate} onClassic={onClassic} hasModel={Boolean(model.doc)} />}
        {tab === "display" && <DisplaySettings />}
        {tab === "speech" && <SpeechSettings />}
        {tab === "keyboard" && <KeyboardSettings model={model} />}
        {tab === "phrases" && <PhraseSettings />}
        {tab === "model" && <ModelSettings model={model} onModelChanged={onModelChanged} onCalibrate={onCalibrate} />}
        {tab === "account" && <AccountSettings />}
      </div>
    </div>
  );
}

function EyeSettings({ onCalibrate, onClassic, hasModel }) {
  const { settings, update } = useSettings();
  const gaze = useGaze();
  const notify = useNotice();

  const tracking = gaze.status.key === "tracking";
  return (
    <>
      <EyeStatusCard
        hasModel={hasModel}
        onCalibrate={onCalibrate}
        onClassic={onClassic}
        gazeMode={settings.inputMode === INPUT_MODES.gaze}
        tracking={tracking}
        notify={notify}
      />
      <Choice
        label="How to select"
        value={settings.inputMode}
        onChange={(inputMode) => update({ inputMode })}
        options={[
          { value: INPUT_MODES.gaze, label: "Eye gaze", hint: "Webcam" },
          { value: INPUT_MODES.pointer, label: "Pointer dwell", hint: "Mouse or head pointer" },
          { value: INPUT_MODES.touch, label: "Touch or click", hint: "No dwell" },
        ]}
      />
      <Stepper
        label="Dwell time"
        hint="How long to look at a button before it is selected. Longer is safer; shorter is faster."
        display={`${(settings.dwellMs / 1000).toFixed(1)} s`}
        minusDisabled={settings.dwellMs <= DWELL_MIN_MS}
        plusDisabled={settings.dwellMs >= DWELL_MAX_MS}
        onMinus={() => update({ dwellMs: settings.dwellMs - DWELL_STEP_MS })}
        onPlus={() => update({ dwellMs: settings.dwellMs + DWELL_STEP_MS })}
      />
      <Toggle label="Selection sound" hint="A soft click when something is selected." value={settings.feedbackSound} onChange={(feedbackSound) => update({ feedbackSound })} />
      <Toggle label="Show gaze point" hint="A ring where the camera thinks you are looking." value={settings.showGazeCursor} onChange={(showGazeCursor) => update({ showGazeCursor })} />
    </>
  );
}

/**
 * Live status of eye control with the camera picture the tracker uses.
 * Everything shown comes from the tracker; nothing here is simulated.
 */
function EyeStatusCard({ hasModel, onCalibrate, onClassic, gazeMode, tracking, notify }) {
  const gaze = useGaze();
  const { status } = gaze;
  const cameraOn = gazeMode && gaze.started && hasModel;
  // The development simulator (?simulate) feeds gaze without a camera.
  const simulated = gaze.stats?.backend === "simulator";
  const showPicture = cameraOn && status.key !== "error" && !simulated;
  const hasOffset = gaze.offset.x !== 0 || gaze.offset.y !== 0;
  let offMessage = "The camera is off. Press Start eye control.";
  if (!gazeMode) offMessage = "The camera is only used in Eye gaze mode.";
  else if (simulated) offMessage = "Simulated eyes: there is no camera picture.";
  else if (status.key === "error") offMessage = "No camera picture. See the message beside this box.";
  else if (!hasModel) offMessage = "Calibrate first, then start eye control.";

  return (
    <section className={`eye-card eye-card--${status.tone}`} aria-label="Eye control status">
      <div className="eye-card__preview">
        {showPicture ? (
          <div className="eye-card__slot" ref={gaze.setPreviewSlot} role="img" aria-label="Live camera picture">
            {status.key === "loading" && <span className="eye-card__overlay">Starting camera…</span>}
          </div>
        ) : (
          <div className="eye-card__slot eye-card__slot--off">
            <Icon name="camera" size={28} />
            <span>{offMessage}</span>
          </div>
        )}
        {showPicture && <span className={`eye-card__face eye-card__face--${status.tone}`}>{status.label}</span>}
      </div>
      <div className="eye-card__body">
        <div className="eye-card__status">
          <span className={`status-dot status-dot--${status.tone}`} aria-hidden="true" />
          <div>
            <p className="eye-card__label">{status.label}</p>
            <p className="setting__hint">{status.detail}</p>
          </div>
        </div>
        <ul className="eye-card__facts">
          {gaze.stats?.fps > 0 && <li>{gaze.stats.fps.toFixed(0)} frames per second · {gaze.stats.backend}</li>}
          {hasOffset && <li>Recenter offset: {Math.round(gaze.offset.x * 100)}%, {Math.round(gaze.offset.y * 100)}%</li>}
        </ul>
        {gaze.recenterResult && (
          <p className={`notice notice--${gaze.recenterResult.ok ? "success" : "warn"}`} role="status">
            {gaze.recenterResult.ok ? "Recentered." : "Recentering failed: the face was not visible long enough. Try again."}
          </p>
        )}
        <div className="eye-card__actions">
          {gazeMode && hasModel && !gaze.started && <button type="button" className="btn btn--primary" onClick={gaze.start}>Start eye control</button>}
          {gazeMode && gaze.started && <button type="button" className="btn" onClick={gaze.stop}>Stop camera</button>}
          <GazeButton icon="target" label="Recenter" sublabel="Look at a dot for 2 s" disabled={!tracking} onClick={gaze.startRecenter} />
          {hasOffset && <button type="button" className="btn" onClick={() => { gaze.resetOffset(); notify("Recenter offset removed.", "info"); }}>Remove recenter offset</button>}
          <button type="button" className="btn" onClick={onCalibrate}>{hasModel ? "Recalibrate" : "Calibrate"} (about 1 minute)</button>
          <button type="button" className="btn" onClick={onClassic} disabled={!hasModel}>Accuracy test and classic keyboard</button>
        </div>
      </div>
    </section>
  );
}

function DisplaySettings() {
  const { settings, update } = useSettings();
  return (
    <>
      <Choice label="Text size" value={settings.textSize} onChange={(textSize) => update({ textSize })} options={[
        { value: "normal", label: "Normal" },
        { value: "large", label: "Large" },
        { value: "xlarge", label: "Extra large" },
      ]} />
      <Choice label="Colours" value={settings.theme} onChange={(theme) => update({ theme })} options={[
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark", hint: "Less glare" },
        { value: "contrast", label: "High contrast" },
      ]} />
    </>
  );
}

function SpeechSettings() {
  const { settings, update } = useSettings();
  const speakText = useSpeak();
  const voices = useVoices();
  const voicesFor = (lang) => voices.filter((voice) => voice.lang?.toLowerCase().startsWith(lang));
  const english = voicesFor("en");
  const tamil = voicesFor("ta");

  if (!speechSupported()) {
    return <p className="notice notice--danger">This browser has no speech engine. Use a current Chrome or Edge.</p>;
  }
  return (
    <>
      <Choice label="Language for phrases, symbols and speech" value={settings.language} onChange={(language) => update({ language })} options={[
        { value: "en", label: "English" },
        { value: "ta", label: "தமிழ்", hint: "Tamil" },
      ]} />
      {settings.language === "ta" && !tamil.length && (
        <p className="notice notice--warn">No Tamil voice is installed on this device, so Tamil text may be read wrongly or not at all. On Android, install Google Text-to-speech with Tamil. On Windows, add the Tamil language pack with speech.</p>
      )}
      <Stepper
        label="Speaking speed"
        display={`${settings.speechRate.toFixed(1)}×`}
        minusDisabled={settings.speechRate <= 0.5}
        plusDisabled={settings.speechRate >= 2}
        onMinus={() => update({ speechRate: settings.speechRate - 0.1 })}
        onPlus={() => update({ speechRate: settings.speechRate + 0.1 })}
      />
      <Toggle label="Speak phrases straight away" hint="Quick needs and symbols are spoken as soon as they are chosen." value={settings.autoSpeak} onChange={(autoSpeak) => update({ autoSpeak })} />
      <div className="setting setting--row setting--wide">
        <div className="setting__text">
          <span className="setting__label">Voices</span>
          <span className="setting__hint">Chosen by a helper. Automatic picks the best installed voice.</span>
        </div>
        <div className="setting__control setting__control--stack">
          <label className="field" htmlFor="voice-en">
            <span className="field__label">English voice</span>
            <select id="voice-en" value={settings.voiceEn} onChange={(event) => update({ voiceEn: event.target.value })}>
              <option value="">Automatic ({SPEECH_LANGS.en} preferred)</option>
              {english.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
            </select>
          </label>
          <label className="field" htmlFor="voice-ta">
            <span className="field__label">Tamil voice</span>
            <select id="voice-ta" value={settings.voiceTa} onChange={(event) => update({ voiceTa: event.target.value })} disabled={!tamil.length}>
              <option value="">{tamil.length ? "Automatic" : "No Tamil voice on this device"}</option>
              {tamil.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
            </select>
          </label>
          <div className="toolbar-row">
            <GazeButton icon="speaker" label="Test English" onClick={() => speakText("Hello. This is my voice.", "en")} />
            <GazeButton icon="speaker" label="Test Tamil" onClick={() => speakText("வணக்கம். இது என் குரல்.", "ta")} />
          </div>
        </div>
      </div>
    </>
  );
}

function KeyboardSettings({ model }) {
  const { settings, update } = useSettings();
  const content = useUserContent();
  const notify = useNotice();
  const learned = Object.keys(content.userWords.words || {}).length;
  return (
    <>
      <Choice label="Letter order" value={settings.keyboardLayout} onChange={(keyboardLayout) => update({ keyboardLayout })} options={[
        { value: "abc", label: "A B C", hint: "Alphabetical" },
        { value: "qwerty", label: "QWERTY", hint: "Like a computer" },
      ]} />
      <Choice label="Key size" value={settings.keyMode} onChange={(keyMode) => update({ keyMode })} options={[
        { value: "auto", label: "Automatic", hint: model.doc ? `Calibration suggests ${model.doc.recommendedMode === "direct" ? "full keyboard" : "large tiles"}` : "Full keyboard" },
        { value: "full", label: "Full keyboard" },
        { value: "tiles", label: "Large tiles", hint: "Two steps per letter" },
      ]} />
      <Toggle label="Capital letter at the start of a sentence" value={settings.autoCapitalize} onChange={(autoCapitalize) => update({ autoCapitalize })} />
      <div className="setting setting--row">
        <div className="setting__text">
          <span className="setting__label">Learned words</span>
          <span className="setting__hint">{learned} words learned from spoken messages, used to improve suggestions. They stay in this browser.</span>
        </div>
        <div className="setting__control">
          <button type="button" className="btn" disabled={!learned} onClick={() => {
            if (window.confirm("Forget all learned words?")) {
              content.forgetWords();
              notify("Learned words cleared.", "info");
            }
          }}>Forget learned words</button>
        </div>
      </div>
    </>
  );
}

function PhraseSettings() {
  const content = useUserContent();
  const notify = useNotice();
  const [phrase, setPhrase] = useState("");
  const [symbol, setSymbol] = useState({ emoji: "", label: "", phrase: "" });

  return (
    <>
      <section className="setting">
        <h2 className="setting__label">My phrases</h2>
        <span className="setting__hint">Shown in Quick needs under My phrases, and on the Communicate page.</span>
        <form className="form-row" onSubmit={(event) => {
          event.preventDefault();
          if (content.addPhrase(phrase)) {
            setPhrase("");
            notify("Phrase added.", "success");
          } else {
            notify(phrase.trim() ? "That phrase is already saved." : "Type a phrase first.", "info");
          }
        }}>
          <input value={phrase} onChange={(event) => setPhrase(event.target.value)} placeholder="For example: Please open the window." maxLength={160} aria-label="New phrase" />
          <button type="submit" className="btn btn--primary">Add phrase</button>
        </form>
        {!content.phrases.length && <p className="manage-empty">No phrases saved yet.</p>}
        <ul className="manage-list">
          {content.phrases.map((item) => (
            <li key={item.id}><span>{item.text}</span><button type="button" className="btn btn--small" onClick={() => content.removePhrase(item.id)}>Delete</button></li>
          ))}
        </ul>
      </section>
      <section className="setting">
        <h2 className="setting__label">My symbols</h2>
        <span className="setting__hint">Shown in Symbols under My symbols. Use an emoji, a short label and the sentence to say.</span>
        <form className="form-grid" onSubmit={(event) => {
          event.preventDefault();
          if (!symbol.label.trim() || !symbol.phrase.trim()) {
            notify("Enter a label and a sentence.", "warn");
            return;
          }
          content.addSymbol(symbol);
          setSymbol({ emoji: "", label: "", phrase: "" });
          notify("Symbol added.", "success");
        }}>
          <label>Emoji<input value={symbol.emoji} onChange={(event) => setSymbol({ ...symbol, emoji: event.target.value })} placeholder="🍌" maxLength={8} /></label>
          <label>Label<input value={symbol.label} onChange={(event) => setSymbol({ ...symbol, label: event.target.value })} placeholder="Banana" maxLength={24} /></label>
          <label>Sentence<input value={symbol.phrase} onChange={(event) => setSymbol({ ...symbol, phrase: event.target.value })} placeholder="I want a banana." maxLength={160} /></label>
          <div className="toolbar-row"><button type="submit" className="btn btn--primary">Add symbol</button></div>
        </form>
        {!content.symbols.length && <p className="manage-empty">No symbols added yet.</p>}
        <ul className="manage-list">
          {content.symbols.map((item) => (
            <li key={item.id}><span>{item.emoji} {item.label}: {item.phrase}</span><button type="button" className="btn btn--small" onClick={() => content.removeSymbol(item.id)}>Delete</button></li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** Model management, moved here from V1's home screen. */
function ModelSettings({ model, onModelChanged, onCalibrate }) {
  const fileRef = useRef(null);
  const [notice, setNotice] = useState(null);
  const [previousAvailable, setPreviousAvailable] = useState(() => hasPreviousModel());
  const doc = model.doc;
  const validation = doc?.metrics?.validation;

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = await readModelFile(file);
      installModel(imported);
      await onModelChanged();
      setPreviousAvailable(hasPreviousModel());
      const calibrated = imported.calibration.viewport;
      const current = readViewport();
      const sizeNote = viewportChanged(current, calibrated)
        ? ` It was calibrated at ${calibrated.width}×${calibrated.height} px but this screen area is ${current.width}×${current.height} px, so the gaze point will be offset until you restore that size or recalibrate.`
        : "";
      setNotice({ tone: sizeNote ? "warn" : "success", text: `Imported and installed ${file.name}.${sizeNote}` });
    } catch (error) {
      setNotice({ tone: "danger", text: `Import failed: ${error.message} The current model was not changed.` });
    }
  };

  const restore = async () => {
    try {
      restorePreviousModel();
      await onModelChanged();
      setPreviousAvailable(hasPreviousModel());
      setNotice({ tone: "success", text: "The previous model is active again." });
    } catch (error) {
      setNotice({ tone: "danger", text: error.message });
    }
  };

  return (
    <section className="setting">
      {model.loading ? (
        <p className="muted">Checking for an installed model…</p>
      ) : doc ? (
        <dl className="facts">
          <div><dt>Status</dt><dd>Ready, {model.source === "file" ? "from the deployed default file" : "installed in this browser"}</dd></div>
          <div><dt>Calibrated</dt><dd>{formatDate(doc.createdAt)} at {doc.calibration.viewport.width}×{doc.calibration.viewport.height}</dd></div>
          {validation && <div><dt>Held-out error</dt><dd>{formatPx(validation.meanErrorPx)} mean · {Math.round(validation.directKeyHitRate * 100)}% of frames on the right key</dd></div>}
          <div><dt>Suggested keys</dt><dd>{doc.recommendedMode === "direct" ? "Full keyboard (accuracy is good enough)" : "Large tiles (recommended for this accuracy)"}</dd></div>
        </dl>
      ) : (
        <p className="muted">{model.message || "No model installed yet."}</p>
      )}
      <div className="toolbar-row">
        <button type="button" className="btn btn--primary" onClick={onCalibrate}>{doc ? "Recalibrate" : "Calibrate"}</button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Import model file…</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importFile} />
        {doc && <button type="button" className="btn" onClick={() => downloadModel(doc)}>Download current model</button>}
        {previousAvailable && <button type="button" className="btn" onClick={restore}>Restore previous model</button>}
      </div>
      {notice && <p className={`notice notice--${notice.tone}`} role="status">{notice.text}</p>}
      <p className="muted small">The model, settings, phrases and contacts are stored only in this browser. Camera images never leave this device.</p>
    </section>
  );
}

function AccountSettings() {
  const auth = useAuth();
  if (auth.mode !== "supabase") {
    return (
      <p className="notice notice--info">
        Sign-in is off on this computer, because no account service is set up. This only works when the app is opened
        on this computer (localhost); a website on the internet always asks people to sign in. See README.md, Sign-in.
      </p>
    );
  }
  return (
    <Row label="Signed in as" hint={auth.user?.email || "Unknown account"} labelId="account-row">
      <GazeButton icon="logout" label="Sign out" variant="danger" dwell={1.6} onClick={auth.signOut} />
    </Row>
  );
}
