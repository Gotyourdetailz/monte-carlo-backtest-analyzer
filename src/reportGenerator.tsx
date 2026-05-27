import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Image, pdf } from '@react-pdf/renderer';
import html2canvas from 'html2canvas';
import { SimulationResults } from './types';

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
  }
});

interface PdfDocumentProps {
  resultsMap: Record<string, SimulationResults>;
  imagesMap: Record<string, { spaghetti: string; distBalance: string; distDd: string }>;
}

const PdfDocument = ({ resultsMap, imagesMap }: PdfDocumentProps) => {
  const models = Object.keys(resultsMap);

  const getModelLabel = (model: string) => {
    const labels: Record<string, string> = {
      basic: 'Trade Sequence MC',
      regime: 'Regime-Switching',
      parametric: 'Parametric (Student-t)',
      portfolio: 'Multi-Strategy Portfolio',
      garch: 'GARCH(1,1)'
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
          <Text style={{ fontSize: 12, color: '#e6edf3', marginBottom: 10 }}>
            Included Models:
          </Text>
          {models.map(m => (
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
      {models.map(modelKey => {
        const results = resultsMap[modelKey];
        const images = imagesMap[modelKey];
        if (!results) return null;

        return (
          <Page key={modelKey} size="A4" style={styles.page}>
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
                  {(results.ruinProbability).toFixed(2)}%
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

            <Text style={styles.footer} render={({ pageNumber, totalPages }) => (
              `Monte Carlo Backtest Analyzer | Page ${pageNumber} of ${totalPages}`
            )} fixed />
          </Page>
        );
      })}
    </Document>
  );
};

export async function exportToVectorPDF(
  selectedModels: string[],
  resultsHistory: Record<string, SimulationResults>,
  filename: string = 'Institutional_Report.pdf'
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

  // 2. Generate PDF Blob using @react-pdf/renderer
  const blob = await pdf(<PdfDocument resultsMap={resultsMap} imagesMap={imagesMap} />).toBlob();

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
