import { describe, expect, it } from 'vitest';
import { shouldAutoApplyUpdate } from './pwaUpdateStrategy';

describe('shouldAutoApplyUpdate', () => {
  it('allows quiet updates on passive top-level pages', () => {
    expect(shouldAutoApplyUpdate({
      pathname: '/',
      visibilityState: 'visible',
      hasDirtyForm: false,
      activeElementTagName: 'BODY',
    })).toBe(true);
  });

  it('does not auto-refresh during practice sessions', () => {
    expect(shouldAutoApplyUpdate({
      pathname: '/practice/bank-1',
      visibilityState: 'visible',
      hasDirtyForm: false,
      activeElementTagName: 'BODY',
    })).toBe(false);
  });

  it('does not auto-refresh while a form control is active or dirty', () => {
    expect(shouldAutoApplyUpdate({
      pathname: '/profile',
      visibilityState: 'visible',
      hasDirtyForm: false,
      activeElementTagName: 'INPUT',
    })).toBe(false);

    expect(shouldAutoApplyUpdate({
      pathname: '/admin',
      visibilityState: 'visible',
      hasDirtyForm: true,
      activeElementTagName: 'BODY',
    })).toBe(false);
  });
});
