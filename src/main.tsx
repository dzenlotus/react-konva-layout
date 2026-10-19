import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const App = lazy(() => import('./App'));
const EmbeddedExample = lazy(() => import('./examples/EmbeddedExample'));
const StressApp = lazy(() => import('./StressApp'));
const FreeSceneExample = lazy(() => import('./examples/FreeSceneExample'));
const CameraExample = lazy(() => import('./examples/CameraExample'));
const parameters = new URLSearchParams(window.location.search);
const embedded =
  parameters.has('embedded') ||
  (!parameters.has('playground') &&
    !parameters.has('stress') &&
    !parameters.has('free') &&
    !parameters.has('scene'));
const free = parameters.has('scene') || parameters.has('free');
const stress = parameters.has('stress');
const Demo = parameters.has('camera')
  ? CameraExample
  : free
    ? FreeSceneExample
    : embedded
      ? EmbeddedExample
      : stress
        ? StressApp
        : App;
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
