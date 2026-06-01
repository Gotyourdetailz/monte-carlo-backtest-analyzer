/**
 * Sanity test: WebGL hero no-third-party / no-watermark source scan
 * (webgl-hero task 8.2).
 *
 * The custom 3D WebGL hero exists specifically to AVOID the third-party
 * fetches (external fonts, a scene asset, a watermark) that the rejected
 * Spline approach forced. This test guards that privacy/security posture at
 * the source level: it scans the two hero modules and asserts that their
 * *runtime code* contains no remote URL, no external font loading, no
 * watermark/attribution markup, and no remote-origin network call.
 *
 *   - `src/components/WebglHero.tsx` — the render component.
 *   - `src/heroSimPaths.ts`         — the pure path-generation module.
 *
 * Run with: npx tsx src/__tests__/sanity_webgl_hero_privacy.test.ts
 *
 * Prints PASS / FAIL per check and exits non-zero on any failure. Auto-joins
 * the suite via `run_all.test.ts`. No Jest/Vitest (per tech.md).
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4 (webgl-hero)
 *
 * ── Why we strip comments before scanning ────────────────────────────────────
 * The requirement is about what the *runtime code* fetches — not what the
 * documentation prose mentions. Both files legitimately mention the forbidden
 * words in their header JSDoc: WebglHero.tsx documents that it "replaces the
 * rejected … Spline approach" and ships "no … watermark, no network fetch",
 * and design-reference comments may carry URLs. A naive substring scan would
 * therefore false-positive on that prose. So we strip comments first and scan
 * only the comment-free code.
 *
 * ── Why a *string-aware* stripper (not a naive regex) ────────────────────────
 * This mirrors the robust strip-comments approach used in
 * `sanity_heroSimPaths_purity.test.ts`, but hardened for this file: a naive
 * line-comment regex that strips from a `//` to end-of-line is actively WRONG
 * for the URL check, because the `//` it keys on also appears INSIDE a real URL
 * literal (`https:`-then-slash-slash). Stripping to end-of-line would silently
 * delete a genuine remote font URL sitting in code, making the URL scan
 * trivially (and dangerously) always-pass.
 *
 * To stay correct we walk the source with a tiny state machine that tracks
 * string / template-literal context: comment delimiters are honoured only in
 * *code* state, while characters inside `'…'`, `"…"`, and `` `…` `` literals are
 * preserved verbatim. A URL added to code (in a string) therefore SURVIVES the
 * strip and is caught; a URL or the word "Spline"/"watermark" in a comment is
 * removed and cannot false-positive. JSX `{/* … *​/}` comments are ordinary
 * block comments and are removed the same way; JSX *text* (e.g. an unquoted
 * `Powered by` attribution) is not a comment and is preserved, so it is still
 * caught.
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// src/__tests__/ -> repo root.
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const SCANNED_FILES = [
  path.resolve(REPO_ROOT, 'src', 'components', 'WebglHero.tsx'),
  path.resolve(REPO_ROOT, 'src', 'heroSimPaths.ts'),
];

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

/**
 * Remove block comments (including JSDoc and JSX brace-wrapped block comments)
 * and line comments from TS/TSX source while preserving the contents of string
 * and template literals. A small state machine keeps us from (a) stripping the
 * double-slash inside a real URL literal in code and (b) misreading a
 * block-terminator-like sequence inside a string as a comment terminator.
 *
 * Regex literals are intentionally NOT modelled: neither scanned file uses one,
 * and a bare slash used for division is never adjacent to a second slash here,
 * so it cannot be mistaken for a comment start.
 */
function stripComments(src: string): string {
  type State = 'code' | 'line' | 'block' | 'squote' | 'dquote' | 'template';
  let state: State = 'code';
  let out = '';
  const n = src.length;
  for (let i = 0; i < n; i++) {
    const c = src[i];
    const next = i + 1 < n ? src[i + 1] : '';

    switch (state) {
      case 'code':
        if (c === '/' && next === '/') {
          state = 'line';
          i++; // consume the second '/'
        } else if (c === '/' && next === '*') {
          state = 'block';
          i++; // consume the '*'
        } else if (c === "'") {
          state = 'squote';
          out += c;
        } else if (c === '"') {
          state = 'dquote';
          out += c;
        } else if (c === '`') {
          state = 'template';
          out += c;
        } else {
          out += c;
        }
        break;

      case 'line':
        // Drop everything up to (but keep) the newline so line numbers / token
        // separation are roughly preserved.
        if (c === '\n') {
          state = 'code';
          out += c;
        }
        break;

      case 'block':
        // Drop everything until the closing '*/'; emit a space so adjacent
        // tokens don't accidentally fuse.
        if (c === '*' && next === '/') {
          state = 'code';
          out += ' ';
          i++; // consume the '/'
        }
        break;

      case 'squote':
      case 'dquote':
      case 'template':
        out += c;
        if (c === '\\') {
          // Preserve the escaped character verbatim; it can't close the string.
          if (i + 1 < n) out += src[i + 1];
          i++;
        } else if (
          (state === 'squote' && c === "'") ||
          (state === 'dquote' && c === '"') ||
          (state === 'template' && c === '`')
        ) {
          state = 'code';
        }
        break;
    }
  }
  return out;
}

/**
 * Forbidden runtime-code patterns. Each maps a human-readable assertion (worded
 * as the guarantee we want) to a regex that MUST NOT match the comment-free
 * code, plus the requirement(s) it backs.
 */
interface ForbiddenPattern {
  label: string;
  pattern: RegExp;
  req: string;
}

const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  // Req 5.1 / 5.2: no remote URL literal — nothing is fetched from another
  // origin and no asset/font is pulled from a CDN.
  { label: 'contains no http(s):// URL literal', pattern: /https?:\/\//i, req: '5.1, 5.2' },

  // Req 5.4 / 5.2: no external font loading of any kind.
  { label: 'does not import @fontsource', pattern: /@fontsource/i, req: '5.4' },
  { label: 'does not use a three FontLoader', pattern: /\bFontLoader\b/, req: '5.4' },
  { label: 'does not construct a FontFace', pattern: /\bnew\s+FontFace\b/, req: '5.4' },
  { label: 'does not reference fonts.googleapis', pattern: /fonts\.googleapis/i, req: '5.4' },
  { label: 'does not reference fonts.gstatic', pattern: /fonts\.gstatic/i, req: '5.4' },
  {
    label: 'declares no remote font file (.woff/.woff2/.ttf/.otf/.eot)',
    pattern: /\.(?:woff2?|ttf|otf|eot)\b/i,
    req: '5.4',
  },

  // Req 5.3: no third-party watermark / attribution overlay (markup or text).
  { label: 'contains no "watermark" markup/text', pattern: /watermark/i, req: '5.3' },
  { label: 'contains no "Powered by" attribution', pattern: /powered\s+by/i, req: '5.3' },
  { label: 'contains no "Built with" attribution', pattern: /built\s+with/i, req: '5.3' },
  { label: 'contains no "Spline" attribution string', pattern: /\bspline\b/i, req: '5.3' },

  // Req 5.1 (reinforcement): no remote-origin network call in these files.
  { label: 'issues no fetch() call', pattern: /\bfetch\s*\(/, req: '5.1' },
  { label: 'uses no XMLHttpRequest', pattern: /\bXMLHttpRequest\b/, req: '5.1' },
  { label: 'uses no navigator.sendBeacon', pattern: /\bsendBeacon\b/, req: '5.1' },
];

console.log('\n[sanity_webgl_hero_privacy] no-third-party / no-watermark source scan');

for (const filePath of SCANNED_FILES) {
  const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  console.log(`\n  scanning ${rel}`);

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    check(`${rel} is readable`, false, 'file missing or unreadable');
    continue;
  }
  check(`${rel} is readable and non-empty`, raw.trim().length > 0);

  const code = stripComments(raw);

  for (const { label, pattern, req } of FORBIDDEN_PATTERNS) {
    const match = code.match(pattern);
    check(
      `${rel} ${label} (Req ${req})`,
      match === null,
      match ? `found: ${JSON.stringify(match[0])}` : '',
    );
  }
}

if (failures > 0) {
  console.log(`\n[sanity_webgl_hero_privacy] ${failures} check(s) failed`);
  process.exit(1);
}

console.log('\n[sanity_webgl_hero_privacy] all checks passed');
