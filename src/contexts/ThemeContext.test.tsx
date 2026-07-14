// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useEffect } from 'react';
import { ThemeProvider, useTheme, STORAGE_KEY } from './ThemeContext';

// Mock localStorage before any module uses it
const mockStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => mockStore[key] ?? null,
  setItem: (key: string, value: string) => { mockStore[key] = value; },
  clear: () => { Object.keys(mockStore).forEach(k => delete mockStore[k]); },
  removeItem: (key: string) => { delete mockStore[key]; },
  get length() { return Object.keys(mockStore).length; },
  key: (i: number) => Object.keys(mockStore)[i] ?? null,
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true,
});

// Mock matchMedia for theme auto-detection
Object.defineProperty(window, 'matchMedia', {
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
  configurable: true,
  writable: true,
});

function mountWithTheme(initialDark?: boolean) {
  if (initialDark !== undefined) {
    localStorage.setItem(STORAGE_KEY, String(initialDark));
  }

  const state: { isDark?: boolean; toggleTheme?: () => void } = {};

  function Reader() {
    const { isDark, toggleTheme } = useTheme();
    useEffect(() => {
      state.isDark = isDark;
      state.toggleTheme = toggleTheme;
    }, [isDark, toggleTheme]);
    return null;
  }

  const container = document.createElement('div');

  act(() => {
    const root = createRoot(container);
    root.render(
      <ThemeProvider>
        <Reader />
      </ThemeProvider>,
    );
    // Store cleanup on the container
    (container as any).__root = root;
  });

  return {
    get isDark() { return state.isDark; },
    toggle: () => act(() => state.toggleTheme?.()),
  };
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to light mode (isDark=false)', () => {
    const m = mountWithTheme();
    expect(m.isDark).toBe(false);
  });

  it('toggleTheme switches to dark', () => {
    const m = mountWithTheme();
    m.toggle();
    expect(m.isDark).toBe(true);
  });

  it('toggleTheme switches back to light', () => {
    const m = mountWithTheme();
    m.toggle();
    m.toggle();
    expect(m.isDark).toBe(false);
  });

  it('persists dark preference to localStorage', () => {
    const m = mountWithTheme();
    m.toggle();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('reads dark preference from localStorage on mount', () => {
    const m = mountWithTheme(true);
    expect(m.isDark).toBe(true);
  });

  it('reads light preference from localStorage on mount', () => {
    const m = mountWithTheme(false);
    expect(m.isDark).toBe(false);
  });

  it('handles corrupt localStorage gracefully', () => {
    localStorage.setItem(STORAGE_KEY, '{bad json');
    const m = mountWithTheme();
    expect(m.isDark).toBe(false);
  });
});
