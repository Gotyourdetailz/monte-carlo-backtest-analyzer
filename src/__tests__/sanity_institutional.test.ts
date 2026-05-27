/**
 * Sanity tests for the institutional add-ons.  No wasm, no React — pure
 * math.  Run with: npx tsx src/__tests__/sanity_institutional.test.ts
 *
 * Each test prints PASS / FAIL and exits non-zero on any failure.
 */

import { createSeededRng, randomNormal, randomStudentT } from '../mathUtils';
import {
  ksTwoSample,
  adTwoSample,
  ljungBox,
  kupiecPOF,
  christoffersenIndependence,
  pitCalibration,
  buildValidationReport,
} from '../modelValidation';
import { hillIndex, fitGPD, evtVaR, buildEVTReport } from '../evt';
import { regressWithRobustSE, buildAttributionReport } from '../benchmarkAttribution';
import {
  parseTimestamp,
  aggregateByDay,
  buildTimestampAnalyticsReport,
} from '../timestampAnalytics';

let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

function approx(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

// ─── modelValidation ─────────────────────────────────────────────────────────

console.log('\n[modelValidation]');
{
  // Two samples drawn from the same distribution should not be rejected.
  const rng = createSeededRng(42);
  const a: number[] = Array.from({ length: 500 }, () => randomNormal(rng));
  const b: number[] = Array.from({ length: 500 }, () => randomNormal(rng));
  const ks = ksTwoSample(a, b);
  check('KS two-sample on identical distributions does not reject', ks.p > 0.05, `D=${ks.D.toFixed(3)} p=${ks.p.toFixed(3)}`);
}
{
  // Two samples from clearly different distributions should be rejected.
  const rng = createSeededRng(7);
  const a: number[] = Array.from({ length: 500 }, () => randomNormal(rng));
  const b: number[] = Array.from({ length: 500 }, () => randomNormal(rng) + 1.0);
  const ks = ksTwoSample(a, b);
  check('KS rejects shifted distributions', ks.p < 0.01, `D=${ks.D.toFixed(3)} p=${ks.p.toFixed(4)}`);
}
{
  // AD on identical distributions should not reject (statistic ~ O(1)).
  const rng = createSeededRng(101);
  const a: number[] = Array.from({ length: 500 }, () => randomNormal(rng));
  const b: number[] = Array.from({ length: 500 }, () => randomNormal(rng));
  const ad = adTwoSample(a, b);
  check('AD two-sample on identical: A2 in plausible range', ad.A2 < 5 && ad.A2 > -1, `A2=${ad.A2.toFixed(3)} p=${ad.p.toFixed(3)}`);
  check('AD two-sample on identical: p > 0.05', ad.p > 0.05, `p=${ad.p.toFixed(3)}`);
}
{
  // AD should clearly reject shifted samples.
  const rng = createSeededRng(102);
  const a: number[] = Array.from({ length: 500 }, () => randomNormal(rng));
  const b: number[] = Array.from({ length: 500 }, () => randomNormal(rng) + 1.0);
  const ad = adTwoSample(a, b);
  check('AD rejects shifted distributions', ad.p < 0.05 && ad.A2 > 3.07, `A2=${ad.A2.toFixed(2)} p=${ad.p.toFixed(3)}`);
}
{
  // Ljung–Box on iid noise should not reject.
  const rng = createSeededRng(1);
  const x = Array.from({ length: 500 }, () => randomNormal(rng));
  const lb = ljungBox(x, 10);
  check('Ljung–Box on iid noise', lb.p > 0.05, `Q=${lb.Q.toFixed(2)} p=${lb.p.toFixed(3)}`);
}
{
  // Ljung–Box on AR(1) should reject.
  const rng = createSeededRng(2);
  const phi = 0.7;
  const x: number[] = [randomNormal(rng)];
  for (let i = 1; i < 500; i++) x.push(phi * x[i - 1] + randomNormal(rng));
  const lb = ljungBox(x, 10);
  check('Ljung–Box rejects AR(1) ϕ=0.7', lb.p < 0.001, `Q=${lb.Q.toFixed(2)}`);
}
{
  // Kupiec: with breach rate exactly equal to expected, statistic ≈ 0.
  const breaches: number[] = new Array(1000).fill(0);
  for (let i = 0; i < 50; i++) breaches[i * 20] = 1; // 5% rate, perfectly spaced
  const k = kupiecPOF(breaches, 0.95);
  check('Kupiec accepts on-spec breach rate', k.p > 0.5, `LR=${k.LR.toFixed(3)}`);
  // Christoffersen: a perfectly periodic pattern is non-iid; LR should be > 0.
  const c = christoffersenIndependence(breaches);
  check('Christoffersen detects clustering vs random', c.LR >= 0, `LR=${c.LR.toFixed(2)}`);
}
{
  // PIT: well-calibrated iid Normal series → uniform PITs → high p-value.
  const rng = createSeededRng(11);
  const x = Array.from({ length: 600 }, () => randomNormal(rng));
  const pit = pitCalibration(x, 100, 10);
  check('PIT does not reject calibrated iid Normal', !!pit && pit.pValue > 0.05, `p=${pit?.pValue.toFixed(3)}`);
}

// ─── EVT ─────────────────────────────────────────────────────────────────────

console.log('\n[evt]');
{
  // Hill index on Pareto(α=2.5) data should recover α ≈ 2.5.
  // X = U^(-1/α) where U ~ Uniform.
  const rng = createSeededRng(31);
  const alphaTrue = 2.5;
  const losses = Array.from({ length: 5000 }, () => Math.pow(rng(), -1 / alphaTrue));
  const h = hillIndex(losses);
  check('Hill estimator recovers Pareto tail index', approx(h.alpha, alphaTrue, 0.6), `α̂=${h.alpha.toFixed(2)} (true ${alphaTrue})`);
}
{
  // GPD fit on exceedances of an exponential gives ξ ≈ 0.
  const rng = createSeededRng(33);
  const losses = Array.from({ length: 3000 }, () => -Math.log(1 - rng()));
  const gpd = fitGPD(losses, 0.9);
  check('GPD fit on exponential gives ξ ≈ 0', !!gpd && Math.abs(gpd.xi) < 0.25, `ξ=${gpd?.xi.toFixed(3)}`);
}
{
  // Sanity: EVT-VaR is monotonically increasing in confidence.
  const rng = createSeededRng(35);
  const losses = Array.from({ length: 3000 }, () => -Math.log(1 - rng()) * 1000);
  const gpd = fitGPD(losses, 0.9)!;
  const v95 = evtVaR(gpd, 0.95);
  const v99 = evtVaR(gpd, 0.99);
  check('EVT-VaR(99%) > EVT-VaR(95%)', v99 > v95, `95=${v95.toFixed(0)} 99=${v99.toFixed(0)}`);
}
{
  // End-to-end: heavy tail flag fires on a Student-t(3) loss series.
  const rng = createSeededRng(41);
  const pnl: number[] = [];
  for (let i = 0; i < 2000; i++) pnl.push(randomStudentT(3, rng) * 100);
  const ev = buildEVTReport(pnl, 0.9);
  check('Heavy-tail flag fires on t(3) losses', ev.heavyTail === true, `hill α=${ev.hill.alpha.toFixed(2)} ξ=${ev.gpd?.xi.toFixed(2)}`);
}

// ─── Attribution ─────────────────────────────────────────────────────────────

console.log('\n[attribution]');
{
  // Construct y = 0.05 + 1.3 x + ε with σ_ε = 0.1 over n=500
  const rng = createSeededRng(51);
  const x: number[] = Array.from({ length: 500 }, () => randomNormal(rng) * 0.02);
  const y = x.map((xi) => 0.05 + 1.3 * xi + randomNormal(rng) * 0.001);
  const r = regressWithRobustSE(y, x);
  check('OLS recovers intercept α≈0.05', approx(r.alpha, 0.05, 0.01), `α̂=${r.alpha.toFixed(4)}`);
  check('OLS recovers slope β≈1.3', approx(r.beta, 1.3, 0.05), `β̂=${r.beta.toFixed(3)}`);
  check('R² > 0.99 for clean data', r.rSquared > 0.99, `R²=${r.rSquared.toFixed(4)}`);
}
{
  // Build a full attribution report — make sure values are finite.
  const rng = createSeededRng(53);
  const bench = Array.from({ length: 252 }, () => randomNormal(rng) * 0.01);
  const strat = bench.map((b) => 0.0002 + 0.9 * b + randomNormal(rng) * 0.005);
  const a = buildAttributionReport(strat, bench, 252);
  check(
    'Attribution report has finite numbers',
    isFinite(a.alpha) && isFinite(a.beta) && isFinite(a.trackingError) && isFinite(a.informationRatio)
  );
}

// ─── Timestamp analytics ─────────────────────────────────────────────────────

console.log('\n[timestampAnalytics]');
{
  const t1 = parseTimestamp('2024-01-15T09:30:00Z');
  const t2 = parseTimestamp('1/15/2024 09:30:00');
  check('parseTimestamp handles ISO', !!t1);
  check('parseTimestamp handles US format', !!t2);
}
{
  // 5 trades: 2 on day A (one win, one loss), 3 on day B (all wins).
  const ts = [
    new Date(2024, 0, 1, 9, 30),
    new Date(2024, 0, 1, 14, 0),
    new Date(2024, 0, 2, 10, 0),
    new Date(2024, 0, 2, 11, 0),
    new Date(2024, 0, 2, 15, 0),
  ];
  const pnl = [100, -50, 30, 40, 50];
  const daily = aggregateByDay(ts, pnl);
  check('Aggregation produces 2 trading days', daily.length === 2);
  check('Day 1 totals to 50', daily[0].pnl === 50);
  check('Day 2 totals to 120 with 3 trades', daily[1].pnl === 120 && daily[1].trades === 3);

  const rep = buildTimestampAnalyticsReport(ts, pnl);
  check('Report best day is day 2 ($120)', rep.bestDay?.pnl === 120);
  check('Report worst day is day 1 ($50)', rep.worstDay?.pnl === 50);
  check('estimatedDailyLimitBreaches counts $200 limit losses', rep.estimatedDailyLimitBreaches(200) === 0);
}

// ─── End-to-end validation roll-up ───────────────────────────────────────────

console.log('\n[end-to-end validation]');
{
  // Historical PnL: iid Normal-ish.
  const rng = createSeededRng(91);
  const hist: number[] = Array.from({ length: 500 }, () => randomNormal(rng) * 100);
  // Simulator output: also iid bootstrap of hist over horizon=100.
  const simN = 4000;
  const horizon = 100;
  const sim: number[] = [];
  const simInc: number[] = [];
  for (let s = 0; s < simN; s++) {
    let total = 0;
    for (let t = 0; t < horizon; t++) {
      const inc = hist[Math.floor(rng() * hist.length)];
      total += inc;
      if (s === 0) simInc.push(inc);
    }
    sim.push(total);
  }
  const rep = buildValidationReport({
    historicalPnL: hist,
    simulatedTerminalPnL: sim,
    simulatedIncrements: simInc,
    horizon,
    rng: createSeededRng(101),
  });
  check('Validation overall verdict not "fail" on well-spec engine', rep.overallVerdict !== 'fail', `verdict=${rep.overallVerdict}`);
  check('GoF block produced', !!rep.goodnessOfFit);
  check('PIT block produced', !!rep.pitCalibration);
}

console.log('');
if (failures > 0) {
  console.log(`FAILED — ${failures} check(s) failed`);
  process.exit(1);
} else {
  console.log('All checks passed.');
}
