/**
 * Main column header — model-selector tab row plus the PDF / CSV export
 * buttons. Extracted from `App.tsx` to keep the orchestration file under
 * the 600-line cap (Requirement 10.7).
 */

import { Download } from 'lucide-react';
import { EARLY_ACCESS_URL, isEarlyAccessEnabled, trackEvent } from '../config';
import { ThemeToggle } from './ThemeToggle';
import { LangToggle } from './LangToggle';
import { useTerm } from '../lang/LanguageProvider';
import type { TermKey } from '../lang/terms';

export type ModelTab = 'basic' | 'regime' | 'parametric' | 'portfolio' | 'garch';

const TAB_TERMS: Array<readonly [ModelTab, TermKey]> = [
  ['basic', 'tabBasic'],
  ['regime', 'tabRegime'],
  ['parametric', 'tabParametric'],
  ['portfolio', 'tabPortfolio'],
  ['garch', 'tabGarch'],
];

export interface MainHeaderProps {
  activeTab: ModelTab;
  setActiveTab: (t: ModelTab) => void;
  hasResults: boolean;
  isExportingPdf: boolean;
  onExportPdf: () => void;
  onDownloadCsv: () => void;
}

export function MainHeader({
  activeTab,
  setActiveTab,
  hasResults,
  isExportingPdf,
  onExportPdf,
  onDownloadCsv,
}: MainHeaderProps) {
  const t = useTerm();
  return (
    <header className="px-8 mt-6">
      <div className="flex justify-between items-end border-b border-[var(--border)] w-full pb-0">
        <div className="tab-row pb-3">
          {TAB_TERMS.map(([key, termKey]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              data-active={activeTab === key}
              className="tab-btn"
            >
              {t(termKey).label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-5 pb-1">
          <LangToggle />
          <ThemeToggle />
          {isEarlyAccessEnabled && (
            <a
              href={EARLY_ACCESS_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('reserve_click', { source: 'header' })}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-mint)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-primary)] transition-colors hover:bg-[var(--accent-mint-bright)]"
            >
              Reserve early access →
            </a>
          )}
          {hasResults && (
            <div className="flex flex-col gap-2">
              <button
                onClick={onExportPdf}
                disabled={isExportingPdf}
                className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] pb-1 transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {isExportingPdf ? 'Generating PDF...' : 'Export PDF Report'}
              </button>
              <button
                onClick={onDownloadCsv}
                className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] pb-3 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export Results (CSV)
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
