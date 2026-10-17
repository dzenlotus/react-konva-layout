import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const EmbeddedExample = lazy(() => import('./examples/EmbeddedExample'));
const parameters = new URLSearchParams(window.location.search);
const embedded =
  parameters.has('embedded') || (!parameters.has('playground') && !parameters.has('stress'));
const StressApp = lazy(() => import('./StressApp'));
const stress = new URLSearchParams(window.location.search).has('stress');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {embedded ? (
      <Suspense fallback={<p>Загрузка примера…</p>}>
        <EmbeddedExample />
      </Suspense>
    ) : stress ? (
      <Suspense fallback={<p>Загрузка стресс-сцены…</p>}>
        <StressApp />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
