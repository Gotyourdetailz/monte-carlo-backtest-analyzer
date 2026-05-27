/**
 * timestampAnalytics.ts
 *
 * Calendar-aware analytics that activate when the user provides a
 * timestamp column. These let us replace the trades-per-session proxy
 * with real daily aggregation and surface analytics that allocators ask
 * for ("worst day", "max losing streak in days", "Tuesday performance").
 *
 * Engine-level enforcement of *true* calendar daily-loss limits during
 * Monte Carlo simulation requires shipping wasm rebuilds; that is out of
 * scope for this pass. We expose historical aggregates only.
 */

export type DailyAggregate = {
  date: string; // ISO YYYY-MM-DD in user's local timezone
  pnl: number;
  trades: number;
  /** 0 = Sunday … 6 = Saturday (per JS Date.getDay()). */
  dow: number;
};

export type TimestampAnalyticsReport = {
  daily: DailyAggregate[];
  tradingDays: number;
  totalTrades: number;
  winDays: number;
  lossDays: number;
  /** Worst single trading day (most negative PnL). */
  worstDay: DailyAggregate | null;
  /** Best single trading day. */
  bestDay: DailyAggregate | null;
  /** Mean / std of daily PnL, and annualised daily Sharpe. */
  dailyMean: number;
  dailyStd: number;
  dailySharpe: number;
  /** Longest consecutive losing-day streak. */
  maxLosingDayStreak: number;
  /** Longest consecutive winning-day streak. */
  maxWinningDayStreak: number;
  /** Day-of-week breakdown: PnL totals and counts. */
  byDayOfWeek: Array<{
    dow: number;
    label: string;
    days: number;
    totalPnL: number;
    avgPnL: number;
    winRate: number; // 0-100
  }>;
  /** Number of days that would breach a given $ daily-loss limit. */
  estimatedDailyLimitBreaches: (limit: number) => number;
};

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toLocalISODate(d: Date): string {
  // YYYY-MM-DD in local time, avoiding UTC drift that .toISOString() introduces.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Lenient timestamp parser: accepts ISO 8601, common US formats, and
 * NinjaTrader's "MM/DD/YYYY HH:MM:SS" style.
 */
export function parseTimestamp(raw: unknown): Date | null {
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'number' && isFinite(raw)) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Direct attempt
  const direct = new Date(trimmed);
  if (!isNaN(direct.getTime())) return direct;
  // NinjaTrader-style "M/D/YYYY HH:MM:SS"
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const month = Number(m[1]) - 1;
    const day = Number(m[2]);
    const year = Number(m[3]);
    const hour = m[4] ? Number(m[4]) : 0;
    const min = m[5] ? Number(m[5]) : 0;
    const sec = m[6] ? Number(m[6]) : 0;
    return new Date(year, month, day, hour, min, sec);
  }
  return null;
}

/** Build per-day aggregates from aligned timestamp + PnL arrays. */
export function aggregateByDay(timestamps: Date[], pnl: number[]): DailyAggregate[] {
  if (timestamps.length !== pnl.length) {
    throw new Error('aggregateByDay: timestamps and pnl must align');
  }
  const map = new Map<string, DailyAggregate>();
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    if (!t || isNaN(t.getTime())) continue;
    const key = toLocalISODate(t);
    const cur = map.get(key);
    if (cur) {
      cur.pnl += pnl[i];
      cur.trades += 1;
    } else {
      map.set(key, { date: key, pnl: pnl[i], trades: 1, dow: t.getDay() });
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildTimestampAnalyticsReport(
  timestamps: Date[],
  pnl: number[]
): TimestampAnalyticsReport {
  const daily = aggregateByDay(timestamps, pnl);
  const tradingDays = daily.length;
  const totalTrades = daily.reduce((s, d) => s + d.trades, 0);

  let winDays = 0, lossDays = 0;
  let bestDay: DailyAggregate | null = null;
  let worstDay: DailyAggregate | null = null;
  let sum = 0, sumSq = 0;
  let curWin = 0, curLoss = 0, maxWin = 0, maxLoss = 0;

  for (const d of daily) {
    sum += d.pnl;
    sumSq += d.pnl * d.pnl;
    if (d.pnl > 0) {
      winDays++;
      curWin++;
      curLoss = 0;
      if (curWin > maxWin) maxWin = curWin;
    } else if (d.pnl < 0) {
      lossDays++;
      curLoss++;
      curWin = 0;
      if (curLoss > maxLoss) maxLoss = curLoss;
    } else {
      curWin = 0;
      curLoss = 0;
    }
    if (!bestDay || d.pnl > bestDay.pnl) bestDay = d;
    if (!worstDay || d.pnl < worstDay.pnl) worstDay = d;
  }

  const mean = tradingDays > 0 ? sum / tradingDays : 0;
  const variance =
    tradingDays > 1 ? (sumSq - tradingDays * mean * mean) / (tradingDays - 1) : 0;
  const std = Math.sqrt(Math.max(0, variance));
  const dailySharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

  // Day-of-week breakdown
  const dowAgg = new Map<number, { days: number; totalPnL: number; wins: number }>();
  for (let i = 0; i < 7; i++) dowAgg.set(i, { days: 0, totalPnL: 0, wins: 0 });
  for (const d of daily) {
    const a = dowAgg.get(d.dow)!;
    a.days += 1;
    a.totalPnL += d.pnl;
    if (d.pnl > 0) a.wins += 1;
  }
  const byDayOfWeek = [...dowAgg.entries()]
    .filter(([_, a]) => a.days > 0)
    .map(([dow, a]) => ({
      dow,
      label: DOW_LABELS[dow],
      days: a.days,
      totalPnL: a.totalPnL,
      avgPnL: a.totalPnL / a.days,
      winRate: (a.wins / a.days) * 100,
    }));

  return {
    daily,
    tradingDays,
    totalTrades,
    winDays,
    lossDays,
    worstDay,
    bestDay,
    dailyMean: mean,
    dailyStd: std,
    dailySharpe,
    maxLosingDayStreak: maxLoss,
    maxWinningDayStreak: maxWin,
    byDayOfWeek,
    estimatedDailyLimitBreaches: (limit: number) =>
      daily.filter((d) => d.pnl <= -Math.abs(limit)).length,
  };
}
