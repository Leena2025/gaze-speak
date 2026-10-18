import { forwardRef } from "react";

import Icon from "./Icon.jsx";

/**
 * A button that can be selected by gaze, pointer dwell, touch, click or
 * keyboard. The GazeProvider finds it through `data-gaze` and draws dwell
 * progress on it; nothing here runs per frame.
 *
 * dwell: multiplier for the dwell time (e.g. 1.6 for Clear, so risky
 *   actions need a longer look). always: stays selectable while gaze is paused.
 */
const GazeButton = forwardRef(function GazeButton(
  { href, dwell, always = false, icon, label, sublabel, className = "", variant = "", children, ...rest },
  ref,
) {
  const classes = ["gz", variant && `gz--${variant}`, className].filter(Boolean).join(" ");
  const gazeProps = {
    "data-gaze": "",
    "data-gaze-dwell": dwell || undefined,
    "data-gaze-always": always ? "" : undefined,
  };
  const content = (
    <>
      {icon && <Icon name={icon} className="gz__icon" />}
      {label !== undefined && (
        <span className="gz__text">
          <span className="gz__label">{label}</span>
          {sublabel && <span className="gz__sublabel">{sublabel}</span>}
        </span>
      )}
      {children}
      <span className="gz__progress" aria-hidden="true" />
    </>
  );
  if (href) {
    return <a ref={ref} href={href} className={classes} {...gazeProps} {...rest}>{content}</a>;
  }
  return <button ref={ref} type="button" className={classes} {...gazeProps} {...rest}>{content}</button>;
});

export default GazeButton;
