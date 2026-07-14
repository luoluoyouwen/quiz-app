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

function deleteRequest(scope: 'feedback' | 'reply') {
  return new Request(`https://quiz.test/api/admin/feedback?id=feedback-1&scope=${scope}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer admin-token' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DELETE /api/admin/feedback', () => {
  it('withdraws an existing reply and reopens the feedback', async () => {
    const reopened = {
      id: 'feedback-1',
      user_id: 'user-1',
      status: 'open',
      admin_reply: null,
      replied_by: null,
      replied_at: null,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ id: 'admin-1' }))
      .mockResolvedValueOnce(response([{ role: 'admin' }]))
      .mockResolvedValueOnce(response([{ ...reopened, status: 'replied', admin_reply: '原回复', replied_by: 'admin-1' }]))
      .mockResolvedValueOnce(response([reopened]))
      .mockResolvedValueOnce(response(null, 201));
    vi.stubGlobal('fetch', fetchMock);

    const result = await onRequestDelete({ request: deleteRequest('reply'), env } as never);

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({ feedback: reopened });
    expect(fetchMock.mock.calls[3][1]).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toMatchObject({
      status: 'open',
      admin_reply: null,
      replied_by: null,
      replied_at: null,
    });
    const auditPayload = JSON.parse(String(fetchMock.mock.calls[4][1]?.body));
    expect(auditPayload.action).toBe('withdraw_feedback_reply');
  });

  it('lets an administrator delete any feedback record', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ id: 'admin-1' }))
      .mockResolvedValueOnce(response([{ role: 'admin' }]))
      .mockResolvedValueOnce(response([{ id: 'feedback-1', user_id: 'user-1', status: 'closed', admin_reply: '完成', category: 'bug' }]))
      .mockResolvedValueOnce(response([{ id: 'feedback-1' }]))
      .mockResolvedValueOnce(response(null, 201));
    vi.stubGlobal('fetch', fetchMock);

    const result = await onRequestDelete({ request: deleteRequest('feedback'), env } as never);

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[3][1]).toMatchObject({ method: 'DELETE' });
    const auditPayload = JSON.parse(String(fetchMock.mock.calls[4][1]?.body));
    expect(auditPayload.action).toBe('delete_feedback');
  });

  it('returns a conflict when there is no reply to withdraw', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ id: 'admin-1' }))
      .mockResolvedValueOnce(response([{ role: 'admin' }]))
      .mockResolvedValueOnce(response([{ id: 'feedback-1', user_id: 'user-1', status: 'open', admin_reply: null }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await onRequestDelete({ request: deleteRequest('reply'), env } as never);

    expect(result.status).toBe(409);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
