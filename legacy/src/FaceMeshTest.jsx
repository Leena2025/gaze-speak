import { useEffect } from "react";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";

export default function FaceMeshTest() {
  useEffect(() => {
    const test = async () => {
      await tf.setBackend("webgl");
      await tf.ready();

      console.log("TensorFlow ready");

      const detector =
        await faceLandmarksDetection.createDetector(
          faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
          {
            runtime: "tfjs",
            refineLandmarks: true,
          }
        );

      console.log("✅ FACEMESH MODEL LOADED", detector);

      const video = document.querySelector("#camera");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      video.srcObject = stream;
      await video.play();

      const faces = await detector.estimateFaces(video);

      console.log("✅ FACES DETECTED:", faces.length);
      console.log("LANDMARKS:", faces[0]?.keypoints);
    };

    test().catch(console.error);
  }, []);

  return (
    <video
      id="camera"
      autoPlay
      muted
      playsInline
      width="640"
      height="480"
    />
  );
}