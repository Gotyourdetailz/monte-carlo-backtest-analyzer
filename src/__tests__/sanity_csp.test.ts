/**
 * Sanity test: index.html declares the Content Security Policy and referrer
 * meta tags required by Requirement 2.4 / 2.5 of the code-review-remediation
 * spec.
 *
 * Run with: npx tsx src/__tests__/sanity_csp.test.ts
 *
 * Prints PASS / FAIL per check and exits non-zero on any failure.
 *
 * Validates: Requirements 2.4
 *
 * Also extended for the webgl-hero spec: the custom 3D WebGL hero is built
 * specifically to avoid the CSP relaxation that the rejected Spline approach
 * forced. The checks below guard that the strict policy stays intact — no
 * 'unsafe-eval', a retained connect-src 'self', and no new third-party origin
 * sneaking into the CSP.
 *
 * Validates: Requirements 4.1, 4.2, 4.6 (webgl-hero)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const indexPath = resolve(repoRoot, 'index.html');

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

console.log(`\n[sanity_csp] reading ${indexPath}`);

const html = readFileSync(indexPath, 'utf8');

// Locate the CSP meta tag. We scan for the http-equiv attribute and then take
// the surrounding tag so the substring checks below run only against the CSP
// content (not unrelated HTML).
const cspTagMatch = html.match(
  /<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i,
);

check(
  'index.html contains a Content-Security-Policy meta tag',
  cspTagMatch !== null,
);

const cspTag = cspTagMatch ? cspTagMatch[0] : '';

check(
  "CSP includes 'wasm-unsafe-eval'",
  cspTag.includes("'wasm-unsafe-eval'"),
);

check(
  "CSP includes worker-src 'self' blob:",
  cspTag.includes("worker-src 'self' blob:"),
);

check(
  "CSP includes frame-ancestors 'none'",
  cspTag.includes("frame-ancestors 'none'"),
);

// Referrer policy meta tag.
const referrerTagMatch = html.match(
  /<meta[^>]*name=["']referrer["'][^>]*>/i,
);

check(
  'index.html contains a referrer meta tag',
  referrerTagMatch !== null,
);

const referrerTag = referrerTagMatch ? referrerTagMatch[0] : '';

check(
  'referrer meta tag uses strict-origin-when-cross-origin',
  referrerTag.includes('strict-origin-when-cross-origin'),
);

// ---------------------------------------------------------------------------
// webgl-hero CSP integrity (Requirements 4.1, 4.2, 4.6)
//
// The custom 3D WebGL hero is built to need NO CSP relaxation (unlike the
// rejected Spline approach which forced 'unsafe-eval' and third-party fetches).
// These checks guard that the strict policy stays intact.
// ---------------------------------------------------------------------------

// Extract the CSP policy text (the content="..." attribute value) so the
// directive-level checks below operate on the policy itself, not the markup.
const cspContentMatch = cspTag.match(/content=(["'])([\s\S]*?)\1/i);
const cspContent = cspContentMatch ? cspContentMatch[2] : '';

// Split the policy into directives so we can inspect script-src / connect-src
// precisely rather than substring-scanning the whole tag.
const directives = cspContent
  .split(';')
  .map((d) => d.trim())
  .filter((d) => d.length > 0);

function directiveTokens(name: string): string[] {
  const found = directives.find(
    (d) => d.toLowerCase().split(/\s+/)[0] === name.toLowerCase(),
  );
  return found ? found.split(/\s+/).slice(1) : [];
}

const scriptSrcTokens = directiveTokens('script-src');

// 4.1: the WebGL hero must not force 'unsafe-eval' into script-src. Note that
// 'wasm-unsafe-eval' is a distinct, allowed token (used by the WASM kernel) and
// must NOT trip this check, so we compare whole tokens, not substrings.
check(
  "CSP script-src contains no 'unsafe-eval' token",
  scriptSrcTokens.length > 0 && !scriptSrcTokens.includes("'unsafe-eval'"),
  scriptSrcTokens.join(' '),
);

// Defense-in-depth: a standalone 'unsafe-eval' must not appear anywhere in the
// policy text either (still tolerating the 'wasm-unsafe-eval' token, whose
// 'unsafe-eval' substring is preceded by 'wasm-' rather than a quote/space).
check(
  "CSP contains no standalone 'unsafe-eval' anywhere",
  !/(^|[\s;])'unsafe-eval'/.test(cspContent),
);

// 4.2 / threat model: connect-src 'self' is retained.
const connectSrcTokens = directiveTokens('connect-src');
check(
  "CSP retains connect-src 'self'",
  connectSrcTokens.includes("'self'"),
  connectSrcTokens.join(' '),
);

// 4.6: introducing the WebGL hero adds no new third-party origin to the CSP.
// The WebGL hero self-hosts everything, so the only external origins permitted
// must remain the pre-existing ones (Plausible analytics + the retained,
// non-default Spline option). Any other http(s) origin is a regression.
const ALLOWED_THIRD_PARTY_ORIGINS = [
  'https://plausible.io',
  'https://prod.spline.design',
];
const thirdPartyOrigins = Array.from(
  cspContent.matchAll(/https?:\/\/[^\s;'"]+/gi),
).map((m) => m[0]);
const unexpectedOrigins = thirdPartyOrigins.filter(
  (origin) => !ALLOWED_THIRD_PARTY_ORIGINS.includes(origin),
);
check(
  'CSP introduces no new third-party origin for the WebGL hero',
  unexpectedOrigins.length === 0,
  unexpectedOrigins.length > 0
    ? `unexpected: ${unexpectedOrigins.join(', ')}`
    : `allowed: ${ALLOWED_THIRD_PARTY_ORIGINS.join(', ')}`,
);

if (failures > 0) {
  console.log(`\n[sanity_csp] ${failures} check(s) failed`);
  process.exit(1);
}

console.log('\n[sanity_csp] all checks passed');
