import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  ThemePreference,
  installThemeSync,
  readThemePreference,
  saveThemePreference,
} from './theme';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  setPreference: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    readThemePreference,
  );

  useEffect(() => {
    const cleanup = installThemeSync();

    const handleCustomEvent = () => {
      setPreferenceState(readThemePreference());
    };
    window.addEventListener('ule-theme-change', handleCustomEvent);
    window.addEventListener('storage', handleCustomEvent);

    return () => {
      cleanup();
      window.removeEventListener('ule-theme-change', handleCustomEvent);
      window.removeEventListener('storage', handleCustomEvent);
    };
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    saveThemePreference(p);
    setPreferenceState(p);
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
