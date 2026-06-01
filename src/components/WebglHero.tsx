/**
 * WebglHero — custom, self-hosted 3D WebGL decorative backdrop for the
 * marketing hero (replaces the rejected, CSP-relaxing Spline approach).
 *
 * This file is built incrementally across three tasks:
 *   - 5.1 (scaffold): the synchronous capability gate, the static
 *     brand-gradient Fallback_Layer, and the token-based legibility
 *     Scrim_Layer, all wired to the shared Hero_Contract.
 *   - 5.2 (this task): the dynamic `three` + `@react-three/fiber` import and the
 *     3D scene (equity-path ribbons + probability-density surface) that flips
 *     `painted`, plus theme-token colours re-read on theme change.
 *   - 5.3: the full animation lifecycle (visibility / intersection / reduced
 *     motion), viewport scaling/resize, and GPU resource disposal.
 *
 * Like the sibling heroes it is purely decorative and implements the
 * Hero_Contract: a `-z-10`, absolutely positioned, `aria-hidden`,
 * `pointer-events-none`, `overflow-hidden` backdrop placed inside the hero
 * `<section className="relative isolate ...">`. It is never an empty box — the
 * static brand-gradient Fallback_Layer backs the scene until the first 3D frame
 * paints (Req 11.4), and a missing WebGL context degrades to that same fallback
 * (Req 11.1 / 4.4).
 *
 * Security / privacy posture (Req 4, Req 5):
 *   - The WebGL runtime is pulled in only via a dynamic `import()`, and only
 *     after the synchronous WebGL capability gate passes, so nothing is fetched
 *     when the tier will not render (Req 12.2 / 12.3 / 12.4).
 *   - No third-party origin, no external font, no watermark, no network fetch:
 *     all geometry/colours are generated at runtime from the seeded simulation
 *     and the live theme tokens (Req 5.1–5.4). This file intentionally contains
 *     no remote URL literal.
 *   - three.js shader compilation submits GLSL strings to the GPU driver and
 *     uses no `eval`/`new Function` on the render path, so the existing CSP is
 *     sufficient with no relaxation (Req 4.1 / 4.6). Any CSP violation raised
 *     while loading/initialising the scene degrades to the Fallback_Layer
 *     (Req 4.5), as does an import failure (Req 11.2) or a scene render error
 *     (Req 11.3).
 *
 * Layering: this renders a `-z-10` backdrop, so (like the sibling heroes) it
 * MUST live inside an element that establishes its own stacking context (a
 * parent with the `isolate` utility) or the negative-z layer escapes behind
 * ancestor backgrounds.
 */
import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { FALLBACK_STYLE, SCRIM_STYLE, readToken } from './_shared/heroChrome';
import { clampDpr, resolvePathCount, SMALL_SCREEN_THRESHOLD } from './webglHeroHelpers';
import { createHeroLifecycle, type IntersectionObserverLike } from './webglHeroLifecycle';
import { generateHeroPaths, type HeroSimResult } from '../heroSimPaths';

// ---------------------------------------------------------------------------
// Dynamic-runtime types (erased at build time)
//
// The WebGL runtime is referenced as *types only* at module scope (`typeof
// import(...)` / `import(...).T` are fully erased by the compiler and emit no
// runtime import). The single real, lazy `import('three')` /
// `import('@react-three/fiber')` lives inside `loadWebglRuntime()` below, so
// the heavy bundle is never on the critical path (Req 12.2 / 12.4).
// ---------------------------------------------------------------------------
type ThreeModule = typeof import('three');
type R3FModule = typeof import('@react-three/fiber');
type ThreeGroup = import('three').Group;
type ThreeBufferAttribute = import('three').BufferAttribute;

/**
 * The slice of the react-three-fiber root state we capture in `onCreated` to
 * drive the imperative lifecycle (task 5.3): pausing/resuming the frameloop,
 * requesting a single static frame, resyncing the render target on resize, and
 * disposing the renderer on unmount. Typed structurally so this file needs no
 * value import of the r3f types.
 */
interface R3FRootHandle {
  /** The WebGL renderer; disposed on unmount (Req 9.1). */
  gl: { dispose?: () => void; forceContextLoss?: () => void };
  /** Flag the canvas to paint a single frame on demand (Req 7.4, 10.4). */
  invalidate: (frames?: number) => void;
  /** Resync the render target dimensions to the container (Req 10.4). */
  setSize: (width: number, height: number) => void;
  /** Re-clamp the device pixel ratio (Req 10.3). */
  setDpr: (dpr: number) => void;
  /** Switch the render-loop mode (used to halt the loop on teardown, Req 9.2). */
  setFrameloop?: (frameloop: 'always' | 'demand' | 'never') => void;
}

/** The r3f frameloop mode: `'always'` runs the loop, `'demand'` paints on demand only. */
type FrameloopMode = 'always' | 'demand';

/** The successfully-loaded WebGL runtime modules. */
interface WebglRuntime {
  THREE: ThreeModule;
  R3F: R3FModule;
}

export interface WebglHeroProps {
  /**
   * Whether this hero is the active hero chosen by the Hero_Ladder. Gates the
   * Scrim_Layer: the scrim is drawn over the scene only while active
   * (Req 2.5 / 2.6). Defaults to `false`.
   */
  active?: boolean;
  /**
   * Optional override seed for the deterministic path simulation; when omitted
   * the scene uses a fixed brand seed for a stable look (Req 13.1).
   */
  seed?: number;
}

/**
 * Fixed brand seed used when the caller does not override it, so the hero has a
 * stable, reproducible look across reloads (mirrors the engine's seeded-PRNG
 * ethos, Req 13.1).
 */
const DEFAULT_HERO_SEED = 20240517;

/** Number of simulated time steps (T); each path has T+1 points. */
const HERO_STEPS = 96;
/** Number of density buckets (rows) in the outcome surface grid. */
const HERO_BUCKETS = 28;

// --- Scene layout constants (render-side geometry mapping) -----------------
const X_SPAN = 11; // world width across the full time axis
const Y_SPAN = 3.2; // world height the normalised value range maps onto
const Z_RIBBON = 2.6; // depth the equity ribbons fan across
const Z_SURFACE = 4.0; // depth the density surface spans (bucket axis)
const SURFACE_BASE_Y = -2.4; // vertical offset placing the surface below the ribbons
const SURFACE_HEIGHT = 7.5; // how tall the density peaks rise
const RIPPLE_AMPLITUDE = 0.06; // gentle, continuous surface ripple (no hard cut, Req 1.6)

// ---------------------------------------------------------------------------
// Module-level lazy runtime cache (Req 12.5)
//
// The first mount that needs the runtime kicks off the dynamic import and
// memoises the *success* promise at module scope, so a later remount reuses the
// in-memory module instead of fetching again. A rejected import clears the
// cache so a subsequent mount can retry (while the current mount degrades to
// the Fallback_Layer).
// ---------------------------------------------------------------------------
let runtimePromise: Promise<WebglRuntime> | null = null;

function loadWebglRuntime(): Promise<WebglRuntime> {
  if (runtimePromise) return runtimePromise;
  const pending = Promise.all([import('three'), import('@react-three/fiber')]).then(
    ([THREE, R3F]) => ({ THREE, R3F }),
  );
  // On failure, evict the cached promise so a future mount can retry.
  pending.catch(() => {
    if (runtimePromise === pending) runtimePromise = null;
  });
  runtimePromise = pending;
  return pending;
}

/**
 * True when a WebGL / WebGL2 rendering context can be created (Req 11.1).
 *
 * Synchronous and side-effect-free: it creates a throwaway canvas and probes
 * for a context, returning `false` when the DOM is unavailable (SSR / tests) or
 * the probe throws. This is the hard capability gate decided before first paint
 * so the component never flashes an empty box, and it is the precondition that
 * gates the dynamic runtime import (Req 12.2 / 12.3).
 */
function hasWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl') ||
        canvas.getContext('webgl2') ||
        canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

/** The brand-accent colours the scene reads from the live theme tokens. */
interface SceneColors {
  blue: string;
  purple: string;
  magenta: string;
}

/**
 * Read the scene's accent colours from the live theme tokens, falling back to
 * the documented accent hex values when a token is absent or blank (Req 2.1 /
 * 2.2). Re-invoked on theme change so the scene tracks light/dark (Req 2.3).
 */
function readSceneColors(): SceneColors {
  return {
    blue: readToken('--accent-blue', '#58a6ff'),
    purple: readToken('--accent-purple', '#d2a8ff'),
    magenta: readToken('--accent-magenta', '#e879f9'),
  };
}

/**
 * The standalone static brand-gradient fallback backdrop. Used both as the
 * terminal state when WebGL is unavailable (Req 11.1 / 4.4) or the runtime
 * cannot load / the scene errors (Req 11.2 / 11.3 / 4.5), and as the
 * legibility-preserving degradation when the Scrim_Layer cannot render
 * (Req 2.7).
 */
function FallbackLayer(): ReactElement {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
      style={FALLBACK_STYLE}
    />
  );
}

/**
 * Build the token-based legibility Scrim_Layer. The caller wraps this in a
 * guard so that, if deriving/rendering the scrim ever fails, the hero degrades
 * to the static Fallback_Layer to keep hero text legible (Req 2.7).
 */
function buildScrim(): ReactElement {
  return <div className="absolute inset-0" style={SCRIM_STYLE} />;
}

// ---------------------------------------------------------------------------
// Scene geometry construction (pure, given the THREE module)
// ---------------------------------------------------------------------------

/** A built scene graph plus an optional per-frame ripple updater and disposer. */
interface HeroSceneGraph {
  group: ThreeGroup;
  /** Advance the continuous density-surface ripple (Req 1.6). */
  ripple: ((time: number) => void) | null;
  /** Release every geometry/material this graph created. */
  dispose: () => void;
}

/**
 * Build the full 3D scene graph from a deterministic {@link HeroSimResult}
 * (Req 1.1–1.4):
 *   - many faint equity-path ribbons fanning from the common origin in depth,
 *   - an emphasised median path (bright, fattened) and a VaR/CVaR tail band
 *     (a translucent filled strip) (Req 1.3),
 *   - a probability-density outcome surface (a vertex-coloured grid mesh whose
 *     height tracks the path-outcome density) (Req 1.4).
 *
 * Colours come from the live theme tokens (Req 2.1). All materials are unlit
 * (`*BasicMaterial`) so the scene needs no lights and stays deterministic; the
 * perspective camera (configured on the `<Canvas>`) supplies the depth so
 * nearer geometry appears larger (Req 1.2).
 */
function buildHeroSceneGraph(
  THREE: ThreeModule,
  sim: HeroSimResult,
  colors: SceneColors,
  renderPathCount: number,
): HeroSceneGraph {
  const group = new THREE.Group();
  group.rotation.x = -0.16; // slight tilt so the surface reads with depth

  const steps = sim.params.steps; // T (>= 1, guaranteed by resolveHeroParams)
  const pointCount = steps + 1; // T + 1 points per path
  const { min, max } = sim.density;
  const mid = (min + max) / 2;
  const range = max > min ? max - min : 1;

  const xAt = (t: number): number => (t / steps - 0.5) * X_SPAN;
  const yAt = (v: number): number => ((v - mid) / range) * Y_SPAN;

  // --- 1. Ordinary equity ribbons (faint, brand-blue) ----------------------
  const ribbonCount = Math.min(renderPathCount, sim.paths.length);
  const ribbonMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(colors.blue),
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  for (let i = 0; i < ribbonCount; i++) {
    const path = sim.paths[i];
    const positions = new Float32Array(pointCount * 3);
    // Fan factor: 0 at the origin (every path shares it) widening toward the end.
    const fan = ribbonCount > 1 ? (i / (ribbonCount - 1) - 0.5) * Z_RIBBON : 0;
    for (let t = 0; t < pointCount; t++) {
      positions[t * 3] = xAt(t);
      positions[t * 3 + 1] = yAt(path[t]);
      positions[t * 3 + 2] = fan * (t / steps);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    group.add(new THREE.Line(geometry, ribbonMat));
  }

  // --- 2. VaR/CVaR tail band (emphasised translucent strip, Req 1.3) -------
  const bandPositions = new Float32Array(pointCount * 2 * 3);
  for (let t = 0; t < pointCount; t++) {
    const x = xAt(t);
    const yVar = yAt(sim.summary.varBand[t]);
    const yCvar = yAt(sim.summary.cvarBand[t]);
    const v0 = t * 2 * 3;
    bandPositions[v0] = x;
    bandPositions[v0 + 1] = yVar;
    bandPositions[v0 + 2] = 0.02;
    bandPositions[v0 + 3] = x;
    bandPositions[v0 + 4] = yCvar;
    bandPositions[v0 + 5] = 0.02;
  }
  const bandIndices: number[] = [];
  for (let t = 0; t < pointCount - 1; t++) {
    const a = t * 2; // var @ t
    const b = t * 2 + 1; // cvar @ t
    const c = (t + 1) * 2; // var @ t+1
    const d = (t + 1) * 2 + 1; // cvar @ t+1
    bandIndices.push(a, c, b, b, c, d);
  }
  const bandGeometry = new THREE.BufferGeometry();
  bandGeometry.setAttribute('position', new THREE.BufferAttribute(bandPositions, 3));
  bandGeometry.setIndex(bandIndices);
  const bandMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colors.magenta),
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  group.add(new THREE.Mesh(bandGeometry, bandMat));

  // --- 3. Median path (emphasised: bright, fattened via stacked lines) -----
  const medianPositions = new Float32Array(pointCount * 3);
  for (let t = 0; t < pointCount; t++) {
    medianPositions[t * 3] = xAt(t);
    medianPositions[t * 3 + 1] = yAt(sim.summary.median[t]);
    medianPositions[t * 3 + 2] = 0.06; // sit in front of the ordinary ribbons
  }
  const medianGeometry = new THREE.BufferGeometry();
  medianGeometry.setAttribute('position', new THREE.BufferAttribute(medianPositions, 3));
  const medianMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(colors.purple),
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  // WebGL line width is driver-clamped to 1px, so fake thickness by stacking a
  // few slightly y-offset copies of the same geometry/material.
  for (const dy of [-0.02, 0, 0.02]) {
    const line = new THREE.Line(medianGeometry, medianMat);
    line.position.y = dy;
    group.add(line);
  }

  // --- 4. Probability-density outcome surface (Req 1.4) --------------------
  const buckets = sim.density.buckets;
  const grid = sim.density.density;
  let maxDensity = 0;
  for (let t = 0; t < pointCount; t++) {
    for (let b = 0; b < buckets; b++) {
      if (grid[t][b] > maxDensity) maxDensity = grid[t][b];
    }
  }
  const densityScale = maxDensity > 0 ? 1 / maxDensity : 0;

  const vertCount = pointCount * buckets;
  const surfPositions = new Float32Array(vertCount * 3);
  const surfColors = new Float32Array(vertCount * 3);
  const surfBaseY = new Float32Array(vertCount);
  const surfPhase = new Float32Array(vertCount); // spatial phase for the ripple
  const cLow = new THREE.Color(colors.blue);
  const cHigh = new THREE.Color(colors.magenta);
  const tmpColor = new THREE.Color();
  for (let t = 0; t < pointCount; t++) {
    const x = xAt(t);
    for (let b = 0; b < buckets; b++) {
      const k = t * buckets + b;
      const z = buckets > 1 ? (b / (buckets - 1) - 0.5) * Z_SURFACE : 0;
      const hNorm = grid[t][b] * densityScale; // 0..1
      const y = SURFACE_BASE_Y + hNorm * SURFACE_HEIGHT;
      surfPositions[k * 3] = x;
      surfPositions[k * 3 + 1] = y;
      surfPositions[k * 3 + 2] = z;
      surfBaseY[k] = y;
      surfPhase[k] = x * 0.7 + z * 0.55;
      tmpColor.copy(cLow).lerp(cHigh, hNorm);
      surfColors[k * 3] = tmpColor.r;
      surfColors[k * 3 + 1] = tmpColor.g;
      surfColors[k * 3 + 2] = tmpColor.b;
    }
  }
  const surfIndices: number[] = [];
  for (let t = 0; t < pointCount - 1; t++) {
    for (let b = 0; b < buckets - 1; b++) {
      const a = t * buckets + b;
      const c = (t + 1) * buckets + b;
      const e = t * buckets + (b + 1);
      const f = (t + 1) * buckets + (b + 1);
      surfIndices.push(a, c, e, e, c, f);
    }
  }
  const surfaceGeometry = new THREE.BufferGeometry();
  surfaceGeometry.setAttribute('position', new THREE.BufferAttribute(surfPositions, 3));
  surfaceGeometry.setAttribute('color', new THREE.BufferAttribute(surfColors, 3));
  surfaceGeometry.setIndex(surfIndices);
  const surfaceMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    wireframe: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  group.add(new THREE.Mesh(surfaceGeometry, surfaceMat));

  // Continuous ripple: a smooth, looping sine wave with no hard reset (Req 1.6).
  const surfPosAttr = surfaceGeometry.getAttribute('position') as ThreeBufferAttribute;
  const surfArray = surfPosAttr.array as Float32Array;
  const ripple = (time: number): void => {
    for (let k = 0; k < vertCount; k++) {
      surfArray[k * 3 + 1] = surfBaseY[k] + Math.sin(time * 1.05 + surfPhase[k]) * RIPPLE_AMPLITUDE;
    }
    surfPosAttr.needsUpdate = true;
  };

  return { group, ripple, dispose: () => disposeObject3D(group) };
}

/** Structural view of three objects that own disposable GPU resources. */
type Disposable = { dispose?: () => void };
interface GeoMatHolder {
  geometry?: Disposable;
  material?: Disposable | Disposable[];
}

/**
 * Dispose every (deduplicated) geometry and material reachable from `root`.
 * `<primitive>` objects are not owned by react-three-fiber, so the scene we
 * build by hand must release its own GPU resources when it is replaced (e.g. on
 * a theme-driven rebuild). The full renderer/listener/RAF lifecycle is owned by
 * task 5.3; this only frees the geometries/materials this module created.
 */
function disposeObject3D(root: ThreeGroup): void {
  const geometries = new Set<Disposable>();
  const materials = new Set<Disposable>();
  root.traverse((object) => {
    const holder = object as unknown as GeoMatHolder;
    if (holder.geometry) geometries.add(holder.geometry);
    const material = holder.material;
    if (Array.isArray(material)) material.forEach((m) => materials.add(m));
    else if (material) materials.add(material);
  });
  // Each dispose is individually guarded so one throwing resource (e.g. on a
  // lost WebGL context) cannot prevent the rest from being released or block
  // the unmount (Req 9.4).
  geometries.forEach((g) => {
    try {
      g.dispose?.();
    } catch {
      /* swallow — keep disposing the remaining resources */
    }
  });
  materials.forEach((m) => {
    try {
      m.dispose?.();
    } catch {
      /* swallow — keep disposing the remaining resources */
    }
  });
}

// ---------------------------------------------------------------------------
// Scene error boundary
// ---------------------------------------------------------------------------

interface SceneErrorBoundaryProps {
  onError: () => void;
  children: ReactNode;
}

/**
 * Catches render/initialisation errors thrown inside the react-three-fiber
 * subtree (including CSP-triggered failures) and reports them so the host can
 * degrade permanently to the Fallback_Layer (Req 11.3 / 4.5).
 */
class SceneErrorBoundary extends Component<SceneErrorBoundaryProps, { failed: boolean }> {
  constructor(props: SceneErrorBoundaryProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Scene component (runs inside the react-three-fiber <Canvas>)
// ---------------------------------------------------------------------------

interface HeroSceneProps {
  three: ThreeModule;
  r3f: R3FModule;
  sim: HeroSimResult;
  colors: SceneColors;
  renderPathCount: number;
  /** Called once, after the first frame has been produced (Req 11.4). */
  onPainted: () => void;
}

/**
 * The react-three-fiber scene body. Builds the scene graph from the simulation
 * + theme colours, aims the perspective camera at the origin, runs a gentle
 * continuous animation (so the motion loops without a perceptible hard cut,
 * Req 1.6), and flips `painted` once the first frame is produced (Req 11.4).
 *
 * NOTE: the animation here is intentionally minimal — task 5.3 gates it behind
 * `shouldAnimate` (reduced motion / visibility / intersection) and owns the
 * renderer/RAF/listener disposal.
 */
function HeroScene({
  three,
  r3f,
  sim,
  colors,
  renderPathCount,
  onPainted,
}: HeroSceneProps): ReactElement {
  const { useFrame, useThree } = r3f;
  const camera = useThree((state) => state.camera);

  const graph = useMemo(
    () => buildHeroSceneGraph(three, sim, colors, renderPathCount),
    [three, sim, colors, renderPathCount],
  );

  // Aim the perspective camera at the scene origin so the ribbons and the
  // surface below them are framed with depth (Req 1.2).
  useEffect(() => {
    camera.lookAt(0, 0, 0);
  }, [camera]);

  // Release the previous graph's GPU resources when it is replaced or unmounts.
  useEffect(() => () => graph.dispose(), [graph]);

  const paintedOnce = useRef(false);
  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    // Gentle, continuous oscillation — wraps smoothly, never hard-cuts (Req 1.6).
    graph.group.rotation.y = Math.sin(time * 0.12) * 0.22;
    graph.ripple?.(time);
    if (!paintedOnce.current) {
      paintedOnce.current = true;
      onPainted();
    }
  });

  return <primitive object={graph.group} />;
}

export function WebglHero({ active = false, seed }: WebglHeroProps): ReactElement {
  // Synchronous, pre-paint capability gate (Req 4.4 / 11.1): decided once so the
  // very first render already reflects WebGL availability and never flashes an
  // empty container — and so the dynamic runtime import is never started when
  // WebGL is unavailable (Req 12.2).
  const [webglAvailable] = useState(hasWebGL);

  // Flipped to `true` by the scene once it paints its first frame (Req 11.4).
  const [painted, setPainted] = useState(false);

  // Set permanently when the runtime import fails (Req 11.2), the scene throws
  // (Req 11.3), or a CSP violation is raised during load (Req 4.5).
  const [failed, setFailed] = useState(false);

  // The lazily-loaded WebGL runtime (null until imported).
  const [runtime, setRuntime] = useState<WebglRuntime | null>(null);

  // Live theme-token colours, re-read whenever the active theme changes (Req 2.3).
  const [colors, setColors] = useState<SceneColors>(readSceneColors);

  // Root container ref — the lifecycle observers (task 5.3) attach to this.
  const containerRef = useRef<HTMLDivElement | null>(null);

  // The react-three-fiber root handle, captured in `onCreated`. Used by the
  // lifecycle to pause/resume the loop, request a static frame, resync the
  // render target on resize, and dispose the renderer on unmount (task 5.3).
  const rootHandleRef = useRef<R3FRootHandle | null>(null);

  // Flipped true once `onCreated` has captured the root handle, so the
  // lifecycle effect only wires up after the renderer exists.
  const [rootReady, setRootReady] = useState(false);

  // The r3f frameloop mode driven by `shouldAnimate`: `'always'` runs the loop;
  // `'demand'` paints only on explicit `invalidate()` (a single static frame),
  // so a perpetual loop is never started under reduced motion / when hidden /
  // when offscreen (Req 7.1, 8.1, 8.3, constraint C6). Starts in `'demand'` so
  // nothing animates until the lifecycle has decided.
  const [frameloopMode, setFrameloopMode] = useState<FrameloopMode>('demand');

  const handlePainted = useCallback(() => setPainted(true), []);

  const handleCreated = useCallback((state: R3FRootHandle) => {
    rootHandleRef.current = state;
    setRootReady(true);
  }, []);

  // Resolve the render budget from the current viewport width (Req 10.1, 10.2);
  // re-resolved on resize by the lifecycle below. `resolvePathCount` clamps to
  // [1, MAX_PATHS] for any input.
  const [renderPathCount, setRenderPathCount] = useState(() =>
    resolvePathCount(typeof window !== 'undefined' ? window.innerWidth : SMALL_SCREEN_THRESHOLD),
  );

  // Deterministic simulation that drives the geometry (Req 13.1). Cheap, and
  // computed unconditionally to keep hook order stable; only consumed when the
  // scene actually renders.
  const sim = useMemo(
    () =>
      generateHeroPaths({
        seed: seed ?? DEFAULT_HERO_SEED,
        pathCount: renderPathCount,
        steps: HERO_STEPS,
        densityBuckets: HERO_BUCKETS,
        drift: 0.06,
        volatility: 0.9,
        tailProbability: 0.05,
      }),
    [seed, renderPathCount],
  );

  // Lazy-load the WebGL runtime once WebGL is confirmed available (Req 12.2 /
  // 12.3); reuse the cached in-memory module on remount (Req 12.5). An import
  // rejection degrades permanently to the Fallback_Layer (Req 11.2 / 4.5).
  useEffect(() => {
    if (!webglAvailable || failed) return;
    let alive = true;
    loadWebglRuntime()
      .then((loaded) => {
        if (alive) setRuntime(loaded);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [webglAvailable, failed]);

  // While loading/initialising (before the first frame paints), a CSP violation
  // means the runtime cannot render under the policy → degrade permanently to
  // the Fallback_Layer (Req 4.5). Once painted the hero has proven it works
  // under the CSP, so later unrelated violations are ignored.
  useEffect(() => {
    if (!webglAvailable || failed || painted) return;
    if (typeof document === 'undefined') return;
    const onViolation = (): void => setFailed(true);
    document.addEventListener('securitypolicyviolation', onViolation);
    return () => document.removeEventListener('securitypolicyviolation', onViolation);
  }, [webglAvailable, failed, painted]);

  // Re-read the accent colours whenever the active theme changes. The theme is
  // applied via the `data-theme` attribute on <html>, so observe it (Req 2.3).
  useEffect(() => {
    if (!webglAvailable) return;
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    setColors(readSceneColors());
    const observer = new MutationObserver(() => setColors(readSceneColors()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, [webglAvailable]);

  // ---------------------------------------------------------------------------
  // Animation lifecycle, scaling, and disposal (task 5.3, Req 7/8/9/10)
  //
  // Wired only once the r3f root exists (`rootReady`). A single dependency-
  // injected controller (`createHeroLifecycle`) derives `shouldAnimate` from
  // reduced-motion + `document.hidden` + `IntersectionObserver`, flips the
  // frameloop between `'always'` (run) and `'demand'` (pause — paint only on
  // request), holds a static frame under reduced motion (Req 7.4), re-resolves
  // the render budget / re-clamps the dpr / resyncs the render target on resize
  // (Req 10.1/10.3/10.4), and on unmount cancels the pending frame, disposes
  // the renderer, and removes EVERY listener/observer (Req 9.1–9.4).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!webglAvailable || failed || !rootReady) return;
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const container = containerRef.current;

    const motionQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    // Build an IntersectionObserver over the hero container (Req 8.3/8.4). When
    // unavailable, the section is treated as always on-screen (observer = null).
    const createIntersectionObserver =
      typeof IntersectionObserver !== 'undefined' && container
        ? (onChange: (intersecting: boolean) => void): IntersectionObserverLike => {
            const io = new IntersectionObserver(
              (entries) => {
                const entry = entries[entries.length - 1];
                if (entry) onChange(entry.isIntersecting);
              },
              { threshold: 0 },
            );
            io.observe(container);
            return io;
          }
        : null;

    // Resync the renderer to the container's current size and the clamped dpr
    // (Req 10.3/10.4), then re-resolve the responsive path budget (Req 10.1).
    const applyResize = (): void => {
      const handle = rootHandleRef.current;
      if (handle && container) {
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (width > 0 && height > 0) {
          handle.setDpr(clampDpr(window.devicePixelRatio || 1));
          handle.setSize(width, height);
        }
      }
      setRenderPathCount(resolvePathCount(window.innerWidth));
    };

    const lifecycle = createHeroLifecycle({
      documentTarget: document,
      isDocumentHidden: () => document.hidden,
      windowTarget: window,
      motionQuery,
      createIntersectionObserver,
      onAnimateChange: (animate) => setFrameloopMode(animate ? 'always' : 'demand'),
      // Paint exactly one frame while paused-but-visible under reduced motion so
      // the scene is held static rather than blank (Req 7.2, 7.4).
      requestStaticFrame: () => rootHandleRef.current?.invalidate(),
      onResize: applyResize,
      // Halt the loop and release the pending frame on teardown (Req 9.2).
      cancelFrame: () => rootHandleRef.current?.setFrameloop?.('never'),
      // Dispose the renderer (the hand-built scene graph's geometries/materials
      // are disposed by HeroScene's own cleanup). Guarded by the controller so a
      // throwing dispose still completes unmount (Req 9.1, 9.4).
      disposeResources: () => {
        const handle = rootHandleRef.current;
        handle?.gl.dispose?.();
        handle?.gl.forceContextLoss?.();
      },
    });

    return () => lifecycle.dispose();
  }, [webglAvailable, failed, rootReady]);

  // No WebGL context at all → static brand fallback (Req 11.1 / 4.4); the
  // dynamic runtime import is never started.
  if (!webglAvailable) {
    return <FallbackLayer />;
  }

  // Import failed / scene errored / CSP violation → permanent fallback
  // (Req 11.2 / 11.3 / 4.5).
  if (failed) {
    return <FallbackLayer />;
  }

  // Scrim_Layer: drawn over the scene only while this hero is the active hero
  // (Req 2.5 / 2.6). Guard construction so a scrim failure degrades to the
  // static Fallback_Layer rather than leaving the hero text illegible (Req 2.7).
  let scrim: ReactElement | null = null;
  if (active) {
    try {
      scrim = buildScrim();
    } catch {
      return <FallbackLayer />;
    }
  }

  const Canvas = runtime?.R3F.Canvas;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* Base layer: the static brand gradient. It backs the backdrop so the box
          is never empty, and the 3D scene paints over it, swapping it out only
          once `painted` becomes true (Req 11.4). */}
      {!painted ? <div className="absolute inset-0" style={FALLBACK_STYLE} /> : null}

      {/* 3D scene: rendered once the runtime has loaded. A render/init error in
          the subtree (incl. CSP failures) is caught and degrades to the
          permanent Fallback_Layer via `setFailed` (Req 11.3 / 4.5). */}
      {runtime && Canvas ? (
        <Canvas
          className="absolute inset-0"
          style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
          dpr={clampDpr(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)}
          camera={{ fov: 42, position: [0, 2.6, 10], near: 0.1, far: 100 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
          // The loop is gated by `shouldAnimate` (via the lifecycle): `'always'`
          // runs it, `'demand'` paints only on `invalidate()` — so a perpetual
          // loop never runs under reduced motion / hidden / offscreen (Req 7.1,
          // 8.1, 8.3, constraint C6).
          frameloop={frameloopMode}
          onCreated={handleCreated}
        >
          <SceneErrorBoundary onError={() => setFailed(true)}>
            <HeroScene
              three={runtime.THREE}
              r3f={runtime.R3F}
              sim={sim}
              colors={colors}
              renderPathCount={renderPathCount}
              onPainted={handlePainted}
            />
          </SceneErrorBoundary>
        </Canvas>
      ) : null}

      {/* Legibility scrim (token-based, light/dark aware) — present only when
          this hero is active and the scrim was built successfully. */}
      {scrim}
    </div>
  );
}
