/**
 * heroChrome — shared, React-free "chrome" for the marketing hero backdrops.
 *
 * The decorative hero components (`BrandHero`, and the forthcoming `WebglHero`)
 * all implement the same Hero_Contract: a `-z-10`, `aria-hidden`,
 * `pointer-events-none` backdrop with a token-based legibility scrim and a
 * static brand-gradient fallback. This module owns the pieces of that contract
 * that are pure data / DOM helpers — the shared style objects and the theme
 * token readers — so the heroes reuse rather than duplicate them.
 *
 * The module is deliberately React-free (only the `CSSProperties` type is
 * imported) and DOM-defensive (every helper tolerates a missing `document` /
 * `window`), keeping it usable from any hero component and trivially testable.
 */
import type { CSSProperties } from 'react';

/** The static fallback backdrop — the brand radial-glow used hero-wide. */
export const FALLBACK_STYLE: CSSProperties = {
  background:
    'radial-gradient(700px 360px at 80% 0%, rgba(88,166,255,0.08), transparent 60%), ' +
    'radial-gradient(620px 320px at 10% 30%, rgba(232,121,249,0.07), transparent 60%)',
};

/** Legibility scrim so the hero text stays readable over the cloud. */
export const SCRIM_STYLE: CSSProperties = {
  background:
    'radial-gradient(1100px 460px at 50% 12%, transparent 0%, transparent 58%, ' +
    'color-mix(in srgb, var(--bg-primary) 30%, transparent) 100%), ' +
    'linear-gradient(180deg, transparent 64%, var(--bg-primary) 100%)',
};

/** True when the user has requested reduced motion (`prefers-reduced-motion`). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Read a theme token colour, falling back to the mode-agnostic accent hex. */
export function readToken(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** `#rrggbb` (or `#rgb`) → `rgba(r,g,b,a)`. Returns the input on parse failure. */
export function withAlpha(hex: string, a: number): string {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return hex;
  const n = Number.parseInt(h, 16);
  if (Number.isNaN(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
