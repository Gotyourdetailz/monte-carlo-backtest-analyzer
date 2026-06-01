/**
 * SplineHero — the decorative 3D backdrop for the marketing hero (Req 8 / B5).
 *
 * Renders EITHER the Spline scene OR the static brand-gradient fallback — never
 * both. The soft preference gates (reduced motion, slow network, explicit
 * opt-in) have been removed: whenever a scene URL is configured the scene is
 * shown and left animating. It still degrades to the fallback when:
 *   - no scene URL is configured (`SPLINE_SCENE_URL` empty),
 *   - WebGL is unavailable (the viewer cannot paint a canvas at all), or
 *   - the viewer runtime / scene fails to load at runtime.
 *
 * WebGL is the one remaining gate on purpose: it is a hard rendering capability,
 * not a preference. Without it the `<spline-viewer>` produces nothing, so the
 * brand gradient is a strictly better result than a blank box.
 *
 * The heavy `@splinetool/viewer` runtime is loaded with a dynamic `import()`, so
 * it is only fetched when the 3D layer is actually going to render. The layer is
 * purely decorative: `aria-hidden`, `pointer-events-none`, behind the hero text.
 *
 * Layering: this renders a `-z-10` backdrop, so it MUST be placed inside an
 * element that establishes its own stacking context (e.g. a parent with the
 * `isolate` utility). Otherwise the negative-z layer escapes to the root
 * stacking context and is painted behind any opaque ancestor background.
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
 * Decide synchronously (before first paint) whether the 3D layer is allowed.
 * Only hard requirements remain: a scene to load and a GPU to render it.
 */
function splineAllowed(): boolean {
  return Boolean(SPLINE_SCENE_URL) && hasWebGL();
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
