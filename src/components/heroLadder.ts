/**
 * heroLadder — the pure, deterministic hero-tier selector for the marketing
 * Hero_Ladder (Req 3.1–3.4).
 *
 * `selectActiveHeroTier` is a total, side-effect-free function: given the
 * configured `Hero_Mode`, the hard WebGL capability gate, the resolved theme,
 * and the optional Spline scene URL, it returns exactly one `HeroTier` from a
 * documented precedence order. `src/pages/Marketing.tsx` calls it once and
 * renders the matching backdrop component.
 *
 * This module is intentionally React/DOM-free (one pure concern per file, per
 * the repo convention) so the decision table is unit- and property-testable.
 *
 * Documented precedence table:
 *   mode = 'webgl' AND hasWebGL            -> 'webgl'
 *   mode = 'webgl' AND NOT hasWebGL        -> theme === 'dark' ? 'video' : 'brand'
 *   mode unset/unrecognised AND splineUrl  -> 'spline'   (preserve current default)
 *   mode unset/unrecognised AND NOT spline -> theme === 'dark' ? 'video' : 'brand'
 */

/** The backdrop tiers the Hero_Ladder can select. */
export type HeroTier = 'webgl' | 'video' | 'brand' | 'spline';

/**
 * The build-time Hero_Mode selector value. `'webgl'` opts into the 3D WebGL
 * hero tier; any other string (or `undefined`) is treated as unset/unrecognised
 * and preserves the current default behaviour.
 */
export type HeroMode = 'webgl' | string | undefined;

/** Inputs to the deterministic hero-tier decision. */
export interface SelectActiveHeroTierInput {
  /** The configured Hero_Mode (e.g. `HERO_MODE` from config). */
  mode: HeroMode;
  /** Hard capability gate: whether a WebGL context can be created. */
  hasWebGL: boolean;
  /** The resolved active theme. */
  theme: 'light' | 'dark';
  /** The configured Spline scene URL (empty string when unset). */
  splineUrl: string;
}

/** The theme-appropriate next tier when the WebGL tier cannot render. */
function themeFallbackTier(theme: 'light' | 'dark'): HeroTier {
  return theme === 'dark' ? 'video' : 'brand';
}

/**
 * Deterministic, total hero-tier selection (Req 3.1–3.4).
 *
 * Returns the same `HeroTier` for the same input on every call and never
 * throws — every `(mode, hasWebGL, theme, splineUrl)` combination maps to a
 * valid tier per the documented precedence table above.
 */
export function selectActiveHeroTier(input: SelectActiveHeroTierInput): HeroTier {
  const { mode, hasWebGL, theme, splineUrl } = input;

  // Tier 1: explicit WebGL mode.
  if (mode === 'webgl') {
    // Req 3.2: WebGL available -> the 3D WebGL hero.
    // Req 3.3: WebGL unavailable -> the theme-appropriate next tier.
    return hasWebGL ? 'webgl' : themeFallbackTier(theme);
  }

  // Req 3.4: mode unset/unrecognised -> preserve the current default behaviour:
  // Spline when a scene URL is configured, else the theme-appropriate tier.
  if (splineUrl.trim() !== '') {
    return 'spline';
  }
  return themeFallbackTier(theme);
}
