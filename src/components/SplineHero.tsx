/**
 * SplineHero — the decorative 3D backdrop for the marketing hero (Req 8 / B5).
 *
 * Renders EITHER the Spline scene OR the static brand-gradient fallback — never
 * both. It degrades to the fallback when any of these hold:
 *   - no scene URL is configured (`SPLINE_SCENE_URL` empty),
 *   - the user prefers reduced motion,
 *   - the connection is slow / data-saver is on (Network Information API < 3G),
 *   - WebGL is unavailable, or
 *   - the viewer runtime / scene fails to load at runtime.
 *
 * The heavy `@splinetool/viewer` runtime is loaded with a dynamic `import()`, so
 * it is only fetched when the 3D layer is actually going to render. The layer is
 * purely decorative: `aria-hidden`, `pointer-events-none`, behind the hero text.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { SPLINE_SCENE_URL } from '../config';

/** The static fallback backdrop — the brand radial-glow used hero-wide. */
const FALLBACK_STYLE: CSSProperties = {
  background:
    'radial-gradient(700px 360px at 80% 0%, rgba(88,166,255,0.08), transparent 60%), ' +
    'radial-gradient(620px 320px at 10% 30%, rgba(232,121,249,0.07), transparent 60%)',
};

/** Legibility scrim so the hero text stays readable over the 3D scene (token-based → adapts light/dark). */
const SCRIM_STYLE: CSSProperties = {
  background:
    'radial-gradient(1100px 460px at 50% 12%, transparent 0%, transparent 55%, ' +
    'color-mix(in srgb, var(--bg-primary) 35%, transparent) 100%), ' +
    'linear-gradient(180deg, transparent 62%, var(--bg-primary) 100%)',
};

interface NetworkInformation {
  effectiveType?: string;
  saveData?: boolean;
}
interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isSlowNetwork(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as NavigatorWithConnection).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  const et = conn.effectiveType;
  return et === 'slow-2g' || et === '2g';
}

function hasWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl') || canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

/**
 * Explicit opt-in to preview the 3D even when the reduced-motion / slow-network
 * preference gates would otherwise suppress it. Set via `?hero3d=1` in the URL
 * or `localStorage['mc-hero3d'] = '1'`. Does NOT override hard capability gates
 * (a configured scene + WebGL are still required).
 */
function isForced(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).has('hero3d')) return true;
    return window.localStorage?.getItem('mc-hero3d') === '1';
  } catch {
    return false;
  }
}

/** Decide synchronously (before first paint) whether the 3D layer is allowed. */
function splineAllowed(): boolean {
  // Hard requirements: a scene to load and a GPU to render it.
  if (!SPLINE_SCENE_URL || !hasWebGL()) return false;
  // Explicit preview opt-in bypasses the accessibility/preference gates only.
  if (isForced()) return true;
  // Default (accessible) behaviour: respect reduced-motion and slow networks.
  return !prefersReducedMotion() && !isSlowNetwork();
}

type Phase = 'spline' | 'fallback';

function FallbackLayer(): ReactElement {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
      style={FALLBACK_STYLE}
    />
  );
}

export function SplineHero(): ReactElement {
  const [phase, setPhase] = useState<Phase>(() => (splineAllowed() ? 'spline' : 'fallback'));
  const [moduleReady, setModuleReady] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

  // Lazily pull in the viewer runtime only when we intend to render 3D.
  useEffect(() => {
    if (phase !== 'spline') return;
    let cancelled = false;
    import('@splinetool/viewer')
      .then(() => {
        if (!cancelled) setModuleReady(true);
      })
      .catch(() => {
        if (!cancelled) setPhase('fallback');
      });
    return () => {
      cancelled = true;
    };
  }, [phase]);

  // Once mounted: fall back on an `error` event, or if the scene never paints a
  // canvas within a generous window (covers silent failures / blocked fetches).
  useEffect(() => {
    if (phase !== 'spline' || !moduleReady) return;
    const el = ref.current;
    if (!el) return;
    const fail = (): void => setPhase('fallback');
    el.addEventListener('error', fail);
    const timer = window.setTimeout(() => {
      const painted = Boolean(el.shadowRoot?.querySelector('canvas') || el.querySelector('canvas'));
      if (!painted) setPhase('fallback');
    }, 15000);
    return () => {
      el.removeEventListener('error', fail);
      window.clearTimeout(timer);
    };
  }, [phase, moduleReady]);

  // Fallback, or the brief window before the runtime is ready: show the static
  // backdrop only (never the scene and the fallback at once).
  if (phase === 'fallback' || !moduleReady) {
    return <FallbackLayer />;
  }

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <spline-viewer
        ref={ref}
        url={SPLINE_SCENE_URL}
        loading-anim-type="none"
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      <div className="absolute inset-0" style={SCRIM_STYLE} />
    </div>
  );
}
