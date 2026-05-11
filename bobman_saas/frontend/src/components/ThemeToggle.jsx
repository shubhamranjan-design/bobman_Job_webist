import { useState, useEffect } from 'react';
import { getTheme, toggleTheme } from '../utils/theme';

export default function ThemeToggle({ size = 'md' }) {
  const [theme, setTheme] = useState(getTheme());

  useEffect(() => {
    setTheme(getTheme());
  }, []);

  function onClick() {
    const next = toggleTheme();
    setTheme(next);
  }

  return (
    <button
      className={`theme-toggle ${size === 'sm' ? 'sm' : ''}`}
      onClick={onClick}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      aria-label="Toggle theme"
    >
      <span className={`theme-toggle-track ${theme}`}>
        <span className="theme-toggle-thumb">
          {theme === 'dark' ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          )}
        </span>
      </span>
    </button>
  );
}
