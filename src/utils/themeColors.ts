/**
 * Theme-aware color tokens for custom-styled elements.
 * Ant Design's ConfigProvider handles Ant components automatically;
 * this utility provides colors for custom inline styles.
 */
import { useTheme } from '../contexts/ThemeContext';

export interface ThemeColors {
  /** Card / container background */
  bgContainer: string;
  /** Layout / page background */
  bgLayout: string;
  /** Border color on containers */
  border: string;
  /** Muted text / icon */
  textMuted: string;
  /** Drag/drop area background */
  bgFill: string;
  /** Correct highlight background (green) */
  bgSuccess: string;
  /** Wrong highlight background (red) */
  bgError: string;
  /** Warning banner background */
  bgWarning: string;
  /** Warning banner border */
  borderWarning: string;
  /** Primary blue */
  primary: string;
  /** Transparent white for overlay elements */
  white: string;
}

const light: ThemeColors = {
  bgContainer: '#fff',
  bgLayout: '#f5f5f5',
  border: '#d9d9d9',
  textMuted: '#999',
  bgFill: '#fafafa',
  bgSuccess: '#f6ffed',
  bgError: '#fff1f0',
  bgWarning: '#fffbe6',
  borderWarning: '#ffe58f',
  primary: '#1677ff',
  white: '#fff',
};

const dark: ThemeColors = {
  bgContainer: '#1f1f1f',
  bgLayout: '#141414',
  border: '#434343',
  textMuted: '#666',
  bgFill: '#262626',
  bgSuccess: '#162312',
  bgError: '#2a1215',
  bgWarning: '#2b1d0f',
  borderWarning: '#612500',
  primary: '#1677ff',
  white: '#fff',
};

export function useColors(): ThemeColors {
  const { isDark } = useTheme();
  return isDark ? dark : light;
}
