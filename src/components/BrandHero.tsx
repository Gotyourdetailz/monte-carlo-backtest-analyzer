/**
 * BrandHero — the default decorative backdrop for the marketing hero.
 *
 * A self-hosted Canvas 2D "Monte-Carlo probability cloud": slow-drifting,
 * brand-coloured glow particles with faint constellation links. Unlike the
 * optional Spline scene it needs no network fetch and carries no third-party
 * watermark, and its colours are read from the live theme tokens so it tracks
 * light/dark automatically.
 *
 * Behaviour parity with `SplineHero`:
 *   - purely decorative: `aria-hidden`, `pointer-events-none`, behind the text;
 *   - under `prefers-reduced-motion` it renders a single static frame (no
 *     animation loop) — honouring constraint C6 (no perpetual animation);
 *   - degrades to the static brand-gradient fallback if Canvas 2D is missing.
 *
 * Layering: renders a `-z-10` backdrop, so (like `SplineHero`) it MUST live
 * inside an element that establishes a stacking context (e.g. a parent with the
 * `isolate` utility) or the negative-z layer escapes behind ancestor
 * backgrounds.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  FALLBACK_STYLE,
  SCRIM_STYLE,
  prefersReducedMotion,
  readToken,
  withAlpha,
} from './_shared/heroChrome';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  color: string;
}

function canvasSupported(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return Boolean(document.createElement('canvas').getContext('2d'));
  } catch {
    return false;
  }
}

const LINK_DIST = 150; // px — draw a faint link between particles closer than this

function makeParticles(count: number, w: number, h: number, palette: string[]): Particle[] {
  const list: Particle[] = [];
  for (let i = 0; i < count; i += 1) {
    list.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: 26 + Math.random() * 64,
      alpha: 0.05 + Math.random() * 0.1,
      color: palette[i % palette.length],
    });
  }
  return list;
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

export function BrandHero(): ReactElement {
  const [supported] = useState(canvasSupported);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!supported) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const palette = [
      readToken('--accent-blue', '#58a6ff'),
      readToken('--accent-purple', '#d2a8ff'),
      readToken('--accent-magenta', '#e879f9'),
    ];
    const linkColor = palette[0];

    let w = 0;
    let h = 0;
    let particles: Particle[] = [];

    const sync = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = container.clientWidth;
      h = container.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(60, Math.max(22, (w * h) / 26000)));
      particles = makeParticles(count, w, h, palette);
    };

    const draw = (): void => {
      ctx.clearRect(0, 0, w, h);
      // Faint constellation links (drawn first, under the glows).
      for (let i = 0; i < particles.length; i += 1) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < LINK_DIST) {
            ctx.strokeStyle = withAlpha(linkColor, (1 - d / LINK_DIST) * 0.06);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      // Soft brand glows + a small bright core for depth.
      for (const p of particles) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, withAlpha(p.color, p.alpha));
        g.addColorStop(1, withAlpha(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = withAlpha(p.color, Math.min(0.5, p.alpha * 3));
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = (): void => {
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -p.r) p.x = w + p.r;
        else if (p.x > w + p.r) p.x = -p.r;
        if (p.y < -p.r) p.y = h + p.r;
        else if (p.y > h + p.r) p.y = -p.r;
      }
      draw();
    };

    sync();

    // Reduced motion → one static frame, no loop (constraint C6).
    const motionQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    let raf = 0;
    let last = 0;
    const FRAME = 1000 / 30; // throttle to ~30fps
    const loop = (t: number): void => {
      raf = window.requestAnimationFrame(loop);
      if (document.hidden) return; // idle in background tabs
      if (t - last < FRAME) return;
      last = t;
      step();
    };

    const start = (): void => {
      window.cancelAnimationFrame(raf);
      raf = 0;
      if (prefersReducedMotion()) {
        draw(); // static frame only
      } else {
        raf = window.requestAnimationFrame(loop);
      }
    };

    start();

    const ro = new ResizeObserver(() => {
      sync();
      if (prefersReducedMotion()) draw();
    });
    ro.observe(container);

    const onMotionChange = (): void => start();
    motionQuery?.addEventListener?.('change', onMotionChange);

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      motionQuery?.removeEventListener?.('change', onMotionChange);
    };
  }, [supported]);

  if (!supported) return <FallbackLayer />;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div className="absolute inset-0" style={SCRIM_STYLE} />
    </div>
  );
}
