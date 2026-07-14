import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPatch, onRequestPost } from './users';

const env = {
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
  SERVICE_ROLE_KEY: 'service-role-key',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function request(method: string, body: unknown) {
  return new Request('https://quiz.test/api/admin/users', {
    method,
    headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('/api/admin/users safety checks', () => {
  it('does not allow an administrator to remove their own admin role', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ id: 'admin-1' }))
      .mockResolvedValueOnce(response([{ role: 'admin' }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await onRequestPatch({
      request: request('PATCH', { userId: 'admin-1', role: 'user' }),
      env,
    } as never);

    expect(result.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rolls back the auth user if profile creation fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ id: 'admin-1' }))
      .mockResolvedValueOnce(response([{ role: 'admin' }]))
      .mockResolvedValueOnce(response({ id: 'new-user' }))
      .mockResolvedValueOnce(response({ message: 'profile failed' }, 500))
      .mockResolvedValueOnce(response({}, 200));
    vi.stubGlobal('fetch', fetchMock);

    const result = await onRequestPost({
      request: request('POST', { employeeId: 'USER001', password: 'NotARealPassword9!', role: 'user' }),
      env,
    } as never);

    expect(result.status).toBe(500);
    expect(fetchMock.mock.calls[4][0]).toBe('https://supabase.test/auth/v1/admin/users/new-user');
    expect(fetchMock.mock.calls[4][1]).toMatchObject({ method: 'DELETE' });
  });
});
