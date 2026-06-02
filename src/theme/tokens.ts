/**
 * Theme tokens — single source of truth for the color system.
 *
 * `darkTokens` and `lightTokens` MUST share identical keys (enforced by
 * `src/__tests__/property_theme_parity.test.ts`). The codegen script
 * `src/theme/generateThemeCss.ts` consumes these registries (plus the semantic
 * alias map) to emit `src/theme.css`.
 *
 * Accent hues are intentionally identical across modes; only background, border
 * and text tokens diverge between dark and light.
 */

/**
 * Core color tokens for the default (dark) theme — "Fluid Analytical".
 *
 * Atmospheric navy-charcoal surfaces, ONE scarce ion-mint product accent, and a
 * dark luminous "screen" for data. Legacy accent KEY NAMES are intentionally
 * preserved (so the ~20 existing panels need zero edits) but their VALUES are
 * remapped: `--accent-blue` is now mint, and purple/magenta fold onto the mint
 * family so no violet survives anywhere in the app.
 */
export const darkTokens: Readonly<Record<string, string>> = {
  // ── Surfaces ──
  '--bg-primary': '#0a0f14',
  '--bg-secondary': '#0d141b',
  '--bg-card': '#121a21',
  '--bg-elevated': '#18222b',
  // App backdrop: radial depth from the top-right (mirrors the cockpit variant).
  '--bg-app': 'radial-gradient(circle at top right, #101b26, #0a0f14 52%, #080c10)',

  // ── Hairlines ──
  '--border': '#1d2731',
  '--border-bright': '#46e6c8', // mint focus/active edge (was AI-blue)

  // ── Text ──
  '--text-primary': '#e8eef0',
  '--text-secondary': '#94a39d',

  // ── Accents (legacy keys preserved; values folded onto the mint family) ──
  '--accent-blue': '#46e6c8', // ← now mint; the `--primary` alias points here
  '--accent-green': '#5fb37a',
  '--accent-red': '#d2544e',
  '--accent-amber': '#cda13c',
  '--accent-purple': '#5ff3d6', // remapped → bright mint
  '--accent-magenta': '#46e6c8', // remapped → mint

  // ── New named ion accents for the rebuilt shell/cockpit ──
  '--accent-mint': '#46e6c8',
  '--accent-mint-bright': '#8dffe5',

  // ── Glass (white-alpha) shell surfaces + hairlines ──
  '--glass-bg': 'rgba(255,255,255,0.02)',
  '--glass-bg-strong': 'rgba(255,255,255,0.045)',
  '--glass-border': 'rgba(255,255,255,0.07)',
  '--glass-border-strong': 'rgba(255,255,255,0.14)',
  '--grid-line': 'rgba(255,255,255,0.035)',

  // ── The luminous "screen": always dark, even in light mode ──
  '--screen-start': '#11150f',
  '--screen-end': '#090b09',

  // ── Instrument trace colours (bright phosphor for CRT data) ──
  '--trace-pass': '#6fe39a',
  '--trace-fail': '#ff6457',
  '--trace-marginal': '#f4c257',
};

/** Core color tokens for the light theme ("bone / paper"). Keys MUST match `darkTokens`. */
export const lightTokens: Readonly<Record<string, string>> = {
  '--bg-primary': '#eae7de',
  '--bg-secondary': '#f2efe7',
  '--bg-card': '#f7f5ef',
  '--bg-elevated': '#ffffff',
  '--bg-app': 'radial-gradient(circle at top right, #f3f0e8, #eae7de 55%, #e2ded2)',

  '--border': '#d7d2c5',
  '--border-bright': '#07a589',

  '--text-primary': '#1a1b17',
  '--text-secondary': '#5b5e54',

  '--accent-blue': '#07a589', // mint, darkened for AA on bone
  '--accent-green': '#2f8f57',
  '--accent-red': '#c0392f',
  '--accent-amber': '#9a7414',
  '--accent-purple': '#0bbf9e',
  '--accent-magenta': '#07a589',

  '--accent-mint': '#07a589',
  '--accent-mint-bright': '#0bbf9e',

  '--glass-bg': 'rgba(255,255,255,0.55)',
  '--glass-bg-strong': 'rgba(255,255,255,0.78)',
  '--glass-border': 'rgba(40,38,30,0.10)',
  '--glass-border-strong': 'rgba(40,38,30,0.20)',
  '--grid-line': 'rgba(40,38,30,0.06)',

  // Screen stays dark even in light mode (locked principle: "a screen is a screen").
  '--screen-start': '#11150f',
  '--screen-end': '#090b09',

  '--trace-pass': '#2f8f57',
  '--trace-fail': '#c0392f',
  '--trace-marginal': '#9a7414',
};

/**
 * Convert a single 8-bit sRGB channel (0–255) to its linearized value per the
 * WCAG 2.x relative-luminance definition.
 */
function linearizeChannel(channel8bit: number): number {
  const c = channel8bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Parse a `#rrggbb` (or `#rgb`) hex string into an `[r, g, b]` 0–255 tuple. */
function parseHex(hex: string): readonly [number, number, number] {
  const normalized = hex.trim().replace(/^#/, '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : normalized;
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) {
    throw new Error(`Invalid hex color: "${hex}"`);
  }
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return [r, g, b];
}

/** WCAG relative luminance for a hex color in [0, 1]. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return (
    0.2126 * linearizeChannel(r) +
    0.7152 * linearizeChannel(g) +
    0.0722 * linearizeChannel(b)
  );
}

/**
 * WCAG contrast ratio between two hex colors: `(L1 + 0.05) / (L2 + 0.05)`
 * where `L1 >= L2`. Result is in the range [1, 21].
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Supported UI densities. */
export const densities = ['spacious', 'compact'] as const;

/** Root font-size (px) driving rem-based spacing for each density. */
export const densityRootFontPx: Record<(typeof densities)[number], number> = {
  spacious: 16,
  compact: 14.5,
};

/**
 * shadcn/ui semantic aliases mapped onto the core tokens. These are emitted
 * once in `:root`; because every value is `var(--core-token)`, switching the
 * core tokens for `[data-theme="light"]` updates the aliases automatically.
 */
export const semanticAliases: Readonly<Record<string, string>> = {
  '--background': 'var(--bg-primary)',
  '--foreground': 'var(--text-primary)',
  '--card': 'var(--bg-card)',
  '--card-foreground': 'var(--text-primary)',
  '--popover': 'var(--bg-elevated)',
  '--popover-foreground': 'var(--text-primary)',
  '--primary': 'var(--accent-blue)',
  '--primary-foreground': 'var(--bg-primary)',
  '--secondary': 'var(--bg-elevated)',
  '--secondary-foreground': 'var(--text-primary)',
  '--muted': 'var(--bg-secondary)',
  '--muted-foreground': 'var(--text-secondary)',
  '--accent': 'var(--accent-mint)',
  '--accent-foreground': 'var(--bg-primary)',
  '--destructive': 'var(--accent-red)',
  '--destructive-foreground': '#ffffff',
  '--input': 'var(--border)',
  '--ring': 'var(--accent-blue)',
  '--radius': '0.5rem',
};

/** Brand gradient referencing accent tokens (mode-agnostic). Mint → bright mint. */
export const gradientBrand =
  'linear-gradient(135deg, var(--accent-mint), var(--accent-mint-bright))';
