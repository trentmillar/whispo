import { useCallback, useEffect, useRef, useState } from "react"
import type { TrackedMirrorMood } from "@renderer/lib/emotion-mirror"
import { EmotionMirrorTracker } from "@renderer/lib/emotion-mirror"
import {
  classificationsToBlendshapeMap,
  decayBlendshapeMap,
  emaBlendshapeMap,
  emaGeometry,
  valenceFromBlendshapes,
  wrinkleProxyFromBlendshapes,
} from "@renderer/lib/blendshape-interpretation"
import {
  DEFAULT_FACE_GEOMETRY,
  landmarksToGeometry,
  type FaceGeometryMetrics,
} from "@renderer/lib/face-landmark-metrics"
import { getFaceLandmarker } from "@renderer/lib/mediapipe-face-landmarker"

export type FaceMirrorDetail = {
  blendshapes: Record<string, number>
  geometry: FaceGeometryMetrics
  /** 0–1 tension proxy from brow/squint/sneer blendshapes (not literal skin wrinkles). */
  wrinkleProxy: number
}

export type EmotionMirrorPhase =
  | { phase: "loading_models" }
  | { phase: "requesting_camera" }
  | { phase: "no_camera" }
  | { phase: "error"; message: string }
  | {
      phase: "running"
      mood: TrackedMirrorMood
      detail: FaceMirrorDetail
    }

const SAMPLE_MS = 130
const BS_EMA = 0.38
const GEOM_EMA = 0.42
const DECAY = 0.14

export function useEmotionMirror(enabled: boolean) {
  const [state, setState] = useState<EmotionMirrorPhase>({
    phase: "loading_models",
  })
  const trackerRef = useRef(new EmotionMirrorTracker())
  const blendRef = useRef<Record<string, number>>({})
  const geomRef = useRef<FaceGeometryMetrics>({ ...DEFAULT_FACE_GEOMETRY })
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelledRef = useRef(false)

  const stopCamera = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    trackerRef.current.reset()
    blendRef.current = {}
    geomRef.current = { ...DEFAULT_FACE_GEOMETRY }
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    if (!enabled) {
      stopCamera()
      setState({ phase: "loading_models" })
      return
    }

    setState({ phase: "loading_models" })
    trackerRef.current = new EmotionMirrorTracker()
    blendRef.current = {}
    geomRef.current = { ...DEFAULT_FACE_GEOMETRY }

    void (async () => {
      try {
        await getFaceLandmarker()
        if (cancelledRef.current) return
        setState({ phase: "requesting_camera" })

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
        if (cancelledRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (!video) {
          stream.getTracks().forEach((t) => t.stop())
          if (!cancelledRef.current) {
            setState({
              phase: "error",
              message: "Camera preview is not ready.",
            })
          }
          return
        }

        video.srcObject = stream
        await video.play()
        if (cancelledRef.current) return

        const landmarker = await getFaceLandmarker()

        const tick = async () => {
          if (cancelledRef.current || !videoRef.current) return
          try {
            const video = videoRef.current
            // Wait until the camera has real frames (avoids empty detections at startup).
            if (video.readyState < 2 || video.videoWidth < 2 || video.videoHeight < 2) {
              return
            }

            const now = performance.now()
            const result = landmarker.detectForVideo(video, now)

            const lm = result.faceLandmarks?.[0]
            const shape = result.faceBlendshapes?.[0]
            const hasBlendshapes = Boolean(shape?.categories?.length)

            let mood: TrackedMirrorMood
            let detail: FaceMirrorDetail

            // Presence = landmarks only. Blendshapes can be missing on some frames/paths; still use geometry.
            if (!lm) {
              mood = trackerRef.current.push(null)
              blendRef.current = decayBlendshapeMap(blendRef.current, DECAY)
              geomRef.current = emaGeometry(
                geomRef.current,
                DEFAULT_FACE_GEOMETRY,
                DECAY,
              )
              detail = {
                blendshapes: { ...blendRef.current },
                geometry: { ...geomRef.current },
                wrinkleProxy: wrinkleProxyFromBlendshapes(blendRef.current),
              }
            } else {
              const geom = landmarksToGeometry(lm)
              geomRef.current = emaGeometry(geomRef.current, geom, GEOM_EMA)

              if (hasBlendshapes && shape?.categories) {
                const raw = classificationsToBlendshapeMap(shape.categories)
                blendRef.current = emaBlendshapeMap(
                  blendRef.current,
                  raw,
                  BS_EMA,
                )
              } else {
                blendRef.current = decayBlendshapeMap(blendRef.current, DECAY * 0.65)
              }

              const v = valenceFromBlendshapes(blendRef.current)
              mood = trackerRef.current.push(v)

              detail = {
                blendshapes: { ...blendRef.current },
                geometry: { ...geomRef.current },
                wrinkleProxy: wrinkleProxyFromBlendshapes(blendRef.current),
              }
            }

            if (!cancelledRef.current) {
              setState({ phase: "running", mood, detail })
            }
          } catch {
            if (!cancelledRef.current) {
              setState({
                phase: "error",
                message: "Could not read face from the camera.",
              })
            }
          }
        }

        timerRef.current = setInterval(() => {
          void tick()
        }, SAMPLE_MS)
        void tick()
      } catch (e: unknown) {
        if (cancelledRef.current) return
        const name =
          e && typeof e === "object" && "name" in e
            ? String((e as DOMException).name)
            : ""
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setState({ phase: "no_camera" })
          return
        }
        setState({
          phase: "error",
          message: e instanceof Error ? e.message : "Camera or model error.",
        })
      }
    })()

    return () => {
      cancelledRef.current = true
      stopCamera()
    }
  }, [enabled, stopCamera])

  return { state, videoRef }
}

export function defaultFaceMirrorDetail(): FaceMirrorDetail {
  return {
    blendshapes: {},
    geometry: { ...DEFAULT_FACE_GEOMETRY },
    wrinkleProxy: 0,
  }
}
