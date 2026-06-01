/*
 * src/pages/Bench.tsx — PROTOTYPE PREVIEW (route: /bench)
 *
 * Non-destructive showcase of the "Bench Instrument" Verdict rebuild. Renders
 * the new ChallengeVerdictBench in BOTH light and dark, across three real data
 * states — including the load-bearing regression anchor (walk-forward FAIL,
 * +$42 → −$11/trade) and the honest n<50 null state. The live app is untouched;
 * delete this page + the /bench route to remove the prototype entirely.
 *
 * Mock data only — this surface computes nothing.
 */
import type { ReactElement } from 'react';
import {
  ChallengeVerdictBench,
  type BenchVerdictData,
} from '../components/bench/ChallengeVerdictBench';

const STATES: ReadonlyArray<{ id: string; label: string; data: BenchVerdictData }> = [
  {
    id: 'anchor',
    label: 'STATE·01 / regression anchor — edge fails out-of-sample',
    data: {
      passRate: 34,
      nSimulations: 10000,
      binding: 'drawdown',
      walkForward: {
        verdict: 'fail',
        trainMean: 42,
        oosMean: -11,
        note: 'Edge collapses out-of-sample: a +$42/trade in-sample mean decays to −$11/trade on the held-out tail. The backtest was curve-fit.',
      },
      nTrades: 214,
      meta: { seed: 50, ts: '2026-04-08 14:21 UTC' },
    },
  },
  {
    id: 'pass',
    label: 'STATE·02 / edge holds — high pass odds',
    data: {
      passRate: 86,
      nSimulations: 10000,
      binding: 'consistency',
      walkForward: {
        verdict: 'pass',
        trainMean: 31,
        oosMean: 24,
        note: 'Edge holds out-of-sample within tolerance: +$31 in-sample, +$24/trade on held-out data.',
      },
      nTrades: 412,
      meta: { seed: 7, ts: '2026-05-02 09:03 UTC' },
    },
  },
  {
    id: 'null',
    label: 'STATE·03 / honesty gate — too few trades for an OOS test',
    data: {
      passRate: 61,
      nSimulations: 10000,
      binding: 'time / no target',
      walkForward: null,
      nTrades: 31,
      meta: { seed: 99, ts: '2026-05-19 17:44 UTC' },
    },
  },
];

function Pane({
  theme,
  data,
}: {
  theme: 'dark' | 'light';
  data: BenchVerdictData;
}): ReactElement {
  return (
    <div
      className="bench-root rounded-md p-6 sm:p-8"
      data-bench-theme={theme}
      style={{ border: '1px solid var(--bench-bezel)' }}
    >
      <div className="bench-label mb-4">{theme}</div>
      <ChallengeVerdictBench data={data} />
    </div>
  );
}

export function Bench(): ReactElement {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#0a0a0a',
        color: '#e9e7df',
        fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace",
      }}
    >
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10">
          <div style={{ fontSize: 11, letterSpacing: '0.18em', color: '#46e6c8' }}>
            EDGECHECK · REBUILD PROTOTYPE
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, marginTop: 8, letterSpacing: '-0.01em' }}>
            Bench Instrument — Challenge Verdict / cv-01
          </h1>
          <p style={{ fontSize: 12, lineHeight: 1.7, color: '#9ca09a', marginTop: 10, maxWidth: '60ch' }}>
            Premium-quant-terminal direction. Warm graphite housing, bone labels, one scarce ion
            accent (mint-cyan, not AI-blue/purple), mono part-codes + tabular numbers, hairline
            bezels instead of floating cards. Scoped tokens only — the live app and global theme are
            untouched. Display face renders in the current grotesk until Bricolage/Geist is
            self-hosted.
          </p>
        </header>

        <div className="flex flex-col gap-12">
          {STATES.map((s) => (
            <section key={s.id}>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', color: '#6a6f69', marginBottom: 12 }}>
                {s.label}
              </div>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Pane theme="dark" data={s.data} />
                <Pane theme="light" data={s.data} />
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
