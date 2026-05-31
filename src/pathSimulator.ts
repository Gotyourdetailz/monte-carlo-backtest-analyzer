import { DailyData, DataFormat } from './types';

/**
 * Options for `buildHistoricalPath`. Narrowed in Requirement 6.5
 * (F-CQ-04): the historical path never resamples, so `samplingMode` and
 * `rng` are no longer accepted. `nTrades` is also dropped because the
 * function walks the full `data` series — callers that want a horizon
 * cap must `data.slice(0, horizon)` before calling.
 */
export type BuildHistoricalPathOptions = {
  data: DailyData[];
  dataFormat: DataFormat;
  startingCapital: number;
  commissionPerTrade: number;
};

export function toReturnSeries(data: DailyData[], dataFormat: DataFormat): number[] {
  return data.map((d) => {
    if (dataFormat === 'pct') return 1 + d.pnl / 100;
    if (dataFormat === 'mult') return 1 + d.pnl;
    return d.pnl;
  });
}

/** Historical equity curve (no resampling) */
export function buildHistoricalPath(opts: BuildHistoricalPathOptions): number[] {
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
