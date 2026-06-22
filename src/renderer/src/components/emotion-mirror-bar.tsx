import { CaricatureFace } from "@renderer/components/caricature-face"
import {
  defaultFaceMirrorDetail,
  useEmotionMirror,
  type EmotionMirrorPhase,
} from "@renderer/hooks/use-emotion-mirror"
import { AnimatePresence, motion } from "framer-motion"
import { Sparkles, TrendingDown, VideoOff } from "lucide-react"

type BarTone = "positive" | "negative" | "trend" | "neutral" | "muted"

function labelForPhase(phase: EmotionMirrorPhase): {
  title: string
  subtitle?: string
  tone: BarTone
} {
  switch (phase.phase) {
    case "loading_models":
      return {
        title: "Loading on-device face model (landmarks + blendshapes)…",
        tone: "muted",
      }
    case "requesting_camera":
      return {
        title: "Starting camera for expression mirror…",
        tone: "muted",
      }
    case "no_camera":
      return {
        title: "Camera unavailable",
        subtitle: "Allow camera access to see how your expression may read to others.",
        tone: "muted",
      }
    case "error":
      return {
        title: phase.message,
        tone: "muted",
      }
    case "running":
      switch (phase.mood) {
        case "no_face":
          return {
            title: "No face in frame",
            subtitle: "Stay centered in the camera to update the mirror.",
            tone: "muted",
          }
        case "positive":
          return {
            title: "Expression reads warm or upbeat",
            subtitle: "How you may come across on video.",
            tone: "positive",
          }
        case "negative":
          return {
            title: "Expression may read tense or heavy",
            subtitle: "Consider posture, pace, and tone — signal is from your face only.",
            tone: "negative",
          }
        case "trending_negative":
          return {
            title: "Drifting toward a heavier expression",
            subtitle: "Short pause or softer brow/jaw often reads calmer.",
            tone: "trend",
          }
        case "neutral":
          return {
            title: "Neutral / calm expression",
            subtitle: "Fine-tuned cues — not a read on your inner state.",
            tone: "neutral",
          }
      }
  }
}

const toneClasses: Record<BarTone, string> = {
  positive:
    "border-emerald-500/40 bg-emerald-950/50 text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.15)]",
  negative:
    "border-rose-500/35 bg-rose-950/45 text-rose-100 shadow-[0_0_24px_rgba(244,63,94,0.12)]",
  trend:
    "border-amber-500/40 bg-amber-950/50 text-amber-100 shadow-[0_0_24px_rgba(245,158,11,0.12)]",
  neutral:
    "border-sky-500/30 bg-slate-900/60 text-sky-100/95 shadow-[0_0_20px_rgba(56,189,248,0.08)]",
  muted: "border-white/10 bg-black/35 text-gray-300",
}

export function EmotionMirrorBar() {
  const { state, videoRef } = useEmotionMirror(true)
  const labeled = labelForPhase(state)
  const { title, subtitle, tone } = labeled

  const caricatureDetail =
    state.phase === "running" ? state.detail : defaultFaceMirrorDetail()

  const icon =
    state.phase === "no_camera" ? (
      <VideoOff className="h-4 w-4 shrink-0 opacity-80" />
    ) : state.phase === "running" && state.mood === "trending_negative" ? (
      <TrendingDown className="h-4 w-4 shrink-0 opacity-90" />
    ) : state.phase === "running" && state.mood === "positive" ? (
      <Sparkles className="h-4 w-4 shrink-0 text-emerald-300/90" />
    ) : null

  const metrics =
    state.phase === "running" ? (
      <p className="text-[10px] font-mono leading-snug text-white/45">
        eyes L/R slant {state.detail.geometry.eyeSlantLeftDeg.toFixed(1)}° /{" "}
        {state.detail.geometry.eyeSlantRightDeg.toFixed(1)}° · brow{" "}
        {state.detail.geometry.browSlantLeftDeg.toFixed(1)}° /{" "}
        {state.detail.geometry.browSlantRightDeg.toFixed(1)}° · mouth{" "}
        {state.detail.geometry.mouthSlantDeg.toFixed(1)}° · open{" "}
        {state.detail.geometry.eyeOpenLeft.toFixed(2)} /{" "}
        {state.detail.geometry.eyeOpenRight.toFixed(2)} · mouth w{" "}
        {state.detail.geometry.mouthWidthNorm.toFixed(2)} · tension{" "}
        {state.detail.wrinkleProxy.toFixed(2)}
      </p>
    ) : null

  return (
    <>
      <video
        ref={videoRef}
        className="pointer-events-none fixed bottom-0 left-0 h-px w-px opacity-0"
        muted
        playsInline
      />
      <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-[60] flex max-h-[90vh] flex-col items-center justify-end gap-3 overflow-y-auto px-4 pb-1">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-none flex shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-black/20 p-2 shadow-xl backdrop-blur-sm"
        >
          <CaricatureFace
            detail={caricatureDetail}
            className="h-[7.5rem] w-[7.5rem] shrink-0 drop-shadow-md"
          />
          {metrics}
        </motion.div>
        <AnimatePresence mode="wait">
          <motion.div
            key={title + (subtitle ?? "")}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className={`pointer-events-auto flex max-w-lg flex-col gap-0.5 rounded-2xl border px-4 py-3 text-center backdrop-blur-md ${toneClasses[tone]}`}
          >
            <div className="flex items-center justify-center gap-2 text-sm font-medium leading-snug">
              {icon}
              <span>{title}</span>
            </div>
            {subtitle ? (
              <p className="text-xs leading-relaxed text-white/55">{subtitle}</p>
            ) : null}
            <p className="text-[10px] leading-tight text-white/35">
              On-device MediaPipe — blendshapes + 2D landmarks. Tension is a proxy, not literal
              wrinkles.
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  )
}
