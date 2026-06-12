/**
 * src/lang/LanguageProvider.tsx — React context for the plain-English ⇄
 * pro-terms display mode (see src/lang/terms.ts for the dictionary and the
 * rationale). Mirrors the ThemeProvider pattern: localStorage-persisted,
 * default `plain` because the wedge audience (prop-challenge traders) is
 * mostly non-quant.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  getTerm,
  loadLangMode,
  saveLangMode,
  type LangMode,
  type TermKey,
  type TermText,
} from './terms';

interface LanguageContextValue {
  mode: LangMode;
  setMode: (mode: LangMode) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  mode: 'plain',
  setMode: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }): ReactElement {
  const [mode, setModeState] = useState<LangMode>(() => loadLangMode());

  const setMode = useCallback((next: LangMode): void => {
    setModeState(next);
    saveLangMode(next);
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLangMode(): LanguageContextValue {
  return useContext(LanguageContext);
}

/**
 * Bound term lookup: `const t = useTerm(); t('var95').label`.
 * Components re-render automatically when the mode flips.
 */
export function useTerm(): (key: TermKey) => TermText {
  const { mode } = useContext(LanguageContext);
  return useCallback((key: TermKey) => getTerm(mode, key), [mode]);
}
