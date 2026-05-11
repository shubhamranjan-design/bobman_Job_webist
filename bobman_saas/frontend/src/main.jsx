import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initTheme } from './utils/theme';
import './styles/app.css';

initTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/home">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
