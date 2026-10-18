import { useEffect, useState } from "react";
import GazeCalibration from "./GazeCalibration";
import GazeModelTrainer from "./GazeModelTrainer";

export default function App() {
  const [step, setStep] = useState(1);

  useEffect(() => {
    const handleCalibrationComplete = () => {
      console.log(
        "APP → Calibration complete"
      );

      setStep(2);
    };

    window.addEventListener(
      "gaze-calibration-complete",
      handleCalibrationComplete
    );

    return () => {
      window.removeEventListener(
        "gaze-calibration-complete",
        handleCalibrationComplete
      );
    };
  }, []);

  return (
    <>
      <div
        style={{
          display:
            step === 1
              ? "block"
              : "none",
        }}
      >
        <GazeCalibration />
      </div>

      <div
        style={{
          display:
            step === 2
              ? "block"
              : "none",
        }}
      >
        <GazeModelTrainer />
      </div>
    </>
  );
}