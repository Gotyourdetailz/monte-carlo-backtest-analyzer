/**
 * Sanity-test aggregator (task 13.1).
 *
 * Runs every `*.test.ts` file under `src/__tests__/` (except this file) by
 * spawning `npx tsx <path>` for each one, captures stdout/stderr, and prints a
 * per-test PASS/FAIL line plus a final summary. Exits non-zero if any test
 * fails.
 *
 * Usage:
 *   npx tsx src/__tests__/run_all.test.ts
 *
 * This is the recommended local pre-commit smoke step — see README.md.
 *
 * Conventions:
 *   - No Jest / Vitest. Pure tsx-runnable script using Node built-ins
 *     (`child_process`, `fs`, `path`).
 *   - Tests are auto-discovered; just drop a new `*.test.ts` into
 *     `src/__tests__/` and it joins the suite.
 *   - `e2e_real_data.test.ts` is skipped automatically when `MC_E2E_CSV` is
 *     unset (it self-skips with status 0, but we don't surface it as a run).
 *   - Per-test timeout is 120 seconds; a hung test is killed and reported as
 *     FAIL rather than blocking the aggregator indefinitely.
 *   - We invoke `npx tsx <path>` through a shell (`shell: true`) so the
 *     `npx`/`npx.cmd` shim resolves cross-platform without us having to
 *     reproduce Node's lookup rules. Node 20 also rejects direct
 *     `spawnSync('npx.cmd', ...)` calls on Windows with `EINVAL`; routing
 *     through the shell side-steps that.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TESTS_DIR = __dirname;
const SELF_BASENAME = path.basename(__filename); // e.g. 'run_all.test.ts'
const PER_TEST_TIMEOUT_MS = 120_000;

interface TestOutcome {
  file: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  durationMs: number;
  reason?: string;
}

function discoverTests(): string[] {
  const entries = readdirSync(TESTS_DIR, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.test.ts')) continue;
    if (entry.name === SELF_BASENAME) continue; // avoid recursion
    out.push(entry.name);
  }
  out.sort();
  return out;
}

function shouldSkip(file: string): { skip: boolean; reason?: string } {
  // The e2e test self-skips with status 0 when MC_E2E_CSV is unset, but
  // we surface the skip explicitly here so the summary stays honest.
  if (file === 'e2e_real_data.test.ts' && !process.env.MC_E2E_CSV) {
    return { skip: true, reason: 'MC_E2E_CSV not set' };
  }
  return { skip: false };
}

function runOne(file: string): TestOutcome {
  const skip = shouldSkip(file);
  if (skip.skip) {
    return { file, status: 'SKIP', durationMs: 0, reason: skip.reason };
  }

  const testPath = path.join(TESTS_DIR, file);
  // With `shell: true`, Node joins argv with spaces and hands it to the
  // shell verbatim. Quote the path so a directory like `C:\Users\my name\...`
  // doesn't fracture into two arguments.
  const quotedPath = `"${testPath}"`;
  const started = Date.now();
  const result = spawnSync('npx', ['tsx', quotedPath], {
    cwd: path.resolve(TESTS_DIR, '..', '..'), // repo root
    encoding: 'utf-8',
    timeout: PER_TEST_TIMEOUT_MS,
    // Inherit env so MC_E2E_CSV and friends propagate to children.
    env: process.env,
    // Route through the shell so the `npx` / `npx.cmd` shim resolves on
    // both Windows and POSIX without us reimplementing Node's lookup.
    shell: true,
    // Cap captured output so a runaway test can't OOM the aggregator.
    maxBuffer: 16 * 1024 * 1024, // 16 MiB
  });
  const durationMs = Date.now() - started;

  if (result.error) {
    const isTimeout =
      (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT' ||
      result.signal === 'SIGTERM';
    return {
      file,
      status: 'FAIL',
      durationMs,
      reason: isTimeout
        ? `timed out after ${PER_TEST_TIMEOUT_MS} ms`
        : `spawn error: ${result.error.message}`,
    };
  }

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const exit = result.status;

  if (exit === 0) {
    return { file, status: 'PASS', durationMs };
  }

  // On failure, surface the child output so the caller can debug without
  // re-running the test by hand.
  if (stdout.trim().length > 0) {
    process.stdout.write(stdout.endsWith('\n') ? stdout : stdout + '\n');
  }
  if (stderr.trim().length > 0) {
    process.stderr.write(stderr.endsWith('\n') ? stderr : stderr + '\n');
  }
  return {
    file,
    status: 'FAIL',
    durationMs,
    reason: exit === null ? `terminated by signal ${result.signal}` : `exit ${exit}`,
  };
}

function main(): void {
  console.log('\n[run_all] aggregating sanity tests under src/__tests__/');
  console.log('[run_all] runner: npx tsx <testPath> (via shell)');
  console.log(`[run_all] per-test timeout: ${PER_TEST_TIMEOUT_MS} ms\n`);

  const tests = discoverTests();
  if (tests.length === 0) {
    console.log('[run_all] no tests discovered — nothing to do');
    process.exit(0);
  }

  const outcomes: TestOutcome[] = [];
  for (const file of tests) {
    process.stdout.write(`> ${file} ... `);
    const outcome = runOne(file);
    outcomes.push(outcome);
    const ms = `${outcome.durationMs} ms`;
    if (outcome.status === 'PASS') {
      console.log(`PASS (${ms})`);
    } else if (outcome.status === 'SKIP') {
      console.log(`SKIP (${outcome.reason ?? 'no reason'})`);
    } else {
      console.log(`FAIL (${ms}) — ${outcome.reason ?? 'unknown'}`);
    }
  }

  const passed = outcomes.filter(o => o.status === 'PASS').length;
  const failed = outcomes.filter(o => o.status === 'FAIL').length;
  const skipped = outcomes.filter(o => o.status === 'SKIP').length;

  console.log('');
  console.log(
    `[run_all] ${outcomes.length} tests, ${passed} passed, ${failed} failed${
      skipped > 0 ? `, ${skipped} skipped` : ''
    }`,
  );

  if (failed > 0) {
    console.log('[run_all] failing tests:');
    for (const o of outcomes) {
      if (o.status === 'FAIL') {
        console.log(`  - ${o.file}: ${o.reason ?? 'unknown'}`);
      }
    }
    process.exit(1);
  }
  process.exit(0);
}

main();
