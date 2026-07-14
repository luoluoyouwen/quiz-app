import { createContext, useContext, useState, useEffect, type ReactNode, useCallback } from 'react';

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  toggleTheme: () => {},
});

export const STORAGE_KEY = 'quiz_app_dark_mode';

/** Detect system color scheme preference */
function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // null = no explicit choice → use system preference
      return saved !== null ? saved === 'true' : getSystemPrefersDark();
    } catch {
      return getSystemPrefersDark();
    }
  });

  // ── Track whether the user has made an explicit choice ──
  const [hasExplicit, setHasExplicit] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== null; }
    catch { return false; }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isDark));
      setHasExplicit(true);
    } catch { /* quota exceeded */ }
  }, [isDark]);

  // ── Follow system preference changes when no explicit user choice exists ──
  useEffect(() => {
    if (hasExplicit) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [hasExplicit]);

  const toggleTheme = useCallback(() => {
    setIsDark(prev => !prev);
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}
