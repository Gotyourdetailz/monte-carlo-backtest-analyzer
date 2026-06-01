/**
 * VideoHero — the dark-theme marketing hero backdrop: a looping Monte-Carlo
 * simulation clip (brand-coloured) processed for the web (seamless ping-pong
 * loop, WebM + MP4, muted, no audio track, no visible watermark).
 *
 * Behaviour parity with the other backdrops:
 *   - purely decorative: `aria-hidden`, `pointer-events-none`, behind the text;
 *   - under `prefers-reduced-motion` it renders the POSTER STILL only (no
 *     `<video>`, no playback) — honouring constraint C6 (no perpetual
 *     animation);
 *   - degrades to the static brand-gradient fallback if the video errors or the
 *     format is unsupported.
 *
 * Layering: renders a `-z-10` backdrop, so (like the other hero layers) it MUST
 * live inside an element that establishes a stacking context (e.g. a parent
 * with the `isolate` utility) or the negative-z layer escapes behind ancestor
 * backgrounds. Files live in `public/hero/` and are referenced from the web
 * root.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';

const POSTER = '/hero/mc-poster.jpg';
const SRC_WEBM = '/hero/mc-loop.webm';
const SRC_MP4 = '/hero/mc-loop.mp4';

/** The static fallback backdrop — the brand radial-glow used hero-wide. */
const FALLBACK_STYLE: CSSProperties = {
  background:
    'radial-gradient(700px 360px at 80% 0%, rgba(88,166,255,0.08), transparent 60%), ' +
    'radial-gradient(620px 320px at 10% 30%, rgba(232,121,249,0.07), transparent 60%)',
};

/**
 * Legibility scrim — the clip is busiest through the centre band where the
 * headline and CTA sit, so this darkens the centre and fades the lower edge to
 * the page background. Token-based → tracks the theme.
 */
const SCRIM_STYLE: CSSProperties = {
  background:
    'radial-gradient(1200px 520px at 50% 38%, color-mix(in srgb, var(--bg-primary) 58%, transparent), transparent 70%), ' +
    'linear-gradient(180deg, color-mix(in srgb, var(--bg-primary) 45%, transparent) 0%, transparent 28%, transparent 58%, var(--bg-primary) 100%)',
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function FallbackLayer(): ReactElement {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
      style={FALLBACK_STYLE}
    />
  );
}

export function VideoHero(): ReactElement {
  const [reduce] = useState(prefersReducedMotion);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Muted + playsInline autoplay is permitted, but kick playback explicitly in
  // case a browser declines the autoplay attribute; on failure we keep the
  // poster rather than erroring.
  useEffect(() => {
    if (reduce || failed) return;
    const v = videoRef.current;
    if (!v) return;
    const p = v.play?.();
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
  }, [reduce, failed]);

  if (failed) return <FallbackLayer />;

  // Reduced motion → poster still only, no playback (constraint C6).
  if (reduce) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${POSTER})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0" style={SCRIM_STYLE} />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster={POSTER}
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      >
        <source src={SRC_WEBM} type="video/webm" />
        <source src={SRC_MP4} type="video/mp4" />
      </video>
      <div className="absolute inset-0" style={SCRIM_STYLE} />
    </div>
  );
}
