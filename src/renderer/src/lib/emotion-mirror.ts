/**
 * Valence → mood labels for the overlay mirror.
 * Raw valence comes from MediaPipe ARKit-style blendshapes (see blendshape-interpretation).
 * Uses smoothed EMA plus a short history buffer to detect stable mood and
 * negative trend without flicker.
 */

/** Smoothed expression read from a single face in frame. */
export type TrackedMirrorMood =
  | "no_face"
  | "neutral"
  | "positive"
  | "negative"
  | "trending_negative"

const EMA_ALPHA = 0.17
const HISTORY = 22
const NEG_CUT = -0.21
const POS_CUT = 0.2
const TREND_NEG_SLOPE = -0.011
const TREND_NEG_EMA_MAX = 0.16

export class EmotionMirrorTracker {
  private ema = 0
  private history: number[] = []
  private seeded = false

  reset() {
    this.ema = 0
    this.history = []
    this.seeded = false
  }

  /**
   * @param rawValence valence from expressions, or null when no face in frame
   */
  push(rawValence: number | null): TrackedMirrorMood {
    if (rawValence === null) {
      return "no_face"
    }
    if (!this.seeded) {
      this.ema = rawValence
      this.seeded = true
    } else {
      this.ema = EMA_ALPHA * rawValence + (1 - EMA_ALPHA) * this.ema
    }
    this.history.push(this.ema)
    if (this.history.length > HISTORY) {
      this.history.shift()
    }
    return this.resolveMood()
  }

  private slope(): number {
    if (this.history.length < 10) return 0
    const first = this.history[0]!
    const last = this.history[this.history.length - 1]!
    return (last - first) / this.history.length
  }

  private resolveMood(): TrackedMirrorMood {
    const ema = this.ema
    const slope = this.slope()

    if (ema <= NEG_CUT) {
      return "negative"
    }
    if (
      ema < POS_CUT &&
      ema <= TREND_NEG_EMA_MAX &&
      slope < TREND_NEG_SLOPE
    ) {
      return "trending_negative"
    }
    if (ema >= POS_CUT) {
      return "positive"
    }
    return "neutral"
  }
}
