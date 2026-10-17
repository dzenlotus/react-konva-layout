import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const StressApp = lazy(() => import('./StressApp'));
const stress = new URLSearchParams(window.location.search).has('stress');

createRoot(document.getElementById('root')!).render(<StrictMode>
  {stress ? <Suspense fallback={<p>Загрузка стресс-сцены…</p>}><StressApp /></Suspense> : <App />}
</StrictMode>);
