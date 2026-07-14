// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { installModalScrollLock, MODAL_SCROLL_LOCK_CLASS } from './modalScrollLock';

describe('installModalScrollLock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    document.body.replaceChildren();
    document.documentElement.classList.remove(MODAL_SCROLL_LOCK_CLASS);
    document.documentElement.style.removeProperty('--quiz-modal-scroll-offset');
  });

  it('locks the root scroller only while an Ant Design modal is visible', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const uninstall = installModalScrollLock(document);
    const modal = document.createElement('div');
    modal.className = 'ant-modal-wrap';

    document.body.append(modal);

    await waitFor(() => {
      expect(document.documentElement.classList.contains(MODAL_SCROLL_LOCK_CLASS)).toBe(true);
    });

    modal.style.display = 'none';

    await waitFor(() => {
      expect(document.documentElement.classList.contains(MODAL_SCROLL_LOCK_CLASS)).toBe(false);
    });

    uninstall();
  });

  it('restores the original page position after unlocking', async () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 180 });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const uninstall = installModalScrollLock(document);
    const modal = document.createElement('div');
    modal.className = 'ant-modal-wrap';

    document.body.append(modal);

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--quiz-modal-scroll-offset')).toBe('-180px');
      expect(document.body.style.position).toBe('fixed');
    });

    modal.remove();

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith(0, 180);
    });
    expect(document.documentElement.style.getPropertyValue('--quiz-modal-scroll-offset')).toBe('');
    expect(document.body.style.position).toBe('');

    uninstall();
  });
});