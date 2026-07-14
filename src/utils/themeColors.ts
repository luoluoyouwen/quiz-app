/**
 * Theme-aware color tokens for custom-styled elements.
 * Ant Design's ConfigProvider handles Ant components automatically;
 * this utility provides colors for custom inline styles.
 */
import { useTheme } from '../contexts/ThemeContext';
import { getAppThemeTokens } from '../styles/themeTokens';

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

function getColors(isDark: boolean): ThemeColors {
  const vars = getAppThemeTokens(isDark).cssVars;
  return {
    bgContainer: vars['--bg-container'],
    bgLayout: vars['--bg-layout'],
    border: vars['--border'],
    textMuted: vars['--color-text-secondary'],
    bgFill: vars['--bg-fill'],
    bgSuccess: vars['--bg-success'],
    bgError: vars['--bg-error'],
    bgWarning: vars['--bg-warning'],
    borderWarning: vars['--border-warning'],
    primary: vars['--color-primary'],
    white: '#fff',
  };
}

export function useColors(): ThemeColors {
  const { isDark } = useTheme();
  return getColors(isDark);
}
