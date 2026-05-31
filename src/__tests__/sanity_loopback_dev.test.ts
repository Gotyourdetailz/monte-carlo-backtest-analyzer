/**
 * Sanity test: package.json's `dev` script binds the Vite dev server to
 * loopback only (no `--host=0.0.0.0`), and a separate `dev:lan` script exists
 * for explicit LAN opt-in.
 *
 * Run with: npx tsx src/__tests__/sanity_loopback_dev.test.ts
 *
 * Prints PASS / FAIL per check and exits non-zero on any failure.
 *
 * Validates: Requirements 2.1
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const pkgPath = resolve(repoRoot, 'package.json');

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

console.log(`\n[sanity_loopback_dev] reading ${pkgPath}`);

const pkgRaw = readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(pkgRaw) as {
  scripts?: Record<string, string>;
};

const scripts = pkg.scripts ?? {};

check(
  'package.json has a `dev` script',
  typeof scripts.dev === 'string' && scripts.dev.length > 0,
  scripts.dev ? `dev=${scripts.dev}` : '',
);

const devScript = scripts.dev ?? '';

check(
  '`dev` script does NOT contain --host=0.0.0.0',
  !devScript.includes('--host=0.0.0.0'),
  `dev=${devScript}`,
);

check(
  'package.json has a `dev:lan` script',
  typeof scripts['dev:lan'] === 'string' && scripts['dev:lan'].length > 0,
  scripts['dev:lan'] ? `dev:lan=${scripts['dev:lan']}` : '',
);

const devLanScript = scripts['dev:lan'] ?? '';

check(
  '`dev:lan` script DOES contain --host=0.0.0.0',
  devLanScript.includes('--host=0.0.0.0'),
  `dev:lan=${devLanScript}`,
);

if (failures > 0) {
  console.log(`\n[sanity_loopback_dev] ${failures} check(s) failed`);
  process.exit(1);
}

console.log('\n[sanity_loopback_dev] all checks passed');
