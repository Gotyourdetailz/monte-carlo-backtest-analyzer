/**
 * Smoke test: assert no historical occurrence of the leaked GEMINI_API_KEY
 * pattern (`AIzaSy...`) in any commit reachable from any ref.
 *
 * Implements the verification command documented in SECURITY.md, path-scoped to
 * exclude this test and SECURITY.md — both of which name the pattern for
 * documentation, not as a live key:
 *   git log --all -S 'AIzaSy' -- . ':!SECURITY.md' ':!src/__tests__/smoke_secret_audit.test.ts'
 *
 * Skips gracefully when:
 *   - git is not installed / not on PATH
 *   - the working tree is not inside a git repo (e.g. tarball / zip download)
 *
 * Prints PASS / FAIL / SKIP and exits non-zero on FAIL only.
 *
 * Run with: npx tsx src/__tests__/smoke_secret_audit.test.ts
 *
 * Requirements: 1.5
 */

import { execSync } from 'child_process';

const NEEDLE = 'AIzaSy';
// Run git from the directory the test was invoked in. `git rev-parse` walks
// up to find the enclosing repo (or reports "not a git repository"), so we
// don't need to resolve the repo root ourselves — keeps this script ESM/CJS
// agnostic (no __dirname dependency under "type": "module").
const REPO_ROOT = process.cwd();

function skip(reason: string): never {
  console.log(`SKIP  smoke_secret_audit — ${reason}`);
  process.exit(0);
}

function pass(detail = ''): never {
  console.log(`PASS  smoke_secret_audit${detail ? ' — ' + detail : ''}`);
  process.exit(0);
}

function fail(detail: string): never {
  console.log(`FAIL  smoke_secret_audit — ${detail}`);
  process.exit(1);
}

// 1. Confirm git is available and we're inside a work tree.
try {
  const insideTree = execSync('git rev-parse --is-inside-work-tree', {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  }).trim();

  if (insideTree !== 'true') {
    skip(`git rev-parse reported "${insideTree}" — not inside a work tree`);
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  // ENOENT (git not on PATH) or "not a git repository" both warrant skip.
  if (
    /ENOENT/i.test(msg) ||
    /not a git repository/i.test(msg) ||
    /command not found/i.test(msg) ||
    /is not recognized/i.test(msg)
  ) {
    skip(`git not available or not a git repo (${msg.split('\n')[0]})`);
  }
  skip(`git rev-parse failed: ${msg.split('\n')[0]}`);
}

// 2. Search all reachable commits for the leaked-key shape via git log -S.
//    --oneline keeps output to one line per offending commit so we can count
//    lines and also surface the offenders if any are found.
//
//    The pickaxe is path-scoped to EXCLUDE the two files that legitimately
//    contain the literal needle as a *pattern, not a key*: this audit test
//    (its NEEDLE constant) and SECURITY.md (which documents the incident).
//    Without the excludes, the scanner matches its own detection string once
//    those files are committed — a self-referential false positive. Every
//    other path in history is still scanned, so a real key leak is still
//    caught. The paren-free `:!path` exclude form is double-quoted so the
//    command parses safely under both cmd.exe and POSIX sh (runs via execSync).
let logOutput = '';
try {
  logOutput = execSync(
    `git log --all -S "${NEEDLE}" --oneline -- . ":!SECURITY.md" ":!src/__tests__/smoke_secret_audit.test.ts"`,
    {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    },
  );
} catch (err) {
  // execSync throws when git exits non-zero; in this codepath that's a real
  // failure (we already confirmed we're in a git repo above).
  const msg = err instanceof Error ? err.message : String(err);
  fail(`git log --all -S '${NEEDLE}' failed: ${msg.split('\n')[0]}`);
}

const offendingCommits = logOutput
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

if (offendingCommits.length === 0) {
  pass(`no commit in any ref introduces or removes the '${NEEDLE}' substring`);
}

console.log(
  `FAIL  smoke_secret_audit — found ${offendingCommits.length} commit(s) touching the '${NEEDLE}' substring:`,
);
for (const c of offendingCommits) {
  console.log(`        ${c}`);
}
console.log(
  `        Rotate the leaked key in the Google AI Studio console and follow the`,
);
console.log(
  `        history-rewrite procedure documented in SECURITY.md before merging.`,
);
process.exit(1);
