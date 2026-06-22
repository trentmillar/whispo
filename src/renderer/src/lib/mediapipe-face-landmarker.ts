import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarker as FaceLandmarkerType,
} from "@mediapipe/tasks-vision"

let landmarkerPromise: Promise<FaceLandmarkerType> | null = null

function mediapipeBaseUrl(): string {
  return new URL("mediapipe/", window.location.href).href
}

function createOptions(delegate: "GPU" | "CPU") {
  const modelUrl = new URL("face_landmarker.task", mediapipeBaseUrl()).href
  return {
    baseOptions: {
      modelAssetPath: modelUrl,
      delegate,
    },
    runningMode: "VIDEO" as const,
    numFaces: 1,
    outputFaceBlendshapes: true,
    // Lower defaults so a visible face still tracks in dim light / partial profile.
    minFaceDetectionConfidence: 0.25,
    minFacePresenceConfidence: 0.25,
    minTrackingConfidence: 0.25,
  }
}

export function getFaceLandmarker(): Promise<FaceLandmarkerType> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const wasmPath = new URL("wasm/", mediapipeBaseUrl()).href
      const fileset = await FilesetResolver.forVisionTasks(wasmPath)
      try {
        return await FaceLandmarker.createFromOptions(
          fileset,
          createOptions("GPU"),
        )
      } catch {
        return await FaceLandmarker.createFromOptions(
          fileset,
          createOptions("CPU"),
        )
      }
    })().catch((e) => {
      landmarkerPromise = null
      throw e
    })
  }
  return landmarkerPromise
}
