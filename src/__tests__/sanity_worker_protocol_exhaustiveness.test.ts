/**
 * Sanity test: the `WorkerRequest` discriminated union in
 * `src/workerProtocol.ts` is exhaustively type-checkable, so that
 * `simulationWorker.ts`-style switches over `request.kind` produce a
 * `tsc --noEmit` error if a future model addition is missed.
 *
 * Strategy: compile the deliberately-broken fixture
 * `src/__tests__/fixtures/incomplete_worker_switch.ts` in isolation
 * via its sibling `tsconfig.json`, and assert that:
 *
 *   1. `tsc --noEmit` exits non-zero.
 *   2. The reported error originates from the fixture file.
 *   3. The error mentions an unhandled arm of the union (the
 *      `assertNever(request)` site reports that `request` is not
 *      assignable to `never`).
 *
 * If anyone deletes `'position-sizing-search'` from `WorkerRequest`
 * (collapsing the union to two members), the fixture would start
 * type-checking cleanly and this test would fail — surfacing the
 * regression at CI time. The repo's root `tsconfig.json` excludes
 * `src/__tests__/fixtures` so the broken fixture does NOT poison
 * `npm run lint`.
 *
 * Run with: npx tsx src/__tests__/sanity_worker_protocol_exhaustiveness.test.ts
 *
 * Prints PASS / FAIL per check and exits non-zero on any failure.
 *
 * Validates: Requirements 8.1, 8.2 — Property 14
 * (WorkerRequest discriminated-union exhaustiveness, verified at compile time).
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const fixtureDir = resolve(__dirname, 'fixtures');
const fixturePath = resolve(fixtureDir, 'incomplete_worker_switch.ts');
const fixtureTsconfig = resolve(fixtureDir, 'tsconfig.json');

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

console.log(`\n[sanity_worker_protocol_exhaustiveness] fixture: ${fixturePath}`);

check('fixture file exists', existsSync(fixturePath));
check('fixture tsconfig exists', existsSync(fixtureTsconfig));

// Resolve the local TypeScript compiler from node_modules so we don't depend
// on a global `tsc` install. Use the platform-appropriate binary name.
const tscBinary = resolve(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
);

check('local tsc binary is installed', existsSync(tscBinary), tscBinary);

if (failures > 0) {
  console.log(
    `\n[sanity_worker_protocol_exhaustiveness] ${failures} pre-flight check(s) failed`,
  );
  process.exit(1);
}

console.log(
  `[sanity_worker_protocol_exhaustiveness] running: tsc --noEmit -p ${fixtureTsconfig}`,
);

const tscResult = spawnSync(
  tscBinary,
  ['--noEmit', '-p', fixtureTsconfig],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  },
);

if (tscResult.error) {
  console.log(
    `  FAIL  failed to spawn tsc: ${tscResult.error.message}`,
  );
  process.exit(1);
}

const stdout = tscResult.stdout ?? '';
const stderr = tscResult.stderr ?? '';
const combinedOutput = stdout + stderr;

console.log('--- tsc output (begin) ---');
console.log(combinedOutput.trim() || '(no output)');
console.log('--- tsc output (end) ---');

check(
  'tsc exits non-zero on the deliberately-broken fixture',
  tscResult.status !== 0,
  `exit=${tscResult.status}`,
);

check(
  'tsc reports an error in the fixture file',
  combinedOutput.includes('incomplete_worker_switch.ts'),
);

// The omitted arm leaves `request` typed as `PositionSizingRequest`, which
// the final `assertNever(request)` call cannot accept. We verify the
// signature of that exhaustiveness failure rather than a specific TS error
// number, so future TypeScript versions can rephrase the diagnostic.
const exhaustivenessSignals = [
  'not assignable to parameter of type',
  "type 'never'",
  'PositionSizingRequest',
];

check(
  'tsc error references the missing union arm (PositionSizingRequest)',
  exhaustivenessSignals.some((sig) => combinedOutput.includes(sig)),
  exhaustivenessSignals.find((sig) => combinedOutput.includes(sig)) ?? 'no signal matched',
);

if (failures > 0) {
  console.log(
    `\n[sanity_worker_protocol_exhaustiveness] ${failures} check(s) failed`,
  );
  process.exit(1);
}

console.log(
  '\n[sanity_worker_protocol_exhaustiveness] all checks passed (worker protocol exhaustiveness is enforced at compile time)',
);
