/**
 * Development-only logging utility.
 * In production builds, log() and warn() are no-ops to avoid leaking data.
 * error() is always active for production debugging.
 */
const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;

export const debug = {
  log: (...args: unknown[]) => { if (isDev) console.log(...args); },
  warn: (...args: unknown[]) => { if (isDev) console.warn(...args); },
  error: (...args: unknown[]) => { console.error(...args); },
};
