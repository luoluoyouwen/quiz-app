import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const persistentRecords = new Map<string, any>();
  return {
    from: vi.fn(),
    bankSingle: vi.fn(),
    questionOrder: vi.fn(),
    persistentRecords,
    cacheGet: vi.fn((key: string) => Promise.resolve(persistentRecords.get(key))),
    cachePut: vi.fn((record: any) => {
      persistentRecords.set(record.key, record);
      return Promise.resolve(record.key);
    }),
    cacheDelete: vi.fn((key: string) => {
      persistentRecords.delete(key);
      return Promise.resolve();
    }),
    cacheClear: vi.fn(() => {
      persistentRecords.clear();
      return Promise.resolve();
    }),
    cacheDeleteByUser: vi.fn((userId: string) => {
      for (const [key, record] of persistentRecords) {
        if (record.userId === userId) persistentRecords.delete(key);
      }
      return Promise.resolve();
    }),
  };
});

vi.mock('../db', () => ({
  db: {
    cloudBankCache: {
      get: mocks.cacheGet,
      put: mocks.cachePut,
      delete: mocks.cacheDelete,
      clear: mocks.cacheClear,
      where: () => ({
        equals: (userId: string) => ({
          delete: () => mocks.cacheDeleteByUser(userId),
        }),
      }),
    },
  },
}));

vi.mock('./supabase', () => ({ supabase: { from: mocks.from } }));

import {
  clearCloudBankDataCache,
  deletePersistentCloudBankDataCache,
  getCachedCloudBankData,
  loadCloudBankData,
} from './cloudBankData';

const bank = {
  id: 'bank-1',
  name: 'Bank',
  description: '',
  question_count: 1,
  content_hash: 'hash-1',
};

const questions = [{
  id: 'question-1',
  bank_id: 'bank-1',
  type: 'choice' as const,
  content: 'Question',
  options: ['A', 'B'],
  answer: 'A',
  answers: null,
  explanation: '',
  image_url: '',
  sort_order: 1,
}];

function persistentRecord(overrides: Record<string, unknown> = {}) {
  return {
    key: 'user-1::bank-1',
    userId: 'user-1',
    bankId: 'bank-1',
    data: { bank, questions },
    cachedAt: Date.now(),
    validatedAt: Date.now(),
    ...overrides,
  };
}

describe('cloudBankData', () => {
  beforeEach(() => {
    clearCloudBankDataCache();
    mocks.persistentRecords.clear();
    mocks.from.mockReset();
    mocks.bankSingle.mockReset();
    mocks.questionOrder.mockReset();
    mocks.cacheGet.mockClear();
    mocks.cachePut.mockClear();
    mocks.cacheDelete.mockClear();
    mocks.cacheClear.mockClear();
    mocks.cacheDeleteByUser.mockClear();

    mocks.bankSingle.mockResolvedValue({ data: bank, error: null });
    mocks.questionOrder.mockResolvedValue({ data: questions, error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'question_banks') {
        return {
          select: () => ({
            eq: () => ({ single: mocks.bankSingle }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ order: mocks.questionOrder }),
        }),
      };
    });
  });

  it('deduplicates concurrent network requests and persists the result', async () => {
    const options = { userId: 'user-1' };
    const first = loadCloudBankData('bank-1', options);
    const second = loadCloudBankData('bank-1', options);

    expect(first).toBe(second);
    await expect(first).resolves.toEqual({ bank, questions });
    await expect(loadCloudBankData('bank-1', options)).resolves.toEqual({ bank, questions });

    expect(mocks.bankSingle).toHaveBeenCalledTimes(1);
    expect(mocks.questionOrder).toHaveBeenCalledTimes(1);
    expect(mocks.cachePut).toHaveBeenCalledTimes(1);
    expect(getCachedCloudBankData('bank-1', 'user-1')).toEqual({ bank, questions });
  });

  it('uses a bank hint so prefetch only requests the question payload', async () => {
    await loadCloudBankData('bank-1', { userId: 'user-1', bankHint: bank });

    expect(mocks.bankSingle).not.toHaveBeenCalled();
    expect(mocks.questionOrder).toHaveBeenCalledTimes(1);
  });

  it('returns a fresh persistent cache without a network request', async () => {
    mocks.persistentRecords.set('user-1::bank-1', persistentRecord());

    await expect(loadCloudBankData('bank-1', { userId: 'user-1' }))
      .resolves.toEqual({ bank, questions });

    expect(mocks.bankSingle).not.toHaveBeenCalled();
    expect(mocks.questionOrder).not.toHaveBeenCalled();
  });

  it('keeps persistent cache isolated by user', async () => {
    mocks.persistentRecords.set('user-1::bank-1', persistentRecord());

    await loadCloudBankData('bank-1', { userId: 'user-2' });

    expect(mocks.bankSingle).toHaveBeenCalledTimes(1);
    expect(mocks.questionOrder).toHaveBeenCalledTimes(1);
    expect(getCachedCloudBankData('bank-1', 'user-1')).toBeUndefined();
    expect(getCachedCloudBankData('bank-1', 'user-2')).toEqual({ bank, questions });
  });

  it('revalidates stale metadata without downloading unchanged questions', async () => {
    const latestBank = { ...bank, name: 'Renamed bank' };
    mocks.persistentRecords.set('user-1::bank-1', persistentRecord({ validatedAt: 0 }));
    mocks.bankSingle.mockResolvedValue({ data: latestBank, error: null });
    const onRevalidated = vi.fn();

    await loadCloudBankData('bank-1', { userId: 'user-1', onRevalidated });
    await vi.waitFor(() => expect(onRevalidated).toHaveBeenCalledTimes(1));

    expect(mocks.bankSingle).toHaveBeenCalledTimes(1);
    expect(mocks.questionOrder).not.toHaveBeenCalled();
    expect(onRevalidated).toHaveBeenCalledWith({ bank: latestBank, questions });
  });

  it('downloads questions again only when the bank version changes', async () => {
    const latestBank = { ...bank, content_hash: 'hash-2' };
    mocks.persistentRecords.set('user-1::bank-1', persistentRecord({ validatedAt: 0 }));
    mocks.bankSingle.mockResolvedValue({ data: latestBank, error: null });
    const onRevalidated = vi.fn();

    await loadCloudBankData('bank-1', { userId: 'user-1', onRevalidated });
    await vi.waitFor(() => expect(onRevalidated).toHaveBeenCalledTimes(1));

    expect(mocks.questionOrder).toHaveBeenCalledTimes(1);
    expect(onRevalidated).toHaveBeenCalledWith({ bank: latestBank, questions });
  });

  it('does not retain a failed request', async () => {
    mocks.questionOrder.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });

    await expect(loadCloudBankData('bank-1', { userId: 'user-1' })).rejects.toThrow('offline');
    await expect(loadCloudBankData('bank-1', { userId: 'user-1' })).resolves.toEqual({ bank, questions });

    expect(mocks.questionOrder).toHaveBeenCalledTimes(2);
  });

  it('clears only the requested user persistent cache', async () => {
    mocks.persistentRecords.set('user-1::bank-1', persistentRecord());
    mocks.persistentRecords.set('user-2::bank-1', persistentRecord({
      key: 'user-2::bank-1',
      userId: 'user-2',
    }));

    await deletePersistentCloudBankDataCache('user-1');

    expect(mocks.persistentRecords.has('user-1::bank-1')).toBe(false);
    expect(mocks.persistentRecords.has('user-2::bank-1')).toBe(true);
  });
});