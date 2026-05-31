/**
 * csvExport.ts
 *
 * Pure CSV-export builder extracted from `App.tsx:handleDownload`.
 *
 * No React imports. Independently testable from a `tsx` script.
 *
 * The metrics-validity gate lives here: when
 * `results.metricsValidity.terminalPnL === false` (e.g. permutation
 * sampling on absolute PnL, where every path lands on the same terminal
 * balance), the audit row values for `var_95` and `cvar_95` are written
 * as the literal string `"N/A"` rather than as numerically-degenerate
 * numbers that would mislead a downstream auditor.
 *
 * Output layout (matches the legacy in-App.tsx CSV byte-for-byte):
 *
 *   # Run metadata
 *   <Papa.unparse(metaRows)>
 *
 *   # Simulation paths
 *   <Papa.unparse(pathRows)>
 *
 *   # Portfolio regime breakdown   (only when present)
 *   <Papa.unparse(regimeRows)>
 */

import Papa from 'papaparse';
import type { SimulationResults } from './types';

export interface BuildResultsCsvOptions {
  /** The active model tab; surfaced for forward-compatibility (e.g. tagging) and to match the worker-protocol modelType. */
  activeTab: 'basic' | 'regime' | 'parametric' | 'portfolio' | 'garch';
  /** Starting capital used to back out the per-path Terminal PnL column. */
  startingCapital: number;
}

/**
 * Build the audit-friendly results CSV as a `Blob`.
 *
 * Pure function: identical inputs produce a byte-identical Blob.  Caller is
 * responsible for triggering the actual download (`URL.createObjectURL`,
 * temporary `<a>` element, click, revoke).
 */
export function buildResultsCsvBlob(
  results: SimulationResults,
  options: BuildResultsCsvOptions
): Blob {
  const { startingCapital } = options;

  // --- Per-path rows -------------------------------------------------------
  const pathRows: Array<Record<string, number>> = [];
  for (let i = 0; i < results.finalBalances.length; i++) {
    pathRows.push({
      'Simulation Path': i + 1,
      'Final Balance': results.finalBalances[i],
      'Max Drawdown': results.maxDrawdowns[i],
      'Terminal PnL': results.finalBalances[i] - startingCapital,
    });
  }

  // --- Run metadata rows ---------------------------------------------------
  // Metrics-validity gate: when terminalPnL metrics are degenerate (e.g.
  // permutation + absolute), VaR / CVaR are emitted as the literal "N/A".
  const terminalPnLValid = results.metricsValidity.terminalPnL;

  const metaRows: Array<{ Field: string; Value: string }> = [
    { Field: 'run_id', Value: results.runMeta.runId },
    { Field: 'timestamp', Value: results.runMeta.timestamp },
    { Field: 'model', Value: results.runMeta.modelType },
    { Field: 'sampling', Value: results.runMeta.samplingMode },
    {
      Field: 'portfolio_resampling',
      Value: results.portfolioMeta?.resampling ?? '',
    },
    { Field: 'seed', Value: String(results.runMeta.randomSeed ?? '') },
    { Field: 'n_simulations', Value: String(results.runMeta.nSimulations) },
    {
      Field: 'terminal_pnl_metrics_valid',
      Value: String(terminalPnLValid),
    },
    {
      Field: 'var_95',
      Value: terminalPnLValid
        ? String(results.institutionalMetrics.var95)
        : 'N/A',
    },
    {
      Field: 'cvar_95',
      Value: terminalPnLValid
        ? String(results.institutionalMetrics.cvar95)
        : 'N/A',
    },
    { Field: 'ruin_probability_pct', Value: String(results.ruinProbability) },
  ];

  if (results.positionSizing) {
    metaRows.push(
      {
        Field: 'position_scale_recommended',
        Value: String(results.positionSizing.recommendedScale),
      },
      {
        Field: 'position_scale_ruin_pct',
        Value: String(results.positionSizing.projectedAtRecommended.ruinProbability),
      },
      {
        Field: 'position_scale_cvar_95',
        Value: String(results.positionSizing.projectedAtRecommended.cvar95),
      }
    );
  }

  if (results.portfolioMeta?.regimeBreakdown?.length) {
    metaRows.push({ Field: 'regime_breakdown', Value: 'see below' });
  }

  // --- Assemble sections ---------------------------------------------------
  let csv =
    '# Run metadata\n' +
    Papa.unparse(metaRows) +
    '\n\n# Simulation paths\n' +
    Papa.unparse(pathRows);

  if (results.portfolioMeta?.regimeBreakdown?.length) {
    csv +=
      '\n\n# Portfolio regime breakdown\n' +
      Papa.unparse(
        results.portfolioMeta.regimeBreakdown.map((r) => ({
          regime: r.label,
          segment_id: r.segmentId,
          trades: r.tradeCount,
          mean_pnl: r.meanPnL,
          win_rate_pct: r.winRate,
          var_95: r.var95,
          cvar_95: r.cvar95,
          ruin_pct: r.ruinProbability,
        }))
      );
  }

  return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
}

/**
 * Convenience helper: derive the canonical filename used by the legacy
 * App.tsx download link. Caller-side concern, but kept beside the builder
 * so the wiring task (5.13) has a single import surface.
 */
export function buildResultsCsvFilename(activeTab: BuildResultsCsvOptions['activeTab']): string {
  return `monte_carlo_results_${activeTab}.csv`;
}
