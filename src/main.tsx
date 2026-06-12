import {StrictMode, Suspense, lazy} from 'react';
import {createRoot} from 'react-dom/client';
import {createBrowserRouter, RouterProvider} from 'react-router-dom';
// Self-hosted variable fonts (CSP-clean: served from 'self', not Google).
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/manrope';
import '@fontsource-variable/bricolage-grotesque';
import {ThemeProvider, initThemeBeforeRender} from './theme/ThemeProvider';
import {LanguageProvider} from './lang/LanguageProvider';
import {initAnalytics} from './config';
import './index.css';

// Code-split the two routes so the public marketing landing does NOT ship the
// heavy analyzer bundle (WASM kernel, Recharts, react-pdf). Each route fetches
// its own chunk on demand.
const Marketing = lazy(() =>
  import('./pages/Marketing').then((m) => ({default: m.Marketing})),
);
const App = lazy(() => import('./App.tsx'));

// Apply persisted theme/density to <html> before first paint (no flash).
initThemeBeforeRender();
// Privacy-light funnel measurement (no-op unless VITE_ANALYTICS_DOMAIN is set).
initAnalytics();

const Fallback = (
  <div className="grid min-h-screen place-items-center bg-[var(--bg-primary)] text-sm text-[var(--text-secondary)]">
    Loading…
  </div>
);

// Unauthenticated routing (Phase B / B4): marketing landing at `/`, the
// analyzer at `/app`. No auth gate — preferences persist to localStorage.
const router = createBrowserRouter([
  {path: '/', element: <Suspense fallback={Fallback}><Marketing /></Suspense>},
  {path: '/app', element: <Suspense fallback={Fallback}><App /></Suspense>},
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <RouterProvider router={router} />
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>,
);
