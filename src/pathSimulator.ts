import { DailyData, DataFormat, SamplingMode } from './types';
import { createSeededRng, shuffleInPlace } from './mathUtils';

export type PathSimulatorOptions = {
  data: DailyData[];
  dataFormat: DataFormat;
  startingCapital: number;
  nTrades: number;
  commissionPerTrade: number;
  samplingMode: SamplingMode;
  rng: () => number;
};

export function toReturnSeries(data: DailyData[], dataFormat: DataFormat): number[] {
  return data.map((d) => {
    if (dataFormat === 'pct') return 1 + d.pnl / 100;
    if (dataFormat === 'mult') return 1 + d.pnl;
    return d.pnl;
  });
}

/** Historical equity curve (no resampling) */
export function buildHistoricalPath(opts: PathSimulatorOptions): number[] {
  const { data, dataFormat, startingCapital, commissionPerTrade } = opts;
  const returns = toReturnSeries(data, dataFormat);
  const path = [startingCapital];
  for (const ret of returns) {
    if (dataFormat === 'absolute') {
      path.push(path[path.length - 1] + ret - commissionPerTrade);
    } else {
      path.push(path[path.length - 1] * ret);
    }
  }
  return path;
}

/** Monte Carlo path via permutation or bootstrap */
export function createPathSimulator(opts: PathSimulatorOptions): () => number[] {
  const {
    data,
    dataFormat,
    startingCapital,
    nTrades,
    commissionPerTrade,
    samplingMode,
    rng,
  } = opts;
  const originalPnLs = toReturnSeries(data, dataFormat);

  return () => {
    const path = [startingCapital];
    let tradeSequence: number[] = [];
    if (samplingMode === 'permutation') {
      const indices = originalPnLs.map((_, i) => i);
      shuffleInPlace(indices, rng);
      tradeSequence = indices.map((i) => originalPnLs[i]);
    }

    for (let t = 0; t < nTrades; t++) {
      const ret =
        samplingMode === 'permutation'
          ? tradeSequence[t % tradeSequence.length]
          : originalPnLs[Math.floor(rng() * originalPnLs.length)];

      if (dataFormat === 'absolute') {
        path.push(path[path.length - 1] + ret - commissionPerTrade);
      } else {
        path.push(path[path.length - 1] * ret);
      }
    }
    return path;
  };
}
