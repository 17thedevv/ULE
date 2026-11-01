import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from './theme/ThemeProvider';
import { installThemeSync } from './theme/theme';
import { AppRouter } from './app/routes';
import './styles/global.css';
import './index.css';

// Apply theme synchronously before React mount to prevent FOUC.
installThemeSync();

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <AppRouter />
      </ThemeProvider>
    </React.StrictMode>,
  );
}
