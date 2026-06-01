/**
 * webglHeroHelpers — the pure, React/DOM-free helper core for `WebglHero`.
 *
 * The render component (`WebglHero.tsx`) owns all the DOM/WebGL/React concerns,
 * but the small, total decision functions that govern its render budget, its
 * device-pixel-ratio clamp, its animation gating, and its theme-token fallback
 * are factored out here so they can be unit- and property-tested in isolation
 * (one pure concern per file, per the repo convention). Every function in this
 * module is total: it returns a sensible, in-range value for *any* input,
 * including hostile ones (`NaN`, `Infinity`, negative, or absurdly large
 * numbers, and missing strings), and it never throws.
 *
 * Properties validated by `property_webglHeroHelpers.test.ts`:
 *   P6  — `resolveTokenValue` returns the live token when present/non-blank,
 *         else the documented fallback (Req 2.2).
 *   P8  — `resolvePathCount` returns an integer in [1, MAX_PATHS], and is
 *         additionally <= SMALL_SCREEN_CAP below SMALL_SCREEN_THRESHOLD
 *         (Req 10.1, 10.2).
 *   P9  — `clampDpr` returns a finite value in [1, MAX_DPR] (Req 10.3).
 *   P10 — `shouldAnimate` is true iff motion is allowed, the document is
 *         visible, and the section is on-screen (Req 7.1, 8.1, 8.3).
 */

/**
 * Hard upper bound on the number of equity-path ribbons rendered, regardless
 * of viewport size, to keep the geometry/segment budget bounded (Req 10.2).
 */
export const MAX_PATHS = 48;

/**
 * Viewport width (CSS px) below which the hero is considered a "small screen"
 * and the rendered path count is reduced (Req 10.1).
 */
export const SMALL_SCREEN_THRESHOLD = 768;

/**
 * The reduced path-count cap applied on small screens (widths below
 * `SMALL_SCREEN_THRESHOLD`) to keep mobile/tablet rendering light (Req 10.1).
 */
export const SMALL_SCREEN_CAP = 16;

/**
 * Maximum device pixel ratio the renderer is allowed to use, mirroring the
 * `Math.min(window.devicePixelRatio || 1, 2)` clamp in `BrandHero` (Req 10.3).
 */
export const MAX_DPR = 2;

/**
 * Viewport width (CSS px) at (and above) which the full `MAX_PATHS` budget is
 * rendered. Between `SMALL_SCREEN_THRESHOLD` and this width the count scales
 * linearly. Internal tuning constant; not part of the documented public API.
 */
const FULL_SCREEN_WIDTH = 1920;

/** Round and clamp `value` into the inclusive integer range `[min, max]`. */
function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Resolve how many equity-path ribbons to render for a given viewport width
 * (Req 10.1, 10.2).
 *
 * The result is always an integer in `[1, MAX_PATHS]`. For any width below
 * `SMALL_SCREEN_THRESHOLD` (including zero, negative, and non-finite widths,
 * which are treated as the most constrained case) the result is additionally
 * bounded by `SMALL_SCREEN_CAP`. Above the threshold the count scales linearly
 * from `SMALL_SCREEN_CAP` up to `MAX_PATHS`, reaching the cap at
 * `FULL_SCREEN_WIDTH` and never exceeding it.
 */
export function resolvePathCount(viewportWidth: number): number {
  // Non-finite or non-positive widths fall back to the small-screen cap, which
  // is itself within both [1, MAX_PATHS] and [1, SMALL_SCREEN_CAP].
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return SMALL_SCREEN_CAP;
  }

  if (viewportWidth < SMALL_SCREEN_THRESHOLD) {
    // Scale from a single path near 0px up to SMALL_SCREEN_CAP at the threshold.
    const fraction = viewportWidth / SMALL_SCREEN_THRESHOLD; // (0, 1)
    return clampInt(fraction * SMALL_SCREEN_CAP, 1, SMALL_SCREEN_CAP);
  }

  // At/above the threshold scale from SMALL_SCREEN_CAP up to MAX_PATHS.
  const span = FULL_SCREEN_WIDTH - SMALL_SCREEN_THRESHOLD;
  const rawFraction = span > 0 ? (viewportWidth - SMALL_SCREEN_THRESHOLD) / span : 1;
  const fraction = Math.min(1, Math.max(0, rawFraction));
  const count = SMALL_SCREEN_CAP + fraction * (MAX_PATHS - SMALL_SCREEN_CAP);
  return clampInt(count, 1, MAX_PATHS);
}

/**
 * Clamp a raw device pixel ratio into the finite range `[1, MAX_DPR]`
 * (Req 10.3).
 *
 * Any non-finite input (`NaN`, `±Infinity`) resolves to `1`; values at or below
 * `1` resolve to `1`; values above `MAX_DPR` resolve to `MAX_DPR`. The result
 * is therefore always a finite number in `[1, MAX_DPR]`.
 */
export function clampDpr(rawDpr: number): number {
  if (!Number.isFinite(rawDpr)) return 1;
  return Math.min(MAX_DPR, Math.max(1, rawDpr));
}

/** Inputs to the `shouldAnimate` gating predicate. */
export interface ShouldAnimateInput {
  /** Whether the user has requested reduced motion. */
  reducedMotion: boolean;
  /** Whether the document is currently hidden (e.g. a background tab). */
  documentHidden: boolean;
  /** Whether the hero section is currently intersecting the viewport. */
  sectionIntersecting: boolean;
}

/**
 * The single derived predicate that governs the animation loop (Req 7.1, 8.1,
 * 8.3): the loop should run if and only if motion is allowed, the document is
 * visible, and the hero section is on-screen.
 *
 * `shouldAnimate === true` ⇔ `!reducedMotion && !documentHidden &&
 * sectionIntersecting`.
 */
export function shouldAnimate({
  reducedMotion,
  documentHidden,
  sectionIntersecting,
}: ShouldAnimateInput): boolean {
  return !reducedMotion && !documentHidden && sectionIntersecting;
}

/**
 * Pure theme-token fallback resolver (Req 2.2).
 *
 * Returns `raw` when it is a present, non-blank string; otherwise returns the
 * documented `fallback`. "Blank" means empty or whitespace-only; a missing
 * (`null`/`undefined`) value is also treated as absent. This is the pure core
 * behind the `readToken()` pattern: callers pass the live CSS custom-property
 * value and the documented accent-hex fallback.
 */
export function resolveTokenValue(raw: string | null | undefined, fallback: string): string {
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  return raw;
}
