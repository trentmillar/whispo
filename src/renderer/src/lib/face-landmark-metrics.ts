import type { NormalizedLandmark } from "@mediapipe/tasks-vision"

/**
 * Indices match MediaPipe Face Landmarker / Face Mesh topology (478 pts).
 * @see https://github.com/google/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png
 */
const LM = {
  /** Left eye (subject's left): outer → inner */
  leOuter: 33,
  leInner: 133,
  leUpper: 159,
  leLower: 145,
  /** Right eye */
  reInner: 362,
  reOuter: 263,
  reUpper: 386,
  reLower: 374,
  /** Mouth corners */
  mouthLeft: 61,
  mouthRight: 291,
  /** Brows */
  lbOuter: 70,
  lbInner: 107,
  rbInner: 336,
  rbOuter: 300,
  /** Face width (zygomatic) */
  faceL: 234,
  faceR: 454,
} as const

function getPt(lm: NormalizedLandmark[], i: number): NormalizedLandmark | undefined {
  return lm[i]
}

function dist(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function angleDegHoriz(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

export type FaceGeometryMetrics = {
  /** Angle of the eye opening line vs horizontal (°). */
  eyeSlantLeftDeg: number
  eyeSlantRightDeg: number
  /** Normalized eye opening height / width (~EAR-style), ~0.15–0.45 typical. */
  eyeOpenLeft: number
  eyeOpenRight: number
  /** Angle of mouth corner line vs horizontal (°). */
  mouthSlantDeg: number
  /** Mouth corner separation / face width. */
  mouthWidthNorm: number
  /** Brow segment angle vs horizontal (°). */
  browSlantLeftDeg: number
  browSlantRightDeg: number
}

export const DEFAULT_FACE_GEOMETRY: FaceGeometryMetrics = {
  eyeSlantLeftDeg: 0,
  eyeSlantRightDeg: 0,
  eyeOpenLeft: 0.22,
  eyeOpenRight: 0.22,
  mouthSlantDeg: 0,
  mouthWidthNorm: 0.45,
  browSlantLeftDeg: 0,
  browSlantRightDeg: 0,
}

/** Landmark-derived slant / size metrics (image-plane, normalized coords). */
export function landmarksToGeometry(
  lm: NormalizedLandmark[] | undefined,
): FaceGeometryMetrics {
  if (!lm || lm.length < 400) {
    return { ...DEFAULT_FACE_GEOMETRY }
  }

  const leo = getPt(lm, LM.leOuter)
  const lei = getPt(lm, LM.leInner)
  const reo = getPt(lm, LM.reOuter)
  const rei = getPt(lm, LM.reInner)
  const mL = getPt(lm, LM.mouthLeft)
  const mR = getPt(lm, LM.mouthRight)
  const lbO = getPt(lm, LM.lbOuter)
  const lbI = getPt(lm, LM.lbInner)
  const rbO = getPt(lm, LM.rbOuter)
  const rbI = getPt(lm, LM.rbInner)
  const fL = getPt(lm, LM.faceL)
  const fR = getPt(lm, LM.faceR)

  const leU = getPt(lm, LM.leUpper)
  const leLo = getPt(lm, LM.leLower)
  const reU = getPt(lm, LM.reUpper)
  const reLo = getPt(lm, LM.reLower)

  if (
    !leo ||
    !lei ||
    !reo ||
    !rei ||
    !mL ||
    !mR ||
    !lbO ||
    !lbI ||
    !rbO ||
    !rbI ||
    !fL ||
    !fR
  ) {
    return { ...DEFAULT_FACE_GEOMETRY }
  }

  const faceW = Math.max(0.04, dist(fL, fR))
  const leW = Math.max(0.01, dist(leo, lei))
  const reW = Math.max(0.01, dist(reo, rei))

  let eyeOpenLeft = 0.22
  let eyeOpenRight = 0.22
  if (leU && leLo) {
    eyeOpenLeft = (dist(leU, leLo) / leW + eyeOpenLeft) / 2
  }
  if (reU && reLo) {
    eyeOpenRight = (dist(reU, reLo) / reW + eyeOpenRight) / 2
  }

  const mouthW = dist(mL, mR)

  return {
    eyeSlantLeftDeg: angleDegHoriz(leo, lei),
    eyeSlantRightDeg: angleDegHoriz(rei, reo),
    eyeOpenLeft: Math.min(0.55, Math.max(0.08, eyeOpenLeft)),
    eyeOpenRight: Math.min(0.55, Math.max(0.08, eyeOpenRight)),
    mouthSlantDeg: angleDegHoriz(mL, mR),
    mouthWidthNorm: Math.min(0.75, Math.max(0.2, mouthW / faceW)),
    browSlantLeftDeg: angleDegHoriz(lbO, lbI),
    browSlantRightDeg: angleDegHoriz(rbI, rbO),
  }
}
