import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initTheme } from './utils/theme';
import './styles/app.css';

initTheme();

// Pick router basename to match how the app is hosted:
//   - bobman.ai (root)               → ""
//   - api.bobmanconnect.com/home/    → "/home"
const ROUTER_BASE = (() => {
  if (import.meta.env.DEV) return '';
  const path = (typeof window !== 'undefined' ? window.location.pathname : '/') || '/';
  return path.startsWith('/home/') || path === '/home' ? '/home' : '';
})();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={ROUTER_BASE}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
