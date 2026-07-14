import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  cleanupEq: vi.fn(),
}));

vi.mock('./supabase', () => ({ supabase: { from: mocks.from } }));

import { uploadBankToSupabase } from './uploadService';

describe('uploadBankToSupabase', () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.cleanupEq.mockReset();
  });

  it('deletes the unfinished bank when a question batch fails', async () => {
    let bankCall = 0;
    mocks.cleanupEq.mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'question_banks' && bankCall++ === 0) {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: 'bank-1' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'questions') {
        return { insert: async () => ({ error: { message: 'batch failed' } }) };
      }
      return { delete: () => ({ eq: mocks.cleanupEq }) };
    });

    await expect(uploadBankToSupabase(
      'Bank',
      '',
      [{ type: 'judge', content: 'Question', answer: 'true' }],
      'hash',
      'user-1',
    )).rejects.toThrow('batch failed');

    expect(mocks.cleanupEq).toHaveBeenCalledWith('id', 'bank-1');
  });
  it('preserves the batch failure when cleanup also fails', async () => {
    let bankCall = 0;
    mocks.cleanupEq.mockResolvedValue({ error: { message: 'cleanup failed' } });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'question_banks' && bankCall++ === 0) {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: 'bank-1' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'questions') {
        return { insert: async () => ({ error: { message: 'batch failed' } }) };
      }
      return { delete: () => ({ eq: mocks.cleanupEq }) };
    });

    await expect(uploadBankToSupabase(
      'Bank',
      '',
      [{ type: 'judge', content: 'Question', answer: 'true' }],
      'hash',
      'user-1',
    )).rejects.toMatchObject({
      message: expect.stringContaining('cleanup failed'),
      cause: expect.objectContaining({ message: expect.stringContaining('batch failed') }),
    });
  });

});
