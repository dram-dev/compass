import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/globals.css';
import { useCompassStore } from './store/useCompassStore';
import { loadJordan } from './data/fixtures/jordan';

// Dev only (spec §12): `#/plan?demo=1` (any route) boots with the Jordan persona loaded — used for
// headless print-to-PDF checks. Never active in production builds.
if (import.meta.env.DEV && /[?&]demo=1/.test(window.location.hash)) {
  useCompassStore.getState().loadState(loadJordan());
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
