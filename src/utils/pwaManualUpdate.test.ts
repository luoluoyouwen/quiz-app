import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkForPwaUpdate } from './pwaManualUpdate';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkForPwaUpdate', () => {
  it('reports unsupported browsers', async () => {
    vi.stubGlobal('navigator', {});
    await expect(checkForPwaUpdate()).resolves.toBe('unsupported');
  });

  it('reports a missing registration', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    });
    await expect(checkForPwaUpdate()).resolves.toBe('not-registered');
  });

  it('activates an update that is already waiting', async () => {
    const postMessage = vi.fn();
    const registration = {
      waiting: { postMessage },
    } as unknown as ServiceWorkerRegistration;
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue(registration) },
    });

    await expect(checkForPwaUpdate()).resolves.toBe('updating');
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('reports the current version when no update is found', async () => {
    const registration = {
      waiting: null,
      installing: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as ServiceWorkerRegistration;
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue(registration) },
    });

    await expect(checkForPwaUpdate()).resolves.toBe('up-to-date');
    expect(registration.update).toHaveBeenCalledOnce();
  });
});
