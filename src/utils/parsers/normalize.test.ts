import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeText } from './normalize';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_NORMALIZE_API_KEY;
});

describe('normalizeText', () => {
  it('returns the original text when AI normalization is not configured', async () => {
    await expect(normalizeText('原始题目')).resolves.toBe('原始题目');
  });

  it('sends a readable formatting-only system prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '整理后的题目' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(normalizeText('原始题目', {
      apiKey: 'test-key',
      baseUrl: 'https://ai.test/v1',
      fallbackSilently: false,
    })).resolves.toBe('整理后的题目');

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload.messages[0].content).toContain('只修复排版');
    expect(payload.messages[0].content).toContain('不得修改答案');
  });
});
