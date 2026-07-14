import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from './ai-normalize';

const env = {
  AI_NORMALIZE_API_KEY: 'ai-secret',
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
};

function request(body: unknown, authenticated = true) {
  return new Request('https://quiz.test/api/ai-normalize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated ? { Authorization: 'Bearer user-token' } : {}),
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/ai-normalize', () => {
  it('rejects unauthenticated requests before calling the upstream API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await onRequest({ request: request({}, false), env } as never);
    expect(result.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates the session and forces bounded upstream parameters', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'user-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await onRequest({
      request: request({
        model: 'expensive-model',
        max_tokens: 999999,
        messages: [
          { role: 'system', content: 'Only repair formatting.' },
          { role: 'user', content: 'Question text' },
        ],
      }),
      env,
    } as never);

    expect(result.status).toBe(200);
    const upstreamRequest = fetchMock.mock.calls[1][1] as RequestInit;
    const payload = JSON.parse(String(upstreamRequest.body));
    expect(payload.model).toBe('deepseek-chat');
    expect(payload.max_tokens).toBe(512);
  });
});
