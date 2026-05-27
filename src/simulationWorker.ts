import { runSimulation } from './simulationEngine';
import { runPortfolioSimulation } from './portfolioEngine';
import { computePositionSizingRecommendation } from './positionSizing';

self.onmessage = async (e: MessageEvent) => {
  try {
    const onProgress = (completed: number, total: number) => {
      self.postMessage({ type: 'progress', completed, total });
    };

    if (e.data.modelType === 'portfolio') {
      const result = await runPortfolioSimulation({ ...e.data, onProgress });
      self.postMessage({ type: 'result', data: result });
      return;
    }

    const result = await runSimulation({ ...e.data, onProgress });

    if ((e.data.modelType === 'parametric' || e.data.modelType === 'garch') && e.data.computePositionSizing) {
      const pnls = result.finalBalances.map(
        (b: number) => b - e.data.startingCapital
      );
      const mean = pnls.reduce((s: number, v: number) => s + v, 0) / pnls.length;
      const std = Math.sqrt(
        pnls.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / Math.max(1, pnls.length - 1)
      );
      result.positionSizing = await computePositionSizingRecommendation({
        data: e.data.data,
        dataFormat: e.data.dataFormat,
        startingCapital: e.data.startingCapital,
        ruinThreshold: e.data.ruinThreshold,
        commissionPerTrade: e.data.commissionPerTrade ?? 0,
        randomSeed: e.data.randomSeed ?? null,
        rowFrequency: e.data.rowFrequency,
        periodsPerYear: e.data.periodsPerYear,
        baselineRuin: result.ruinProbability,
        baselineCvar95: result.institutionalMetrics.cvar95,
        baselineStdPnL: std,
        baselineMeanPnL: mean,
      });
    }

    self.postMessage({ type: 'result', data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Simulation failed';
    self.postMessage({ type: 'error', error: message });
  }
};
