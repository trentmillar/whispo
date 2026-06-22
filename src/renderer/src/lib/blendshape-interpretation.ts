/** ARKit-style blendshape names from MediaPipe Face Landmarker. */

import type { FaceGeometryMetrics } from "@renderer/lib/face-landmark-metrics"

export function classificationsToBlendshapeMap(
  categories: { categoryName: string; score: number }[],
): Record<string, number> {
  const m: Record<string, number> = {}
  for (const c of categories) {
    m[c.categoryName] = c.score
  }
  return m
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

/**
 * Single scalar for mood tracking (same role as old FER valence).
 * Uses muscle-activation blendshapes, not coarse emotion classes.
 */
export function valenceFromBlendshapes(bs: Record<string, number>): number {
  const smile =
    (bs.mouthSmileLeft ?? 0) +
    (bs.mouthSmileRight ?? 0) +
    (bs.mouthStretchLeft ?? 0) * 0.35 +
    (bs.mouthStretchRight ?? 0) * 0.35
  const frown =
    (bs.mouthFrownLeft ?? 0) +
    (bs.mouthFrownRight ?? 0) +
    (bs.mouthPressLeft ?? 0) * 0.25 +
    (bs.mouthPressRight ?? 0) * 0.25
  const browDown = (bs.browDownLeft ?? 0) + (bs.browDownRight ?? 0)
  const browInnerUp = bs.browInnerUp ?? 0
  const squint =
    (bs.eyeSquintLeft ?? 0) +
    (bs.eyeSquintRight ?? 0) +
    (bs.cheekSquintLeft ?? 0) * 0.4 +
    (bs.cheekSquintRight ?? 0) * 0.4
  const jawOpen = bs.jawOpen ?? 0
  const pucker = (bs.mouthPucker ?? 0) + (bs.mouthFunnel ?? 0) * 0.5

  const v =
    smile * 0.38 -
    frown * 0.34 -
    browDown * 0.18 -
    browInnerUp * 0.08 -
    squint * 0.06 +
    jawOpen * 0.05 -
    pucker * 0.08

  return clamp(v, -1, 1)
}

/**
 * Proxy for “wrinkle” / periorbital tension from blendshapes (not true skin texture).
 */
export function wrinkleProxyFromBlendshapes(bs: Record<string, number>): number {
  const v =
    0.32 * ((bs.browDownLeft ?? 0) + (bs.browDownRight ?? 0)) +
    0.28 * ((bs.eyeSquintLeft ?? 0) + (bs.eyeSquintRight ?? 0)) +
    0.22 * ((bs.cheekSquintLeft ?? 0) + (bs.cheekSquintRight ?? 0)) +
    0.18 * ((bs.noseSneerLeft ?? 0) + (bs.noseSneerRight ?? 0))
  return clamp(v, 0, 1)
}

export function emaBlendshapeMap(
  prev: Record<string, number>,
  next: Record<string, number>,
  alpha: number,
): Record<string, number> {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  const out: Record<string, number> = {}
  for (const k of keys) {
    const p = prev[k] ?? 0
    const n = next[k] ?? 0
    out[k] = alpha * n + (1 - alpha) * p
  }
  return out
}

export function decayBlendshapeMap(
  prev: Record<string, number>,
  alpha: number,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of Object.keys(prev)) {
    out[k] = (1 - alpha) * (prev[k] ?? 0)
  }
  return out
}

function emaNum(prev: number, next: number, alpha: number) {
  return alpha * next + (1 - alpha) * prev
}

export function emaGeometry(
  prev: FaceGeometryMetrics,
  next: FaceGeometryMetrics,
  alpha: number,
): FaceGeometryMetrics {
  return {
    eyeSlantLeftDeg: emaNum(prev.eyeSlantLeftDeg, next.eyeSlantLeftDeg, alpha),
    eyeSlantRightDeg: emaNum(prev.eyeSlantRightDeg, next.eyeSlantRightDeg, alpha),
    eyeOpenLeft: emaNum(prev.eyeOpenLeft, next.eyeOpenLeft, alpha),
    eyeOpenRight: emaNum(prev.eyeOpenRight, next.eyeOpenRight, alpha),
    mouthSlantDeg: emaNum(prev.mouthSlantDeg, next.mouthSlantDeg, alpha),
    mouthWidthNorm: emaNum(prev.mouthWidthNorm, next.mouthWidthNorm, alpha),
    browSlantLeftDeg: emaNum(prev.browSlantLeftDeg, next.browSlantLeftDeg, alpha),
    browSlantRightDeg: emaNum(prev.browSlantRightDeg, next.browSlantRightDeg, alpha),
  }
}
