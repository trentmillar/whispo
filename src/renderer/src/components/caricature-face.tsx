import type { FaceMirrorDetail } from "@renderer/hooks/use-emotion-mirror"

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function bs(detail: FaceMirrorDetail, name: string) {
  return detail.blendshapes[name] ?? 0
}

type Derived = {
  mouthCtlY: number
  /** 0 = closed line mouth, 1 = wide open (from jaw + lower lip blendshapes). */
  mouthOpen: number
  eyeRyL: number
  eyeRyR: number
  pupilDy: number
  leftBrowY: number
  rightBrowY: number
  browFurrow: number
  cheekOpacity: number
  headTilt: number
  eyeRotL: number
  eyeRotR: number
  mouthRot: number
  mouthW: number
  wrinkleLines: number
}

/** Puppet pose from blendshapes + landmark geometry (slants, openings). */
function derive(detail: FaceMirrorDetail): Derived {
  const g = detail.geometry
  const smile =
    bs(detail, "mouthSmileLeft") +
    bs(detail, "mouthSmileRight") +
    bs(detail, "mouthStretchLeft") * 0.35 +
    bs(detail, "mouthStretchRight") * 0.35
  const frown =
    bs(detail, "mouthFrownLeft") +
    bs(detail, "mouthFrownRight") +
    bs(detail, "mouthPressLeft") * 0.3
  const jawOpen = bs(detail, "jawOpen")
  const mouthLowerDown =
    bs(detail, "mouthLowerDownLeft") + bs(detail, "mouthLowerDownRight")
  const mouthOpen = clamp(
    jawOpen * 0.92 + mouthLowerDown * 0.42 + bs(detail, "mouthFunnel") * 0.15,
    0,
    1,
  )
  const sur =
    jawOpen + bs(detail, "eyeWideLeft") * 0.2 + bs(detail, "eyeWideRight") * 0.2
  const furrow =
    bs(detail, "browDownLeft") +
    bs(detail, "browDownRight") +
    bs(detail, "browInnerUp") * 0.4
  const squint =
    bs(detail, "eyeSquintLeft") +
    bs(detail, "eyeSquintRight") +
    bs(detail, "cheekSquintLeft") * 0.45 +
    bs(detail, "cheekSquintRight") * 0.45

  // Lip curve only (no jaw “surprise” here — jaw controls open-mouth mode separately).
  const lipCurve = smile - frown * 0.9
  // SVG y grows downward: a smile (∪) needs the control point *above* the corners (smaller y).
  // Keep jaw drop subtle so a smile doesn’t read as a frown arc.
  const mouthCtlY = 178 - lipCurve * 32 - jawOpen * 5 + frown * 6

  const openL = g.eyeOpenLeft
  const openR = g.eyeOpenRight
  const eyeRyL = clamp(11 + openL * 95 - squint * 14 - Math.abs(lipCurve) * 5, 9, 42)
  const eyeRyR = clamp(11 + openR * 95 - squint * 14 - Math.abs(lipCurve) * 5, 9, 42)

  const droop =
    bs(detail, "mouthFrownLeft") * 0.4 +
    bs(detail, "mouthFrownRight") * 0.4 +
    bs(detail, "browInnerUp") * 0.25
  const pupilDy = droop * 6 - lipCurve * 3 + furrow * 2.5

  const browBase = 64 + furrow * 18 + droop * 10 - sur * 10
  const leftBrowY = browBase + furrow * 3
  const rightBrowY = browBase + furrow * 3

  const cheekOpacity = clamp(smile * 0.55 + (1 - furrow) * 0.06, 0, 0.68)
  const headTilt = clamp(
    sur * -5 - furrow * 4 + droop * 3 + (g.mouthSlantDeg / 90) * 4,
    -14,
    14,
  )

  const eyeRotL = clamp(g.eyeSlantLeftDeg * 0.35, -18, 18)
  const eyeRotR = clamp(g.eyeSlantRightDeg * 0.35, -18, 18)
  const mouthRot = clamp(g.mouthSlantDeg * 0.4, -22, 22)
  const mouthW = clamp(58 + detail.geometry.mouthWidthNorm * 28, 48, 92)

  return {
    mouthCtlY: clamp(mouthCtlY, 138, 198),
    mouthOpen,
    eyeRyL,
    eyeRyR,
    pupilDy,
    leftBrowY,
    rightBrowY,
    browFurrow: furrow,
    cheekOpacity,
    headTilt,
    eyeRotL,
    eyeRotR,
    mouthRot,
    mouthW,
    wrinkleLines: detail.wrinkleProxy,
  }
}

type Props = {
  detail: FaceMirrorDetail
  className?: string
}

/**
 * Stylized caricature driven by MediaPipe blendshapes + landmark slant/opening metrics.
 */
export function CaricatureFace({ detail, className }: Props) {
  const m = derive(detail)
  const wr = m.wrinkleLines

  return (
    <svg
      role="img"
      aria-label="Caricature mirror of detected expression"
      viewBox="0 0 200 220"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="cf-skin" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffe8d4" />
          <stop offset="100%" stopColor="#e8b896" />
        </radialGradient>
        <filter id="cf-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" />
        </filter>
      </defs>

      <g transform={`rotate(${m.headTilt}, 100, 112)`}>
        <ellipse cx="28" cy="118" rx="14" ry="22" fill="url(#cf-skin)" stroke="#5c3d2e" strokeWidth="2.2" />
        <ellipse cx="172" cy="118" rx="14" ry="22" fill="url(#cf-skin)" stroke="#5c3d2e" strokeWidth="2.2" />

        <ellipse cx="100" cy="118" rx="76" ry="88" fill="url(#cf-skin)" stroke="#4a3224" strokeWidth="2.8" />

        {/* Forehead wrinkle proxy (blendshape tension, not real skin). */}
        {wr > 0.08 ? (
          <g opacity={clamp(wr * 0.9, 0.12, 0.55)}>
            <path
              d="M 58 52 Q 78 48 100 50 Q 122 48 142 52"
              fill="none"
              stroke="#6b5344"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            {wr > 0.22 ? (
              <path
                d="M 62 58 Q 82 54 100 56 Q 118 54 138 58"
                fill="none"
                stroke="#6b5344"
                strokeWidth="0.9"
                strokeLinecap="round"
                opacity="0.75"
              />
            ) : null}
          </g>
        ) : null}

        <ellipse
          cx="58"
          cy="138"
          rx="18"
          ry="11"
          fill="#f5a8a0"
          opacity={m.cheekOpacity}
        />
        <ellipse
          cx="142"
          cy="138"
          rx="18"
          ry="11"
          fill="#f5a8a0"
          opacity={m.cheekOpacity}
        />

        <path
          d={`M 48 ${m.leftBrowY} Q 68 ${m.leftBrowY - 6 - m.browFurrow * 9} 88 ${m.leftBrowY - 2}`}
          fill="none"
          stroke="#2a1a12"
          strokeWidth="5"
          strokeLinecap="round"
          filter="url(#cf-soft)"
        />
        <path
          d={`M 112 ${m.rightBrowY - 2} Q 132 ${m.rightBrowY - 6 - m.browFurrow * 9} 152 ${m.rightBrowY}`}
          fill="none"
          stroke="#2a1a12"
          strokeWidth="5"
          strokeLinecap="round"
          filter="url(#cf-soft)"
        />

        <g transform={`rotate(${m.eyeRotL}, 72, 108)`}>
          <ellipse cx="72" cy="108" rx="22" ry={m.eyeRyL} fill="#fff" stroke="#3d2914" strokeWidth="2.2" />
        </g>
        <g transform={`rotate(${m.eyeRotR}, 128, 108)`}>
          <ellipse cx="128" cy="108" rx="22" ry={m.eyeRyR} fill="#fff" stroke="#3d2914" strokeWidth="2.2" />
        </g>
        <circle cx="74" cy={108 + m.pupilDy} r="9" fill="#1a120c" />
        <circle cx="130" cy={108 + m.pupilDy} r="9" fill="#1a120c" />
        <circle cx="77" cy={105 + m.pupilDy} r="3" fill="#fff" opacity="0.55" />
        <circle cx="133" cy={105 + m.pupilDy} r="3" fill="#fff" opacity="0.55" />

        <path
          d="M 100 118 Q 92 142 100 152 Q 108 142 100 118"
          fill="none"
          stroke="#c49a7a"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.85"
        />

        <g transform={`rotate(${m.mouthRot}, 100, 178)`}>
          {/* Need real jaw drop for “open” mode — smiling often has small jawOpen; keep line smile otherwise. */}
          {m.mouthOpen > 0.22 ? (
            <>
              {/* Open mouth: outer lip + cavity + teeth band when jaw is clearly open */}
              <ellipse
                cx="100"
                cy={176 + m.mouthOpen * 10}
                rx={m.mouthW / 2 + m.mouthOpen * 5}
                ry={5 + m.mouthOpen * 34}
                fill="#4a1f2e"
                stroke="#6b2f3a"
                strokeWidth={clamp(5 - m.mouthOpen * 1.5, 3, 5)}
              />
              <ellipse
                cx="100"
                cy={178 + m.mouthOpen * 12}
                rx={m.mouthW * 0.38 + m.mouthOpen * 4}
                ry={2.5 + m.mouthOpen * 28}
                fill="#1f0c12"
                opacity="0.96"
              />
              {m.mouthOpen > 0.22 ? (
                <ellipse
                  cx="100"
                  cy={168 + m.mouthOpen * 6}
                  rx={clamp(m.mouthW * 0.22 + m.mouthOpen * 6, 10, 38)}
                  ry={2 + m.mouthOpen * 7}
                  fill="#eee8dc"
                  opacity={clamp(0.35 + m.mouthOpen * 0.55, 0.5, 0.95)}
                />
              ) : null}
            </>
          ) : (
            <>
              <path
                d={`M ${(200 - m.mouthW) / 2} 178 Q 100 ${m.mouthCtlY} ${(200 + m.mouthW) / 2} 178`}
                fill="none"
                stroke="#6b2f3a"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d={`M ${(200 - m.mouthW) / 2 + 4} 179 Q 100 ${m.mouthCtlY + 4} ${(200 + m.mouthW) / 2 - 4} 179`}
                fill="none"
                stroke="#a84858"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.45"
              />
            </>
          )}
        </g>
      </g>
    </svg>
  )
}
