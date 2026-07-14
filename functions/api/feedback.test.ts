import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestDelete } from './feedback';

const env = {
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
  SERVICE_ROLE_KEY: 'service-role-key',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deleteRequest(id = 'feedback-1') {
  return new Request(`https://quiz.test/api/feedback?id=${id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer user-token' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DELETE /api/feedback', () => {
  it('deletes untouched open feedback owned by the current user and writes a metadata-only audit log', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ id: 'user-1' }))
      .mockResolvedValueOnce(response([{ id: 'feedback-1', user_id: 'user-1', status: 'open', admin_reply: null, category: 'bug' }]))
      .mockResolvedValueOnce(response([{ id: 'feedback-1' }]))
      .mockResolvedValueOnce(response(null, 201));
    vi.stubGlobal('fetch', fetchMock);

    const result = await onRequestDelete({ request: deleteRequest(), env } as never);

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'DELETE' });

    const auditPayload = JSON.parse(String(fetchMock.mock.calls[3][1]?.body));
    expect(auditPayload).toMatchObject({
      actor_id: 'user-1',
      action: 'delete_own_feedback',
      target_type: 'feedback',
      target_id: 'feedback-1',
    });
    expect(auditPayload.details).not.toContain('content');
    expect(auditPayload.details).not.toContain('title');
  });

  it('does not reveal feedback owned by another user', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ id: 'user-1' }))
      .mockResolvedValueOnce(response([{ id: 'feedback-1', user_id: 'user-2', status: 'open', admin_reply: null }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await onRequestDelete({ request: deleteRequest(), env } as never);

    expect(result.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns a conflict after an administrator has replied', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ id: 'user-1' }))
      .mockResolvedValueOnce(response([{ id: 'feedback-1', user_id: 'user-1', status: 'replied', admin_reply: '已处理' }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await onRequestDelete({ request: deleteRequest(), env } as never);

    expect(result.status).toBe(409);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
