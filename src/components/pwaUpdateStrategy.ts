export interface AutoUpdateState {
  pathname: string;
  visibilityState: DocumentVisibilityState | 'visible' | 'hidden';
  hasDirtyForm: boolean;
  activeElementTagName?: string | null;
}

const unsafeAutoUpdatePrefixes = ['/practice', '/admin'];
const formControlTags = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function shouldAutoApplyUpdate(state: AutoUpdateState): boolean {
  if (state.visibilityState !== 'visible') return false;
  if (state.hasDirtyForm) return false;
  if (unsafeAutoUpdatePrefixes.some(prefix => state.pathname.startsWith(prefix))) return false;

  const tagName = state.activeElementTagName?.toUpperCase();
  if (tagName && formControlTags.has(tagName)) return false;

  return true;
}

export function readAutoUpdateState(): AutoUpdateState {
  const active = document.activeElement as HTMLElement | null;
  const activeElementTagName = active?.tagName ?? null;
  const hasDirtyForm = Boolean(
    document.querySelector('[data-dirty="true"], [aria-busy="true"], .ant-modal, .ant-drawer')
  );

  return {
    pathname: window.location.pathname,
    visibilityState: document.visibilityState,
    hasDirtyForm,
    activeElementTagName,
  };
}
