# Security

This document captures the security posture of the Monte Carlo Backtest Analyzer
and the operational procedures that go with it. It is intended for maintainers
and contributors. End-user-facing notes live in `README.md`.

The app is a browser-only single-page application: there is no server, no
multi-tenant data, and all run history persists locally in IndexedDB. The
sensitive surfaces are therefore limited to (1) developer credentials that
might leak into the working tree, (2) the local dev server, and (3) the user's
own uploaded trade data.

## Posture summary

- **Browser-only single-page app.** No server tier, no API gateway, no
  multi-tenant data plane. The bundle is a static site; whoever serves it
  has no role in handling user data beyond delivering the JS / WASM bytes.
- **Single user per browser.** There is no authentication, authorization, or
  cross-user separation, because there are no other users on the same
  origin. The only principal is the human running the browser.
- **IndexedDB-only persistence.** All run history (audit log, run metadata,
  histogram-summarized PnL distributions) is written to the origin's
  IndexedDB store, capped at 50 most-recent entries (`MAX_STORED_RUNS` in
  `src/runHistory.ts`). The store is unencrypted at rest, same-origin only,
  and never leaves the browser.
- **No remote telemetry.** The app does not phone home, does not log to a
  third-party analytics endpoint, and does not exfiltrate Trade_Data under
  any code path. The Content Security Policy in `index.html` enforces this:
  `connect-src 'self'` denies arbitrary outbound XHR / `fetch` / WebSocket.
- **One in-scope secret.** The only credential this repo cares about is the
  AI Studio `GEMINI_API_KEY`, which is injected at runtime by AI Studio and
  must never be committed.

## Trust boundaries

Each boundary below is the point at which untrusted-or-less-trusted bytes
cross into a more-trusted execution context. Each is enforced by a specific
mechanism rather than by convention.

| Boundary | Enforcement | Notes |
| --- | --- | --- |
| Browser ↔ user CSV | `papaparse` worker, `dynamicTyping: false`, `Forbidden_Header_Set` filter (`__proto__`, `constructor`, `prototype`), sidecar regime-segment map (no row mutation) | The CSV is treated as untrusted input. Headers that would alias prototype slots are stripped before any object is constructed. Numeric coercion goes through `parseFinancialNumber`, never PapaParse's auto-coerce. See `src/csvIngest.ts`. |
| Main thread ↔ Web Worker | One-shot `postMessage` with serialized config plus `Float64Array` transferable buffers; typed `WorkerRequest` / `WorkerResponse` discriminated unions in `src/workerProtocol.ts` | The worker is a structured-clone island. The main thread never shares mutable state with it; numeric series cross zero-copy via `transfer`, but each side owns its own view of metadata. `tsc --noEmit` enforces exhaustiveness on the union, so adding a new model type without updating the worker is a compile error. |
| Worker ↔ WASM_Kernel | Typed JSON via `run_mc_simulation` / `run_portfolio_simulation`; each payload carries `wasm_protocol_version` and the kernel returns `kernel_version` | Mismatched protocol versions are rejected (forward-compatible: the current pre-versioned kernel is tolerated, future kernels enforce). Kernel errors are surfaced as `WasmKernelError` with the kernel-reported reason and `kernelVersion`, never as silent NaNs. |
| Origin ↔ IndexedDB | Browser same-origin policy; `MAX_STORED_RUNS = 50` retention cap with oldest-first eviction; histogram-summarized PnL arrays | IndexedDB is scoped to the origin that wrote it, so the audit log inherits the origin's trust boundary. No code path reads from cross-origin storage. The retention cap prevents unbounded quota growth; the histogram summarization caps per-entry size so a single 5M-trade run cannot exhaust the quota. |

A few non-boundaries deserve explicit mention so future contributors do not
mistake them for trust boundaries:

- **AI Studio embed ↔ host page.** When the app is loaded inside an
  AI Studio applet, the embed is itself the same origin as far as the
  browser is concerned. AI Studio's secret-injection mechanism is treated
  as a runtime environment, not a security boundary owned by this repo.
- **Web server ↔ browser.** The Vite dev server (loopback-only by default,
  Requirement 2.1–2.3) and any production reverse proxy (Caddy / nginx /
  Vercel / etc.) deliver the static bundle but do not see user data. Their
  hardening (HSTS, `X-Content-Type-Options`, `X-Frame-Options`) is covered
  in the operator-side hardening section below.

## Sensitive data classes

The repo defines three classes of in-scope sensitive data. Each is named so
that future code review can reason about which boundary applies.

1. **Trade_Data.** The user's uploaded CSV: per-trade or per-day PnL,
   timestamps, optional benchmark series, optional factor matrix, optional
   regime tags, optional NinjaTrader instrument labels. This is the user's
   private trading record. It is parsed in a worker, processed by the
   simulation engine, and never transmitted off-origin. It is not persisted
   to IndexedDB in raw form: only the run-history audit log retains a
   `pnlDigest` and a histogram-summarized PnL distribution per run.

2. **Run history (audit log).** The IndexedDB-backed `mc-risk-desk` store
   in `src/runHistory.ts`. Each entry contains:
   `{ runId, randomSeed, samplingMode, effectiveSamplingMode, modelType,
   prngFamily, kernelVersion, dataDigest, pnlDigest, headline metrics,
   finalBalanceHistogram, finalBalanceSummary, maxDrawdownHistogram,
   maxDrawdownSummary, ... }`. The store is unencrypted, same-origin, and
   capped at `MAX_STORED_RUNS = 50` entries. `RunHistoryPanel` displays a
   one-line disclosure to that effect (Requirement 15.2) and the export
   modal warns the user before serializing the log to a downloadable JSON
   file (Requirement 15.5).

3. **AI Studio `GEMINI_API_KEY`.** The only credential in scope. This is
   *not* present in the client bundle: AI Studio injects it at runtime in
   its hosted environment, and the dev `.env` file is git-ignored. There
   are no other server-side secrets, database credentials, signing keys,
   or session tokens in this project.

The repo is **not** in scope for: live broker credentials, account-level
PII, market-data licenses, or anything else listed under "Non-goals" in
`.kiro/steering/product.md`. If a future feature would require any of
these, that feature inherently breaches this threat model and must
re-enter the design loop rather than be retrofitted.

## Secret rotation procedure

A working `GEMINI_API_KEY` was previously shipped in `.env`. The value has been
rotated and the live `.env` no longer contains a key. Use this procedure any
time a key is suspected of leaking.

1. Revoke the exposed key in the
   [Google AI Studio API Keys console](https://aistudio.google.com/apikey).
   Deletion is immediate and irreversible.
2. Generate a fresh key in the same console. Scope it to the smallest set of
   APIs the app actually uses (Generative Language API).
3. Update the runtime secret store rather than the repo:
   - In AI Studio: paste the new value into the Secrets panel for this applet.
     AI Studio will inject it as `process.env.GEMINI_API_KEY` at runtime.
   - For local development: copy `.env.example` to `.env` and fill in the new
     value. `.env` is git-ignored (`.env*` pattern in `.gitignore`).
4. Confirm the rotated key never reached committed history by running the
   audit command below from the repo root.
5. If the audit command finds any commit, treat the key as compromised and
   rotate again. Then rewrite history with `git filter-repo` (or the GitHub
   support equivalent) before pushing.

### Audit command

Run from the repository root:

```bash
git log --all -S 'AIzaSy' --oneline
```

This searches every commit on every branch for any string containing the
`AIzaSy` prefix that all Google API keys share. Expected output is empty.
Any non-empty result is a finding.

You can broaden the audit to the canonical 39-character key shape with:

```bash
git log --all -p -S 'AIzaSy' | grep -E 'AIzaSy[A-Za-z0-9_-]{33}'
```

## Incident response

If a key or other credential is found in history:

1. Rotate the credential immediately (see above).
2. File an incident note in the repo (commit message or `INCIDENTS.md`)
   recording when the leak landed, when it was rotated, and the audit output.
3. Treat any external party that may have cloned the repo while the key was
   live as having held the key.

## Pre-commit secret scanning

The audit command above only catches secrets that have already been committed.
To stop them at the door, run a secret-scanning pre-commit hook locally. Either
of the two tools below will do; pick one. The configuration must block the
canonical Google API key shape `AIzaSy[A-Za-z0-9_-]{33}` so the previously
leaked `GEMINI_API_KEY` (and any future siblings) cannot re-enter the index.

gitleaks is the recommended option (Option A): it ships as a single static
binary, runs identically on Windows / macOS / Linux, reads a TOML config
checked into the repo so the rule set travels with clones, and integrates
with both the plain `.git/hooks/pre-commit` shell hook and the husky-style
[pre-commit](https://pre-commit.com/) framework. git-secrets (Option B) is
kept as a lighter fallback for contributors who already use it.

### Option A — gitleaks (recommended)

[gitleaks](https://github.com/gitleaks/gitleaks) is a single static binary,
runs on Windows / macOS / Linux, and reads a TOML config from the repo root.

1. Install the binary once per machine:

   ```bash
   # macOS
   brew install gitleaks

   # Windows (scoop or winget)
   scoop install gitleaks
   winget install gitleaks.gitleaks

   # Linux / generic — download from https://github.com/gitleaks/gitleaks/releases
   ```

2. Create `.gitleaks.toml` at the repo root with a rule that fires on the
   Google API key shape (and keep the bundled default rules as a baseline):

   ```toml
   # .gitleaks.toml
   title = "Monte Carlo Backtest Analyzer — gitleaks config"

   # Inherit gitleaks' default rule pack so generic AWS / GitHub / Slack
   # tokens are still caught, then extend it with our project-specific rule.
   [extend]
   useDefault = true

   [[rules]]
   id = "google-api-key"
   description = "Google API key (AIzaSy... 39-char shape) — blocks GEMINI_API_KEY leaks"
   regex = '''AIzaSy[A-Za-z0-9_\-]{33}'''
   tags = ["key", "google", "gemini"]

   [allowlist]
   description = "Allow the prefix to appear in docs that explain the audit pattern"
   paths = [
     '''SECURITY\.md''',
     '''README\.md''',
   ]
   ```

   The `[allowlist]` block intentionally lets the bare prefix `AIzaSy` (and the
   regex literal) appear inside `SECURITY.md` and `README.md` so this very
   document does not trip the hook. It does NOT allow a full 39-character key.

3. Register gitleaks as a pre-commit hook. The simplest path is a plain
   `.git/hooks/pre-commit` script (no extra dependencies):

   ```bash
   # .git/hooks/pre-commit
   #!/usr/bin/env bash
   set -euo pipefail
   gitleaks protect --staged --redact --config .gitleaks.toml
   ```

   Then make it executable:

   ```bash
   chmod +x .git/hooks/pre-commit
   ```

   `gitleaks protect --staged` scans only the staged diff, so commits stay
   fast. `--redact` keeps any matched secret out of the terminal output.

4. (Optional) If the repo adopts the [pre-commit](https://pre-commit.com/)
   framework, register the same scan declaratively in `.pre-commit-config.yaml`:

   ```yaml
   repos:
     - repo: https://github.com/gitleaks/gitleaks
       rev: v8.21.2
       hooks:
         - id: gitleaks
   ```

   Then run `pre-commit install` once per clone.

### Option B — git-secrets

[git-secrets](https://github.com/awslabs/git-secrets) is a lighter alternative
that hooks directly into `git commit`. It has no config file; patterns live in
`git config`.

1. Install once per machine, then register the hooks in this clone:

   ```bash
   # macOS
   brew install git-secrets

   # then, from the repo root:
   git secrets --install
   git secrets --register-aws            # optional: AWS key patterns
   git secrets --add 'AIzaSy[A-Za-z0-9_\-]{33}'
   ```

2. Verify the rule is registered:

   ```bash
   git secrets --list
   # expect: secrets.patterns AIzaSy[A-Za-z0-9_\-]{33}
   ```

3. From this point on, any `git commit` whose staged diff contains a string
   matching `AIzaSy[A-Za-z0-9_-]{33}` is rejected before the commit object is
   written.

Either tool also supports a one-shot scan of the entire history, which makes a
good companion to the `git log --all -S 'AIzaSy'` audit command in the section
above:

```bash
gitleaks detect --source . --config .gitleaks.toml --redact
# or
git secrets --scan-history
```

## CI install and audit guidance

These rules apply to any CI workflow, container build, or deploy pipeline that
installs this project's dependencies. They reduce two distinct risks: lockfile
drift (CI installing a package version that was never reviewed locally) and
install-time arbitrary code execution (a compromised transitive dependency
running its `postinstall` script in CI).

### Use `npm ci`, never `npm install`, in CI

CI MUST install JS dependencies with `npm ci`, not `npm install`.

- `npm ci` installs strictly from `package-lock.json` and fails if the lockfile
  and `package.json` disagree. The set of bytes installed in CI is exactly
  the set reviewed locally.
- `npm install` is allowed to mutate the lockfile and to resolve newer
  versions inside permitted semver ranges. Running it in CI defeats the
  point of pinning dependencies (Requirement 3.2 / `SECURITY.md`) because
  CI may end up installing a version that no human ever audited.

```bash
# CI / Dockerfile
npm ci --omit=dev   # production install, lockfile-pinned
# or, when CI also needs the dev tools:
npm ci
```

### Disable install scripts by default; allowlist what genuinely needs them

CI SHOULD pass `--ignore-scripts` to `npm ci` so that no package's
`preinstall` / `install` / `postinstall` hook runs automatically. This is the
single most effective mitigation against a typosquat or supply-chain
compromise in a transitive dependency.

```bash
npm ci --ignore-scripts
```

After the install completes, re-run install scripts only for the specific
packages that legitimately need them, via `npm rebuild <pkg>`. Maintain the
allowlist in CI config so adding a new entry is a reviewable change.

```bash
# Example allowlist — extend only with explicit review.
npm rebuild puppeteer   # downloads a pinned Chromium build
```

Notes for this repo specifically:

- `puppeteer` (used by `exportPdf.ts`) downloads Chromium from its
  `postinstall` script. If the standalone PDF export is exercised in CI,
  `puppeteer` belongs on the allowlist; otherwise leave it disabled.
- `wasm-engine` is consumed via `"file:wasm-engine/pkg"` (a committed
  prebuilt artifact). It does not need install scripts.
- The remaining direct dependencies (`papaparse`, `@react-pdf/renderer`,
  `html2canvas`, etc.) do not require install scripts.

### Periodic dependency audits

Run both audits on a recurring schedule (for example, weekly in CI, or before
each release) and treat any High / Critical advisory as a release blocker.

```bash
# JavaScript — production dependency advisories only.
npm audit --omit=dev

# Rust — advisories against the wasm-engine crate.
cargo audit            # from wasm-engine/
```

`npm audit --omit=dev` excludes devDependencies so the report reflects what
actually ships in the production bundle. `cargo audit` (install once with
`cargo install cargo-audit`) checks the Rust dependency graph of the
WASM kernel against the RustSec advisory database; it is the Rust analogue
of `npm audit` and is required because `npm audit` cannot see Cargo
dependencies.

## Operator-side hardening (production hosting)

The Content Security Policy in `index.html` (Requirement 2.4) is set as a
`<meta http-equiv="Content-Security-Policy">` tag because that is the only
mechanism available to an SPA that does not control its own web server (e.g.
the AI Studio embed, a static-file `npm run preview`, or a localhost dev
session). It mitigates XSS regressions inside the document.

When the app is hosted on a real HTTP origin (your own domain behind
nginx / Caddy / Vercel / Cloudflare / S3 + CloudFront / etc.), the operator
is responsible for adding the response headers below at the web-server
layer. These cannot be set from a `<meta>` tag — they are HTTP response
headers, not document directives, and browsers ignore meta-tag forms of
these specifically.

### Required response headers

1. `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
   - Forces the browser to use HTTPS for this origin (and subdomains) for
     two years, eliminating the http→https downgrade attack window. The
     `preload` token opts into the browser-vendor HSTS preload list once
     the domain has been [submitted](https://hstspreload.org/).
   - Only set this once the origin is exclusively served over HTTPS — HSTS
     cannot be partially enabled and is hard to roll back inside `max-age`.

2. `X-Content-Type-Options: nosniff`
   - Disables MIME sniffing. Without it, a browser may execute a response
     with the wrong `Content-Type` as a script if the body looks
     script-shaped, which weakens the CSP `script-src` allowlist.

3. `X-Frame-Options: DENY`
   - Refuses framing of the document by any origin (clickjacking defense).
   - The CSP already declares `frame-ancestors 'none'`, which is the
     modern equivalent and is honored by all current browsers. The
     `X-Frame-Options` header is kept for legacy browsers that do not
     enforce `frame-ancestors`. If preferred, an equivalent posture can be
     achieved with `Cross-Origin-Opener-Policy: same-origin` (which also
     enables cross-origin isolation features the app does not currently
     require).

### Why these are the operator's responsibility

The application bundle is a static site. It cannot set its own response
headers, and meta-tag forms of `Strict-Transport-Security`,
`X-Content-Type-Options`, and `X-Frame-Options` are not honored by
browsers. Whoever owns the origin (the reverse proxy, CDN, or hosting
platform) is therefore the only party that can install them.

### Reference snippets (optional, copy-paste starters)

Caddy (`Caddyfile`):

```caddyfile
your-domain.example {
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options    "nosniff"
        X-Frame-Options           "DENY"
    }
    root * /var/www/monte-carlo-backtest-analyzer
    file_server
}
```

nginx (`server { ... }` block):

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Content-Type-Options    "nosniff" always;
add_header X-Frame-Options           "DENY"   always;
```

Vercel (`vercel.json`):

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options",    "value": "nosniff" },
        { "key": "X-Frame-Options",           "value": "DENY" }
      ]
    }
  ]
}
```

These snippets are starting points, not a substitute for the operator's
own review against the hosting platform's documentation.


## Cross-references to spec requirements

This document is the canonical home for the threat-model and operational
security guidance called out by `.kiro/specs/code-review-remediation/`. The
table below maps each section above to the requirement that owns it, so a
future audit can verify coverage without re-reading the entire spec.

| Section | Owning requirement(s) |
| --- | --- |
| Posture summary | Requirement 26.1 (browser-only single-user, IndexedDB-only persistence) |
| Trust boundaries | Requirement 26.1 (browser ↔ user CSV, main thread ↔ Worker, Worker ↔ WASM_Kernel, origin ↔ IndexedDB) |
| Sensitive data classes | Requirement 26.1 (Trade_Data, run history) |
| Secret rotation procedure | Requirement 1.1, 1.5 (no shipped key; documented rotation + `git log --all -S 'AIzaSy'` audit) |
| Pre-commit secret scanning | Requirement 1.4 (`AIzaSy[A-Za-z0-9_-]{33}` blocked at commit time) |
| Incident response | Requirement 1.5 (post-rotation audit and disclosure) |
| Loopback-only dev server (referenced) | Requirement 2.1, 2.2, 2.3 — implementation lives in `package.json` (`dev` script binds to `127.0.0.1`) and `vite.config.ts` (`server.host = '127.0.0.1'`, `server.allowedHosts = ['localhost']`) |
| CSP and referrer policy (referenced) | Requirement 2.4, 2.5 — implementation lives in `index.html` (`<meta http-equiv="Content-Security-Policy">` with `'wasm-unsafe-eval'`, `worker-src 'self' blob:`, `frame-ancestors 'none'`; `<meta name="referrer" content="strict-origin-when-cross-origin">`) |
| Operator-side hardening | Requirement 2.7 (HSTS, `X-Content-Type-Options`, `X-Frame-Options` at the web-server layer) |
| CI install and audit guidance | Requirement 3.4, 3.5 (`npm ci`, `--ignore-scripts` allowlist, `npm audit --omit=dev`, `cargo audit`) |
| IndexedDB hygiene (referenced) | Requirement 15.1, 15.2, 15.3, 15.4, 15.5 — implementation lives in `src/runHistory.ts` (`MAX_STORED_RUNS = 50` retention cap, oldest-first eviction, histogram-summarized PnL arrays) and `src/components/RunHistoryPanel.tsx` (one-line "stored locally, unencrypted" disclosure, audit-log size indicator, export-confirmation modal) |
| Cross-references (this section) | Requirement 26.2 |

Rows tagged `(referenced)` describe controls whose implementation lives
outside this document. The cross-reference is included so a future audit
of `SECURITY.md` does not have to re-derive which file owns each
requirement: the loopback-only dev server, the CSP and referrer meta
tags, and the IndexedDB retention cap and storage-disclosure UI are all
in scope for the threat model captured here, but are enforced in
`package.json` / `vite.config.ts`, `index.html`, and
`src/runHistory.ts` / `src/components/RunHistoryPanel.tsx` respectively.
