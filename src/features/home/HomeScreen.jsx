import GazeButton from "../../components/GazeButton.jsx";
import Icon from "../../components/Icon.jsx";
import { useAlert } from "../../app/AlertContext.jsx";
import { useMessage } from "../../app/MessageContext.jsx";
import { useSpeak } from "../../app/useSpeak.js";
import { useGaze } from "../../gaze/GazeProvider.jsx";

// Two groups so the most used actions come first: building a message, then
// everyday things. Every card still leads to the same route as before.
const TALK = [
  { id: "communicate", icon: "chat", label: "Communicate", sublabel: "Typing, phrases and symbols together" },
  { id: "keyboard", icon: "keyboard", label: "Type a message", sublabel: "Keyboard with word suggestions" },
  { id: "needs", icon: "heart", label: "Quick needs", sublabel: "Hungry, pain, bathroom…" },
  { id: "symbols", icon: "smile", label: "Symbols", sublabel: "Talk with pictures" },
];

const EVERYDAY = [
  { id: "calls", icon: "phone", label: "Call someone", sublabel: "Family and carers" },
  { id: "music", icon: "music", label: "Listen to music", sublabel: "Your songs" },
  { id: "news", icon: "news", label: "Read news", sublabel: "Tamil and English" },
];

const STATUS_ICON = { ok: "check", warn: "alert", danger: "alert", neutral: "eye" };

export default function HomeScreen({ navigate, onCalibrate }) {
  const gaze = useGaze();
  const message = useMessage();
  const speakText = useSpeak();
  const alert = useAlert();
  const { status } = gaze;
  const tone = gaze.paused ? "warn" : status.tone;
  const fps = status.key === "tracking" && gaze.stats?.fps > 0 ? Math.round(gaze.stats.fps) : null;

  return (
    <div className="home">
      <div className="home-top">
        <section className={`home-status home-status--${tone}${status.key === "loading" ? " home-status--loading" : ""}`} aria-label="Eye control status">
          <span className="home-status__icon" aria-hidden="true">
            <Icon name={gaze.paused ? "pause" : STATUS_ICON[tone] ?? "eye"} />
          </span>
          <div className="home-status__text">
            <p className="home-status__label">{gaze.paused ? "Eye control paused" : status.label}</p>
            <p className="home-status__detail">{gaze.paused ? "Look at Resume at the top right to continue." : status.detail}</p>
            {fps !== null && <p className="home-status__meta">{fps} frames per second</p>}
          </div>
          <div className="home-status__actions">
            {status.key === "idle" && <button type="button" className="btn btn--primary btn--large" onClick={gaze.start}>Start eye control</button>}
            {status.key === "needs-model" && <button type="button" className="btn btn--primary btn--large" onClick={onCalibrate}>Calibrate now</button>}
            {status.key === "error" && gaze.retry && <button type="button" className="btn btn--primary btn--large" onClick={gaze.retry}>Retry camera</button>}
            {status.key === "tracking" && !gaze.paused && <GazeButton className="home-status__recenter" icon="target" label="Recenter" onClick={gaze.startRecenter} />}
          </div>
        </section>

        <section className={`home-message${message.text ? "" : " home-message--empty"}`} aria-label="Current message">
          <div className="home-message__body">
            <p className="eyebrow">Your message</p>
            <p className="home-message__text">{message.text || "Nothing written yet."}</p>
          </div>
          <div className="home-message__actions">
            {message.text && <GazeButton variant="primary" icon="speaker" label="Speak" onClick={() => speakText(message.text)} />}
            <GazeButton icon="chat" label={message.text ? "Edit" : "Start"} onClick={() => navigate("communicate")} />
          </div>
        </section>
      </div>

      <section className="home-group home-group--talk" aria-labelledby="home-talk">
        <h2 className="home-group__title" id="home-talk">Talk</h2>
        <div className="home-grid">
          {TALK.map((card) => (
            <GazeButton key={card.id} className="home-card home-card--primary" icon={card.icon} label={card.label} sublabel={card.sublabel} onClick={() => navigate(card.id)} />
          ))}
        </div>
      </section>

      <section className="home-group home-group--everyday" aria-labelledby="home-everyday">
        <h2 className="home-group__title" id="home-everyday">Everyday</h2>
        <div className="home-grid">
          {EVERYDAY.map((card) => (
            <GazeButton key={card.id} className="home-card" icon={card.icon} label={card.label} sublabel={card.sublabel} onClick={() => navigate(card.id)} />
          ))}
          <GazeButton className="home-card home-card--help" variant="danger" icon="alert" label="Call for help" sublabel="Alarm in this room" dwell={1.6} onClick={alert.raise} />
        </div>
      </section>
    </div>
  );
}
