import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const App = lazy(() => import('./App'));
const EmbeddedExample = lazy(() => import('./examples/EmbeddedExample'));
const StressApp = lazy(() => import('./StressApp'));
const FreeNodesExample = lazy(() => import('./examples/FreeNodesExample'));
const parameters = new URLSearchParams(window.location.search);
const embedded =
  parameters.has('embedded') ||
  (!parameters.has('playground') &&
    !parameters.has('stress') &&
    !parameters.has('free') &&
    !parameters.has('nodes'));
const free = parameters.has('nodes') || parameters.has('free');
const stress = parameters.has('stress');
const Demo = free ? FreeNodesExample : embedded ? EmbeddedExample : stress ? StressApp : App;
const loadingText = free
  ? 'Загрузка свободной сцены…'
  : embedded
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
