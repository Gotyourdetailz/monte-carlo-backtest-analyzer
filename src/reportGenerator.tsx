import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, pdf } from '@react-pdf/renderer';
import html2canvas from 'html2canvas';
import { SimulationResults } from './types';
import type { ModelValidationReport, TestVerdict } from './modelValidation';
import type { EVTReport } from './evt';
import type { AttributionReport } from './benchmarkAttribution';
import type { TimestampAnalyticsReport } from './timestampAnalytics';

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#0a0e17',
    color: '#e6edf3',
    fontFamily: 'Helvetica',
    padding: 40,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
    paddingBottom: 20,
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: '#58a6ff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 12,
    color: '#8b949e',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 600,
    marginTop: 20,
    marginBottom: 15,
    color: '#e6edf3',
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
    paddingBottom: 5,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
  },
  metricLabel: {
    fontSize: 10,
    color: '#8b949e',
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  metricValue: {
    fontSize: 20,
    fontFamily: 'Courier',
    color: '#e6edf3',
  },
  metricValueGreen: {
    fontSize: 20,
    fontFamily: 'Courier',
    color: '#3fb950',
  },
  metricValueRed: {
    fontSize: 20,
    fontFamily: 'Courier',
    color: '#f85149',
  },
  chartImage: {
    width: '100%',
    marginBottom: 20,
    borderRadius: 8,
  },
  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chartHalf: {
    width: '48%',
    borderRadius: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 10,
    color: '#8b949e',
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: '#30363d',
    paddingTop: 10,
  },
  // Institutional add-ons
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    fontSize: 9,
    fontWeight: 700,
    color: '#0a0e17',
  },
  pillGreen: { backgroundColor: '#3fb950' },
  pillAmber: { backgroundColor: '#d29922' },
  pillRed: { backgroundColor: '#f85149' },
  pillBlue: { backgroundColor: '#58a6ff' },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  panel: {
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#0d1117',
  },
  panelTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#e6edf3',
  },
  noteText: {
    fontSize: 9,
    color: '#8b949e',
    marginTop: 4,
    lineHeight: 1.4,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  kvKey: { fontSize: 10, color: '#8b949e' },
  kvVal: { fontSize: 10, fontFamily: 'Courier', color: '#e6edf3' },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
    paddingBottom: 4,
    marginBottom: 6,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 3,
  },
  th: {
    fontSize: 9,
    color: '#8b949e',
    textTransform: 'uppercase',
    fontWeight: 700,
  },
  td: {
    fontSize: 10,
    fontFamily: 'Courier',
    color: '#e6edf3',
  },
  smallStat: {
    width: '24%',
    marginBottom: 8,
  },
  smallStatLabel: {
    fontSize: 8,
    color: '#8b949e',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  smallStatValue: {
    fontSize: 13,
    fontFamily: 'Courier',
    color: '#e6edf3',
  },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * react-pdf's bundled Helvetica has no Greek code points. Strip them for any
 * free-form text we render into the PDF. The on-screen panels keep Greek.
 */
function pdfSafe(s: string | undefined): string {
  if (!s) return '';
  return s
    .replace(/α/g, 'alpha')
    .replace(/β/g, 'beta')
    .replace(/ξ/g, 'xi')
    .replace(/σ/g, 'sigma')
    .replace(/μ/g, 'mu')
    .replace(/ν/g, 'nu')
    .replace(/—/g, '-')
    .replace(/–/g, '-')
    .replace(/²/g, '2')
    .replace(/³/g, '3');
}

function fmtP(p?: number): string {
  if (p == null || !isFinite(p)) return '—';
  if (p < 0.001) return '<0.001';
  return p.toFixed(3);
}

function fmtNum(v: number | undefined, d = 2): string {
  if (v == null || !isFinite(v)) return '—';
  return v.toFixed(d);
}

function fmtUSD(v: number | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  const abs = Math.abs(v);
  return `${v < 0 ? '-' : ''}$${Math.round(abs).toLocaleString()}`;
}

function fmtPct(v: number | undefined, d = 2): string {
  if (v == null || !isFinite(v)) return '—';
  return `${(v * 100).toFixed(d)}%`;
}

function verdictPillStyle(v: TestVerdict) {
  if (v === 'pass') return [styles.pill, styles.pillGreen];
  if (v === 'warn') return [styles.pill, styles.pillAmber];
  return [styles.pill, styles.pillRed];
}

function verdictLabel(v: TestVerdict): string {
  if (v === 'pass') return 'PASS';
  if (v === 'warn') return 'WARN';
  return 'FAIL';
}

// ─── Section components ─────────────────────────────────────────────────────

const ValidationSection: React.FC<{ v: ModelValidationReport }> = ({ v }) => (
  <View>
    <View style={styles.rowBetween}>
      <Text style={styles.sectionTitle}>Model Validation (SR 11-7 style)</Text>
      <Text style={verdictPillStyle(v.overallVerdict)}>{verdictLabel(v.overallVerdict)}</Text>
    </View>
    <Text style={[styles.noteText, { marginBottom: 10 }]}>{pdfSafe(v.headline)}</Text>

    {v.goodnessOfFit && (
      <View style={styles.panel}>
        <View style={styles.rowBetween}>
          <Text style={styles.panelTitle}>Goodness-of-fit (simulator vs empirical bootstrap)</Text>
          <Text style={verdictPillStyle(v.goodnessOfFit.verdict)}>{verdictLabel(v.goodnessOfFit.verdict)}</Text>
        </View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Kolmogorov-Smirnov D</Text><Text style={styles.kvVal}>{fmtNum(v.goodnessOfFit.ksStatistic, 3)}</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>KS p-value</Text><Text style={styles.kvVal}>{fmtP(v.goodnessOfFit.ksPValue)}</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Anderson-Darling A2</Text><Text style={styles.kvVal}>{fmtNum(v.goodnessOfFit.adStatistic, 3)}</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>AD p-value (approx)</Text><Text style={styles.kvVal}>{fmtP(v.goodnessOfFit.adPValue)}</Text></View>
        <Text style={styles.noteText}>{pdfSafe(v.goodnessOfFit.note)}</Text>
      </View>
    )}

    {v.serialDependence && (
      <View style={styles.panel}>
        <View style={styles.rowBetween}>
          <Text style={styles.panelTitle}>Serial dependence (Ljung-Box, {v.serialDependence.lags} lags)</Text>
          <Text style={verdictPillStyle(v.serialDependence.verdict)}>{verdictLabel(v.serialDependence.verdict)}</Text>
        </View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Empirical Q</Text><Text style={styles.kvVal}>{fmtNum(v.serialDependence.empiricalQ, 2)} (p={fmtP(v.serialDependence.empiricalPValue)})</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Simulated Q</Text><Text style={styles.kvVal}>{fmtNum(v.serialDependence.simulatedQ, 2)} (p={fmtP(v.serialDependence.simulatedPValue)})</Text></View>
        <Text style={styles.noteText}>{pdfSafe(v.serialDependence.note)}</Text>
      </View>
    )}

    {v.varBacktest && (
      <View style={styles.panel}>
        <View style={styles.rowBetween}>
          <Text style={styles.panelTitle}>VaR backtest @ {(v.varBacktest.confidence * 100).toFixed(0)}% (rolling, 100-obs window)</Text>
          <Text style={verdictPillStyle(v.varBacktest.verdict)}>{verdictLabel(v.varBacktest.verdict)}</Text>
        </View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Breaches</Text><Text style={styles.kvVal}>{v.varBacktest.breaches} / {v.varBacktest.observations} (expected {fmtNum(v.varBacktest.expectedBreaches, 1)})</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Kupiec POF LR</Text><Text style={styles.kvVal}>{fmtNum(v.varBacktest.kupiecStatistic, 2)} (p={fmtP(v.varBacktest.kupiecPValue)})</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Christoffersen indep. LR</Text><Text style={styles.kvVal}>{fmtNum(v.varBacktest.christoffersenStatistic, 2)} (p={fmtP(v.varBacktest.christoffersenPValue)})</Text></View>
        <Text style={styles.noteText}>{pdfSafe(v.varBacktest.note)}</Text>
      </View>
    )}

    {v.pitCalibration && (
      <View style={styles.panel}>
        <View style={styles.rowBetween}>
          <Text style={styles.panelTitle}>PIT calibration (chi-square, {v.pitCalibration.bins} bins)</Text>
          <Text style={verdictPillStyle(v.pitCalibration.verdict)}>{verdictLabel(v.pitCalibration.verdict)}</Text>
        </View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Chi-square</Text><Text style={styles.kvVal}>{fmtNum(v.pitCalibration.chiSqStatistic, 2)}</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>p-value</Text><Text style={styles.kvVal}>{fmtP(v.pitCalibration.pValue)}</Text></View>
        <Text style={styles.noteText}>{pdfSafe(v.pitCalibration.note)}</Text>
      </View>
    )}
  </View>
);

const EVTSection: React.FC<{ e: EVTReport }> = ({ e }) => (
  <View>
    <View style={styles.rowBetween}>
      <Text style={styles.sectionTitle}>Extreme Value Theory - Loss Tail</Text>
      <Text style={[styles.pill, e.heavyTail ? styles.pillAmber : styles.pillGreen]}>
        {e.heavyTail ? 'HEAVY TAIL' : 'TAIL BEHAVED'}
      </Text>
    </View>
    <Text style={[styles.noteText, { marginBottom: 10 }]}>{pdfSafe(e.note)}</Text>

    <View style={[styles.metricsGrid, { marginBottom: 6 }]}>
      <View style={styles.smallStat}>
        <Text style={styles.smallStatLabel}>Hill alpha</Text>
        <Text style={styles.smallStatValue}>{isFinite(e.hill.alpha) ? e.hill.alpha.toFixed(2) : '—'}</Text>
      </View>
      <View style={styles.smallStat}>
        <Text style={styles.smallStatLabel}>GPD xi (shape)</Text>
        <Text style={styles.smallStatValue}>{e.gpd ? e.gpd.xi.toFixed(3) : '—'}</Text>
      </View>
      <View style={styles.smallStat}>
        <Text style={styles.smallStatLabel}>GPD beta (scale)</Text>
        <Text style={styles.smallStatValue}>{e.gpd ? `$${e.gpd.beta.toFixed(0)}` : '—'}</Text>
      </View>
      <View style={styles.smallStat}>
        <Text style={styles.smallStatLabel}>Threshold q</Text>
        <Text style={styles.smallStatValue}>{e.gpd ? `${(e.gpd.thresholdQuantile * 100).toFixed(0)}%` : '—'}</Text>
      </View>
    </View>

    <View style={styles.panel}>
      <View style={styles.tableHeader}>
        <Text style={[styles.th, { width: '34%' }]}>Confidence</Text>
        <Text style={[styles.th, { width: '33%' }]}>Empirical</Text>
        <Text style={[styles.th, { width: '33%' }]}>EVT (POT-GPD)</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, { width: '34%', color: '#8b949e' }]}>VaR 95%</Text>
        <Text style={[styles.td, { width: '33%', color: '#f85149' }]}>{fmtUSD(e.varEmpirical95)}</Text>
        <Text style={[styles.td, { width: '33%', color: '#d29922' }]}>{fmtUSD(e.varEvt95)}</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, { width: '34%', color: '#8b949e' }]}>CVaR 95%</Text>
        <Text style={[styles.td, { width: '33%', color: '#f85149' }]}>{fmtUSD(e.cvarEmpirical95)}</Text>
        <Text style={[styles.td, { width: '33%', color: '#d29922' }]}>{fmtUSD(e.cvarEvt95)}</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, { width: '34%', color: '#8b949e' }]}>VaR 99%</Text>
        <Text style={[styles.td, { width: '33%', color: '#f85149' }]}>{fmtUSD(e.varEmpirical99)}</Text>
        <Text style={[styles.td, { width: '33%', color: '#d29922' }]}>{fmtUSD(e.varEvt99)}</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, { width: '34%', color: '#8b949e' }]}>CVaR 99%</Text>
        <Text style={[styles.td, { width: '33%', color: '#f85149' }]}>{fmtUSD(e.cvarEmpirical99)}</Text>
        <Text style={[styles.td, { width: '33%', color: '#d29922' }]}>{fmtUSD(e.cvarEvt99)}</Text>
      </View>
    </View>
    <Text style={styles.noteText}>
      EVT extrapolates beyond the worst observed loss using a GPD fit to peaks above a high threshold. Wide gaps between
      Empirical and EVT in the 99% column indicate that historical worst-case underestimates true tail risk.
    </Text>
  </View>
);

const AttributionSection: React.FC<{ a: AttributionReport }> = ({ a }) => {
  const sig = a.alphaPValue != null && a.alphaPValue < 0.05;
  return (
    <View>
      <View style={styles.rowBetween}>
        <Text style={styles.sectionTitle}>Benchmark Attribution</Text>
        <Text style={[styles.pill, sig ? styles.pillGreen : styles.pillAmber]}>
          {sig ? 'ALPHA SIGNIFICANT' : 'ALPHA NOT SIGNIFICANT'}
        </Text>
      </View>
      <Text style={[styles.noteText, { marginBottom: 10 }]}>
        n = {a.observations.toLocaleString()} · {a.periodsPerYear}/yr · HC0 (White) robust standard errors.
      </Text>

      <View style={styles.metricsGrid}>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>Alpha (ann.)</Text>
          <Text style={styles.smallStatValue}>{fmtPct(a.alphaAnnualized, 2)}</Text>
        </View>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>Beta</Text>
          <Text style={styles.smallStatValue}>{fmtNum(a.beta, 3)}</Text>
        </View>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>α t-stat</Text>
          <Text style={styles.smallStatValue}>{fmtNum(a.alphaT, 2)}</Text>
        </View>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>β t-stat</Text>
          <Text style={styles.smallStatValue}>{fmtNum(a.betaT, 2)}</Text>
        </View>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>R²</Text>
          <Text style={styles.smallStatValue}>{fmtNum(a.rSquared, 3)}</Text>
        </View>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>Tracking err.</Text>
          <Text style={styles.smallStatValue}>{fmtPct(a.trackingError, 2)}</Text>
        </View>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>Info ratio</Text>
          <Text style={styles.smallStatValue}>{fmtNum(a.informationRatio, 2)}</Text>
        </View>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>α p-value</Text>
          <Text style={styles.smallStatValue}>{fmtP(a.alphaPValue)}</Text>
        </View>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>Up capture</Text>
          <Text style={styles.smallStatValue}>{fmtNum(a.upCapture, 2)}</Text>
        </View>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>Down capture</Text>
          <Text style={styles.smallStatValue}>{fmtNum(a.downCapture, 2)}</Text>
        </View>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>Correlation</Text>
          <Text style={styles.smallStatValue}>{fmtNum(a.correlation, 2)}</Text>
        </View>
      </View>
    </View>
  );
};

const TimestampSection: React.FC<{ t: TimestampAnalyticsReport; dailyLossLimit?: number }> = ({ t, dailyLossLimit }) => {
  const breaches = dailyLossLimit && dailyLossLimit > 0 ? t.estimatedDailyLimitBreaches(dailyLossLimit) : null;
  return (
    <View>
      <View style={styles.rowBetween}>
        <Text style={styles.sectionTitle}>Calendar-aware Analytics</Text>
        <Text style={[styles.pill, styles.pillBlue]}>{t.tradingDays.toLocaleString()} TRADING DAYS</Text>
      </View>
      <Text style={[styles.noteText, { marginBottom: 10 }]}>
        Daily Sharpe (annualised): {t.dailySharpe.toFixed(2)}
      </Text>

      <View style={styles.metricsGrid}>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>Win days</Text>
          <Text style={styles.smallStatValue}>{t.winDays} / {t.tradingDays}</Text>
        </View>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>Loss days</Text>
          <Text style={styles.smallStatValue}>{t.lossDays} / {t.tradingDays}</Text>
        </View>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>Best day</Text>
          <Text style={styles.smallStatValue}>{fmtUSD(t.bestDay?.pnl)}</Text>
        </View>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>Worst day</Text>
          <Text style={[styles.smallStatValue, { color: '#f85149' }]}>{fmtUSD(t.worstDay?.pnl)}</Text>
        </View>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>Daily mean</Text>
          <Text style={styles.smallStatValue}>{fmtUSD(t.dailyMean)}</Text>
        </View>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>Daily σ</Text>
          <Text style={styles.smallStatValue}>{fmtUSD(t.dailyStd)}</Text>
        </View>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>Max losing streak</Text>
          <Text style={[styles.smallStatValue, t.maxLosingDayStreak >= 5 ? { color: '#f85149' } : null].filter(Boolean) as object[]}>
            {t.maxLosingDayStreak} days
          </Text>
        </View>
        <View style={styles.smallStat}>
          <Text style={styles.smallStatLabel}>Max winning streak</Text>
          <Text style={styles.smallStatValue}>{t.maxWinningDayStreak} days</Text>
        </View>
      </View>

      {breaches != null && (
        <View style={styles.panel}>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Days breaching ${dailyLossLimit!.toLocaleString()} daily-loss limit</Text>
            <Text style={[styles.kvVal, breaches > 0 ? { color: '#f85149' } : { color: '#3fb950' }]}>{breaches}</Text>
          </View>
        </View>
      )}

      {t.byDayOfWeek.length > 0 && (
        <View style={styles.panel}>
          <Text style={[styles.panelTitle, { marginBottom: 6 }]}>Day-of-week breakdown</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: '20%' }]}>Day</Text>
            <Text style={[styles.th, { width: '20%' }]}>Days</Text>
            <Text style={[styles.th, { width: '30%' }]}>Avg PnL</Text>
            <Text style={[styles.th, { width: '30%' }]}>Win Rate</Text>
          </View>
          {t.byDayOfWeek.map((d) => (
            <View key={d.label} style={styles.tableRow}>
              <Text style={[styles.td, { width: '20%' }]}>{d.label}</Text>
              <Text style={[styles.td, { width: '20%' }]}>{d.days}</Text>
              <Text style={[styles.td, { width: '30%', color: d.avgPnL >= 0 ? '#3fb950' : '#f85149' }]}>{fmtUSD(d.avgPnL)}</Text>
              <Text style={[styles.td, { width: '30%' }]}>{d.winRate.toFixed(1)}%</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

// ─── Document ───────────────────────────────────────────────────────────────

interface PdfDocumentProps {
  resultsMap: Record<string, SimulationResults>;
  imagesMap: Record<string, { spaghetti: string; distBalance: string; distDd: string }>;
  dailyLossLimit?: number;
}

const PdfDocument = ({ resultsMap, imagesMap, dailyLossLimit }: PdfDocumentProps) => {
  const models = Object.keys(resultsMap);

  const getModelLabel = (model: string) => {
    const labels: Record<string, string> = {
      basic: 'Trade Sequence MC',
      regime: 'Regime-Switching',
      parametric: 'Parametric (Student-t)',
      portfolio: 'Multi-Strategy Portfolio',
      garch: 'GARCH(1,1)',
    };
    return labels[model] || model;
  };

  return (
    <Document>
      {/* Cover Page */}
      <Page size="A4" style={styles.page}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 36, color: '#58a6ff', fontWeight: 700, marginBottom: 20 }}>
            Institutional Tear Sheet
          </Text>
          <Text style={{ fontSize: 16, color: '#8b949e', marginBottom: 40 }}>
            Monte Carlo Backtest Analyzer
          </Text>
          <Text style={{ fontSize: 12, color: '#e6edf3', marginBottom: 10 }}>Included Models:</Text>
          {models.map((m) => (
            <Text key={m} style={{ fontSize: 14, color: '#3fb950', marginBottom: 5 }}>
              • {getModelLabel(m)}
            </Text>
          ))}
          <Text style={{ fontSize: 10, color: '#8b949e', position: 'absolute', bottom: 40 }}>
            Generated on {new Date().toLocaleString()}
          </Text>
        </View>
      </Page>

      {/* Detail Pages for each model */}
      {models.flatMap((modelKey) => {
        const results = resultsMap[modelKey];
        const images = imagesMap[modelKey];
        if (!results) return [];

        const pages: React.ReactElement[] = [];

        pages.push(
          <Page key={`${modelKey}-summary`} size="A4" style={styles.page}>
            <View style={styles.header}>
              <Text style={styles.title}>{getModelLabel(modelKey)} Results</Text>
              <Text style={styles.subtitle}>
                N={results.nSimulations} | Data: {results.runMeta.dataFormat} | Horizon: {results.runMeta.nTrades} steps
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Institutional Risk Metrics</Text>

            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Terminal Wealth (Median)</Text>
                <Text style={styles.metricValueGreen}>${results.institutionalMetrics.medianFinalBalance.toFixed(2)}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Max Drawdown (Median)</Text>
                <Text style={styles.metricValue}>{(results.institutionalMetrics.medianMaxDrawdown * 100).toFixed(1)}%</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Ruin Probability</Text>
                <Text style={results.ruinProbability > 0.05 ? styles.metricValueRed : styles.metricValueGreen}>
                  {results.ruinProbability.toFixed(2)}%
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>CVaR (95%)</Text>
                <Text style={styles.metricValue}>${results.institutionalMetrics.cvar95.toFixed(2)}</Text>
              </View>
            </View>

            {images && (
              <View>
                <Text style={styles.sectionTitle}>Simulation Paths</Text>
                {images.spaghetti && <Image src={images.spaghetti} style={styles.chartImage} />}

                <Text style={styles.sectionTitle}>Distributions</Text>
                <View style={styles.chartRow}>
                  {images.distBalance && <Image src={images.distBalance} style={styles.chartHalf} />}
                  {images.distDd && <Image src={images.distDd} style={styles.chartHalf} />}
                </View>
              </View>
            )}

            <Text
              style={styles.footer}
              render={({ pageNumber, totalPages }) =>
                `Monte Carlo Backtest Analyzer | Page ${pageNumber} of ${totalPages}`
              }
              fixed
            />
          </Page>
        );

        // Validation + EVT page
        if (results.modelValidation || results.evt) {
          pages.push(
            <Page key={`${modelKey}-validation`} size="A4" style={styles.page}>
              <View style={styles.header}>
                <Text style={styles.title}>{getModelLabel(modelKey)} — Model Risk</Text>
                <Text style={styles.subtitle}>SR 11-7 style diagnostics + EVT loss-tail analysis</Text>
              </View>
              {results.modelValidation && <ValidationSection v={results.modelValidation} />}
              {results.evt && <EVTSection e={results.evt} />}
              <Text
                style={styles.footer}
                render={({ pageNumber, totalPages }) =>
                  `Monte Carlo Backtest Analyzer | Page ${pageNumber} of ${totalPages}`
                }
                fixed
              />
            </Page>
          );
        }

        // Attribution + Calendar page
        if (results.attribution || results.timestampAnalytics) {
          pages.push(
            <Page key={`${modelKey}-attribution`} size="A4" style={styles.page}>
              <View style={styles.header}>
                <Text style={styles.title}>{getModelLabel(modelKey)} — Attribution & Calendar</Text>
                <Text style={styles.subtitle}>Benchmark relative performance and calendar-aware analytics</Text>
              </View>
              {results.attribution && <AttributionSection a={results.attribution} />}
              {results.timestampAnalytics && (
                <TimestampSection t={results.timestampAnalytics} dailyLossLimit={dailyLossLimit} />
              )}
              <Text
                style={styles.footer}
                render={({ pageNumber, totalPages }) =>
                  `Monte Carlo Backtest Analyzer | Page ${pageNumber} of ${totalPages}`
                }
                fixed
              />
            </Page>
          );
        }

        return pages;
      })}
    </Document>
  );
};

export async function exportToVectorPDF(
  selectedModels: string[],
  resultsHistory: Record<string, SimulationResults>,
  filename: string = 'Institutional_Report.pdf',
  dailyLossLimit?: number
): Promise<void> {
  // 1. Capture charts for selected models
  const imagesMap: Record<string, { spaghetti: string; distBalance: string; distDd: string }> = {};

  for (const modelKey of selectedModels) {
    try {
      const spagEl = document.getElementById(`capture-${modelKey}-spaghetti`);
      const balEl = document.getElementById(`capture-${modelKey}-dist-balance`);
      const ddEl = document.getElementById(`capture-${modelKey}-dist-dd`);

      const opts = { backgroundColor: '#0d1117', scale: 2 };

      const spagImg = spagEl ? (await html2canvas(spagEl, opts)).toDataURL('image/png') : '';
      const balImg = balEl ? (await html2canvas(balEl, opts)).toDataURL('image/png') : '';
      const ddImg = ddEl ? (await html2canvas(ddEl, opts)).toDataURL('image/png') : '';

      imagesMap[modelKey] = { spaghetti: spagImg, distBalance: balImg, distDd: ddImg };
    } catch (e) {
      console.warn(`Failed to capture charts for ${modelKey}`, e);
    }
  }

  // Filter results
  const resultsMap: Record<string, SimulationResults> = {};
  for (const m of selectedModels) {
    if (resultsHistory[m]) {
      resultsMap[m] = resultsHistory[m];
    }
  }

  // 2. Generate PDF Blob
  const blob = await pdf(
    <PdfDocument resultsMap={resultsMap} imagesMap={imagesMap} dailyLossLimit={dailyLossLimit} />
  ).toBlob();

  // 3. Trigger download
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
