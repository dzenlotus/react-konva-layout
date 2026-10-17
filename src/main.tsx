import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const App = lazy(() => import('./App'));
const EmbeddedExample = lazy(() => import('./examples/EmbeddedExample'));
const StressApp = lazy(() => import('./StressApp'));
const parameters = new URLSearchParams(window.location.search);
const embedded =
  parameters.has('embedded') || (!parameters.has('playground') && !parameters.has('stress'));
const stress = parameters.has('stress');
const Demo = embedded ? EmbeddedExample : stress ? StressApp : App;
const loadingText = embedded
  ? 'Загрузка примера…'
  : stress
    ? 'Загрузка стресс-сцены…'
    : 'Загрузка playground…';
const container = document.getElementById('root');
if (!container) throw new Error('Demo root element is missing.');

createRoot(container).render(
  <StrictMode>
    <Suspense fallback={<p>{loadingText}</p>}>
      <Demo />
    </Suspense>
  </StrictMode>,
);
