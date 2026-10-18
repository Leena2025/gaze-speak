import { useEffect, useState } from "react";

import Icon from "../../components/Icon.jsx";

const TITLES = {
  missing: "Let's set up eye control",
  failed: "Let's calibrate again",
  outdated: "Your screen changed, so let's calibrate again",
};

/**
 * Shown after sign-in when eye control is chosen but this device has no
 * usable calibration. It explains the steps and checks the camera permission;
 * the real calibration is the existing Calibration screen. Skipping switches
 * to touch or click and never marks calibration as done.
 */
export default function CalibrationGate({ status, onStart, onSkip, onSignOut }) {
  const camera = useCameraPermission();

  return (
    <main className="gate">
      <div className="gate__card">
        <header className="gate__head">
          <span className="gate__badge"><Icon name="target" size={26} /></span>
          <div>
            <p className="gate__step">Calibration</p>
            <h1 className="gate__title">{TITLES[status.state] || TITLES.missing}</h1>
          </div>
        </header>

        <p className="gate__lead">
          Every face, camera and screen is different. GAZE needs about one minute to learn where <strong>your</strong> eyes
          look on <strong>this</strong> screen. Afterwards it checks itself on new points and shows you the result.
        </p>
        {status.state !== "missing" && <p className="gate__reason" role="status"><Icon name="info" size={20} /><span>{status.reason}</span></p>}

        <ol className="gate__steps">
          <li><span className="gate__num">1</span><span><strong>Sit comfortably</strong> about an arm's length (50–70 cm) from the screen, with your face in the middle of the camera and light in front of you.</span></li>
          <li><span className="gate__num">2</span><span><strong>Allow the camera</strong> when the browser asks. Camera pictures stay on this device.</span></li>
          <li><span className="gate__num">3</span><span><strong>Look at each dot</strong> until its ring fills. First the learning points, then a few check points.</span></li>
          <li><span className="gate__num">4</span><span><strong>See the check result.</strong> If it passes, eye control starts. If not, you can try again.</span></li>
        </ol>

        <p className={`gate__camera gate__camera--${camera.tone}`} role="status">
          <Icon name="camera" size={20} />
          <span>{camera.text}</span>
        </p>

        <div className="gate__actions">
          <button type="button" className="gate__primary" onClick={onStart} autoFocus>
            <Icon name="target" size={22} /> Start calibration
          </button>
          <button type="button" className="gate__secondary" onClick={onSkip}>Use touch or click instead</button>
        </div>
        <p className="gate__note">
          Choosing touch or click does not count as calibrated. You can calibrate any time in Settings → Eye control.
        </p>
        {onSignOut && (
          <button type="button" className="gate__signout" onClick={onSignOut}><Icon name="logout" size={18} /> Sign out</button>
        )}
      </div>
    </main>
  );
}

/** The camera permission as the browser reports it, in plain words. */
function useCameraPermission() {
  const [state, setState] = useState("unknown");
  useEffect(() => {
    let status = null;
    const update = () => setState(status.state);
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return undefined;
    }
    navigator.permissions?.query({ name: "camera" }).then((result) => {
      status = result;
      update();
      result.addEventListener("change", update);
    }).catch(() => setState("unknown"));
    return () => status?.removeEventListener("change", update);
  }, []);
  if (state === "granted") return { tone: "ok", text: "Camera: allowed." };
  if (state === "denied") return { tone: "bad", text: "Camera: blocked. Click the camera or lock icon in the address bar, allow the camera for this site, then reload the page." };
  if (state === "unsupported") return { tone: "bad", text: "Camera: this browser cannot use a camera here. Use Chrome or Edge on an https:// address or on localhost." };
  return { tone: "info", text: "Camera: the browser will ask for permission when calibration starts." };
}
