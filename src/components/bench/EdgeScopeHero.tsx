/*
 * src/components/bench/EdgeScopeHero.tsx
 *
 * The hero spectacle for the "Living CRT display" direction: an oscilloscope
 * that animates the central truth of the product — an equity/edge curve that
 * climbs in-sample (glowing ion phosphor) then behaves out-of-sample. Three
 * selectable examples (FAIL / PASS / MARGINAL) live in the matte bezel header;
 * switching one, or pressing replay, re-draws the trace.
 *
 * Matte instrument bezel, luminous screen. Glow + gradient + motion live on the
 * data (the signal), never on chrome. prefers-reduced-motion is respected on
 * auto-load (static curve); the draw still plays on explicit user action
 * (tab switch / replay), which is user-initiated and therefore allowed.
 * Illustrative data — computes nothing.
 */
import { useState, type ReactElement } from 'react';
import { useReducedMotion } from 'motion/react';
import { RotateCw } from 'lucide-react';

const W = 880;
const H = 360;
const BASE = 250; // y of the $0 baseline
const BOUNDARY = 0.64; // in-sample fraction (≈70/30 holdout)
const N = 72;

const ION = '#5ff3d6';

interface Example {
  readonly id: string;
  readonly tab: string;
  readonly peak: number; // in-sample high (smaller y = higher)
  readonly oosEnd: number; // out-of-sample terminal y
  readonly verdict: 'PASS' | 'FAIL' | 'MARGINAL';
  readonly inVal: string;
  readonly oosVal: string;
  readonly oosColor: string; // bright screen colour
  readonly oosGlow: string;
  readonly gradId: string;
}

const EXAMPLES: ReadonlyArray<Example> = [
  {
    id: 'fail',
    tab: 'FAIL',
    peak: 80,
    oosEnd: 328,
    verdict: 'FAIL',
    inVal: '+$42',
    oosVal: '−$11',
    oosColor: '#ff6457',
    oosGlow: 'rgba(255,90,77,0.6)',
    gradId: 'crtRedFill',
  },
  {
    id: 'pass',
    tab: 'PASS',
    peak: 122,
    oosEnd: 52,
    verdict: 'PASS',
    inVal: '+$31',
    oosVal: '+$24',
    oosColor: '#6fe39a',
    oosGlow: 'rgba(95,179,122,0.55)',
    gradId: 'crtGreenFill',
  },
  {
    id: 'thin',
    tab: 'MARGINAL',
    peak: 118,
    oosEnd: 234,
    verdict: 'MARGINAL',
    inVal: '+$28',
    oosVal: '+$3',
    oosColor: '#f4c257',
    oosGlow: 'rgba(205,161,60,0.5)',
    gradId: 'crtAmberFill',
  },
];

/** Deterministic 0–1 hash for a little authentic scope jitter. */
function jitter(i: number): number {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function buildPoints(peak: number, oosEnd: number): ReadonlyArray<readonly [number, number]> {
  const pts: Array<readonly [number, number]> = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = t * W;
    let y: number;
    if (t < BOUNDARY) {
      const p = t / BOUNDARY;
      y = BASE - (BASE - peak) * (1 - Math.pow(1 - p, 1.8));
      y += (jitter(i) - 0.5) * 9;
    } else {
      const p = (t - BOUNDARY) / (1 - BOUNDARY);
      y = peak + (oosEnd - peak) * Math.pow(p, 1.3);
      y += (jitter(i) - 0.5) * 15;
    }
    pts.push([x, Math.max(8, Math.min(H - 8, y))]);
  }
  return pts;
}

function toLine(pts: ReadonlyArray<readonly [number, number]>): string {
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
}
function toArea(pts: ReadonlyArray<readonly [number, number]>): string {
  const last = pts[pts.length - 1];
  const first = pts[0];
  return `${toLine(pts)} L${last[0].toFixed(1)} ${BASE} L${first[0].toFixed(1)} ${BASE} Z`;
}

const GRID_Y = [50, 110, 170, 230, 290];
const GRID_X = [110, 220, 330, 440, 550, 660, 770];
const BX = Math.floor(BOUNDARY * N) * (W / N);

export function EdgeScopeHero(): ReactElement {
  const reduce = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const [playId, setPlayId] = useState(0);
  const [interacted, setInteracted] = useState(false);

  const ex = EXAMPLES[idx];
  const animate = !reduce || interacted;

  const select = (i: number): void => {
    setIdx(i);
    setInteracted(true);
    setPlayId((p) => p + 1);
  };
  const replay = (): void => {
    setInteracted(true);
    setPlayId((p) => p + 1);
  };

  const pts = buildPoints(ex.peak, ex.oosEnd);
  const bIdx = Math.floor(BOUNDARY * N);
  const inPts = pts.slice(0, bIdx + 1);
  const oosPts = pts.slice(bIdx);
  const peakPt = inPts[inPts.length - 1];
  const endPt = pts[pts.length - 1];

  return (
    <figure
      className="m-0 overflow-hidden rounded-[6px]"
      style={{
        background: 'var(--bench-panel)',
        border: '1px solid var(--bench-bezel)',
        boxShadow: 'var(--bench-shadow)',
      }}
    >
      {/* matte bezel header — example tabs + replay (chrome stays calm) */}
      <figcaption
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5"
        style={{ borderBottom: '1px solid var(--bench-bezel)' }}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="bench-label" style={{ color: 'var(--bench-text)' }}>
            EDGE·SCOPE
          </span>
          <div className="flex items-center gap-1" role="tablist" aria-label="Example scenarios">
            {EXAMPLES.map((e, i) => (
              <button
                key={e.id}
                type="button"
                role="tab"
                aria-selected={i === idx}
                onClick={() => select(i)}
                className="bench-label px-1.5 pb-1 pt-0.5"
                style={{
                  color: i === idx ? 'var(--bench-text)' : 'var(--bench-text-faint)',
                  borderBottom: i === idx ? '2px solid var(--bench-ion)' : '2px solid transparent',
                }}
              >
                {e.tab}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={replay}
            aria-label="Replay animation"
            className="bench-cta inline-flex h-7 w-7 items-center justify-center rounded-[3px]"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span className="bench-label" style={{ color: 'var(--bench-text-faint)' }}>
            [ ESC-01 ]
          </span>
        </div>
      </figcaption>

      {/* the luminous screen */}
      <div className="crt-screen aspect-[880/360] w-full">
        <svg
          className="crt-svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Example ${ex.tab}: an equity curve, in-sample then out-of-sample. Walk-forward verdict ${ex.verdict}.`}
        >
          <defs>
            <linearGradient id="crtIonFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#46e6c8" stopOpacity="0.30" />
              <stop offset="1" stopColor="#46e6c8" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="crtRedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ff5a4d" stopOpacity="0.26" />
              <stop offset="1" stopColor="#ff5a4d" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="crtGreenFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5fb37a" stopOpacity="0.26" />
              <stop offset="1" stopColor="#5fb37a" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="crtAmberFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#cda13c" stopOpacity="0.24" />
              <stop offset="1" stopColor="#cda13c" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* graticule (static) */}
          <g className="crt-grid">
            {GRID_Y.map((y) => (
              <line key={`gy-${y}`} x1="0" y1={y} x2={W} y2={y} />
            ))}
            {GRID_X.map((x) => (
              <line key={`gx-${x}`} x1={x} y1="0" x2={x} y2={H} />
            ))}
          </g>
          <line className="crt-baseline" x1="0" y1={BASE} x2={W} y2={BASE} />
          <line className="crt-boundary" x1={BX} y1="0" x2={BX} y2={H} />

          {/* keyed group → remount restarts the draw on switch / replay */}
          <g key={playId} className={animate ? 'crt-animate' : undefined}>
            <path className="crt-area crt-area-in" d={toArea(inPts)} fill="url(#crtIonFill)" />
            <path className="crt-area crt-area-oos" d={toArea(oosPts)} fill={`url(#${ex.gradId})`} />

            <path className="crt-trace crt-trace-in" d={toLine(inPts)} pathLength={100} />
            <path
              className="crt-trace crt-trace-oos"
              d={toLine(oosPts)}
              pathLength={100}
              style={{
                stroke: ex.oosColor,
                filter: `drop-shadow(0 0 3px ${ex.oosColor}) drop-shadow(0 0 11px ${ex.oosGlow})`,
              }}
            />

            <circle className="crt-dot crt-dot-in" cx={peakPt[0]} cy={peakPt[1]} r="3.5" />
            <circle
              className="crt-dot crt-dot-oos"
              cx={endPt[0]}
              cy={endPt[1]}
              r="5"
              style={{ fill: ex.oosColor, color: ex.oosColor }}
            />
          </g>
        </svg>

        {/* HUD readouts — glow on the data, mono nomenclature */}
        <div className="pointer-events-none absolute inset-0 z-[5]">
          <div className="absolute left-4 top-4 sm:left-5 sm:top-5">
            <div className="bench-label" style={{ color: 'rgba(217,232,226,0.6)' }}>
              in-sample · backtest
            </div>
            <div
              className="bench-value text-2xl font-semibold sm:text-3xl"
              style={{ color: ION, textShadow: '0 0 14px rgba(70,230,200,0.55)' }}
            >
              {ex.inVal}
              <span className="bench-label" style={{ color: 'rgba(217,232,226,0.5)' }}>
                {' '}
                /trade
              </span>
            </div>
          </div>

          <div className="absolute right-4 top-4 sm:right-5 sm:top-5">
            <span
              className="bench-value text-[11px] font-semibold tracking-wider"
              style={{ color: ex.oosColor, textShadow: `0 0 12px ${ex.oosGlow}` }}
            >
              WALK-FORWARD · {ex.verdict}
            </span>
          </div>

          <div className="absolute bottom-4 right-4 text-right sm:bottom-5 sm:right-5">
            <div className="bench-label" style={{ color: 'rgba(217,232,226,0.6)' }}>
              out-of-sample · reality
            </div>
            <div
              className="bench-value text-3xl font-semibold leading-none sm:text-4xl"
              style={{ color: ex.oosColor, textShadow: `0 0 16px ${ex.oosGlow}` }}
            >
              {ex.oosVal}
              <span className="bench-label" style={{ color: 'rgba(217,232,226,0.5)' }}>
                {' '}
                /trade
              </span>
            </div>
          </div>

          <div
            className="bench-label absolute bottom-4 left-4 sm:bottom-5 sm:left-5"
            style={{ color: 'rgba(217,232,226,0.4)' }}
          >
            70 / 30 holdout
          </div>
        </div>
      </div>
    </figure>
  );
}
