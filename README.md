# Monte Carlo Backtest Analyzer

Institutional-style Monte Carlo risk engine for trading backtests: reproducible simulations, tail-risk metrics (VaR/CVaR), prop-firm evaluation, and audit-friendly CSV exports.

## Run locally

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
```

Open http://localhost:3000

**No CSV handy?** Click **"Run a sample tape"** on the analyzer's empty state
(or open `/app?demo=1`) — a bundled synthetic NinjaTrader-format tape
(`public/sample-tape.csv`, generated from a seeded script; no real trader data)
is ingested and the full simulation auto-runs.

## What makes this institutional-grade

| Capability | Purpose |
|------------|---------|
| **Reproducible seeds** | Same inputs → same paths for allocator / risk committee review |
| **Permutation vs bootstrap** | Permutation preserves the trade multiset; bootstrap models replacement risk |
| **VaR / CVaR / skew / kurtosis** | Terminal PnL tail metrics aligned with buy-side reporting |
| **Empirical due-diligence stats** | Win rate, Sharpe/Sortino (correct annualization), Kelly, recovery factor |
| **Prop firm presets** | FTMO, Apex, TopOneFutures — configurable rules |
| **Run metadata export** | CSV includes run id, seed, model, VaR for audit trails |
| **Model validation (SR 11-7 style)** | KS / AD goodness-of-fit, Ljung–Box serial-dep, Kupiec POF + Christoffersen independence VaR backtests, PIT calibration |
| **EVT tail risk** | Hill tail index, peaks-over-threshold GPD via PWM, EVT-VaR/CVaR alongside empirical |
| **Benchmark attribution** | Alpha/beta with HC0 robust SE, R², tracking error, information ratio, up/down capture |
| **Multi-factor attribution** | OLS regression on N factor columns (e.g. Fama-French 3-factor) with HC0 robust SEs, per-factor t-stats and p-values |
| **Walk-forward / OOS validation** | Train/test split with Kupiec, PIT, and KS scoring on the held-out window |
| **Calendar-aware analytics** | Daily Sharpe, worst day, day-of-week breakdown, max losing-day streak when a timestamp column is provided |
| **Persisted run history** | IndexedDB-backed audit log with reproducibility check and JSON export |

## Data format

Upload CSV with at least one numeric PnL column. Supported formats:

- **Absolute** — dollar PnL per row (e.g. `150`, `-20`, `($50)`)
- **Percentage** — percent return per row (e.g. `1.5` = 1.5%)
- **Multiplier** — decimal return (e.g. `0.015`)

Set **Row frequency** to *trade* or *day* so Sharpe/Sortino annualization matches your data.

## Simulation models

1. **Trade Sequence MC** — permutation (default) or bootstrap resampling
2. **Regime-Switching** — Markov transitions between regime-tagged returns
3. **Parametric (Student-t, ν=3)** — fat-tailed synthetic draws from empirical mean/vol
4. **Multi-Strategy Portfolio** — upload one CSV with a PnL column per strategy (rows aligned by trade index); set sleeve weights; view correlation matrix and combined Monte Carlo paths

### Portfolio CSV example

| trade | Strategy_A | Strategy_B | Strategy_C |
|-------|------------|------------|------------|
| 1     | 120        | -50        | 30         |
| 2     | -80        | 90         | 10         |

Enable columns in the Portfolio tab, normalize weights to 100%, run with **Absolute PnL** format.

**Correlated resampling (default):** Portfolio mode uses **Gaussian copula bootstrap** (Cholesky of the empirical correlation matrix, draws **with replacement** each trade step). The sidebar “Permutation” setting applies to single-strategy tabs only — portfolio always bootstraps so terminal PnL has real variance.

## Roadmap to compete with full institutional stacks

- ~~Block bootstrap for serial correlation~~ (shipped)
- ~~Calendar-based daily loss limits (timestamp column)~~ (historical aggregates shipped; engine-level enforcement pending wasm rebuild)
- ~~PDF investor / risk memos~~ (shipped via vector PDF export)
- ~~Multi-strategy portfolios and correlation~~ (shipped)
- ~~Model-risk validation report (SR 11-7 style)~~ (shipped)
- ~~EVT loss-tail analysis~~ (shipped)
- ~~Benchmark / factor attribution~~ (shipped)
- ~~Multi-factor attribution (HC0)~~ (shipped)
- ~~Walk-forward / out-of-sample validation~~ (shipped)
- ~~Persisted run history with audit trail~~ (shipped — local IndexedDB)
- Server-side batch runs with role-based access
- Position-aware mode (size, instrument, exposure adjusted metrics)
- Wasm-side calendar enforcement of daily loss limits during simulation

## Standalone PDF export (`exportPdf.ts`)

`exportPdf.ts` at the repo root is an ad-hoc Puppeteer driver that automates the
"Export Institutional Tear Sheet (PDF)" flow against a running dev server. It
uploads a CSV, switches to the Multi-Strategy Portfolio tab in Dynamic Copula
mode, runs the simulation, and clicks the export button.

The dev server must already be running before invoking the script; it does not
start one for you.

```bash
# In one terminal:
npm run dev

# In another terminal:
npx tsx exportPdf.ts <inputCsv> [outputDir]

# Or via environment variables (CLI args take precedence):
INPUT_CSV=/path/to/trades.csv OUTPUT_DIR=/path/to/output \
  APP_URL=http://localhost:3000 npx tsx exportPdf.ts
```

`APP_URL` defaults to `http://localhost:3000` (matches `npm run dev`).
`OUTPUT_DIR` defaults to the current working directory.

## Running tests

Sanity tests are pure-TS scripts under `src/__tests__/`, run directly with
`tsx` (no Jest / Vitest). Each file prints `PASS` / `FAIL` and exits non-zero
on failure.

Run a single test:

```bash
npx tsx src/__tests__/sanity_institutional.test.ts
```

Run all sanity tests at once with the aggregator — recommended as a local
pre-commit smoke step:

```bash
npx tsx src/__tests__/run_all.test.ts
```

The aggregator auto-discovers `*.test.ts` files in `src/__tests__/`, runs them
sequentially, prints a per-test PASS/FAIL line, and exits non-zero if any
test fails. The end-to-end test (`e2e_real_data.test.ts`) is skipped unless
`MC_E2E_CSV` points at a NinjaTrader CSV.

`npm run lint` (= `tsc --noEmit`) is the type-check pass and complements the
sanity tests.

## Disclaimer

Monte Carlo output describes outcomes under stated resampling assumptions. It is not a forecast of future performance.

## Accessibility

Charts (`Plots.tsx`, `ConvergencePanel.tsx`, `TimestampAnalyticsPanel.tsx`) and
the correlation heatmap (`PortfolioPanel.tsx`) ship a baseline accessibility
pass: chart wrappers expose `role="img"` with a summarizing `aria-label`, and
the correlation heatmap dual-encodes sign and magnitude (sign glyph and bold
weight in addition to color) so it stays legible to red/green colorblind users.

This is a baseline only. Full WCAG 2.1 AA validation requires manual testing
with assistive technologies (NVDA, JAWS, VoiceOver, axe-core) and is out of
scope for this remediation pass.
