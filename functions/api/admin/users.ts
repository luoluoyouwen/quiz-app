interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SERVICE_ROLE_KEY: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function requireAdmin(request: Request, env: Env): Promise<{ userId: string } | Response> {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Missing Authorization header' }, 401);

  const userResp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authHeader },
  });
  if (!userResp.ok) return json({ error: 'Invalid session' }, 401);

  const user: { id?: string } = await userResp.json();
  if (!user.id) return json({ error: 'Invalid user' }, 401);

  const profileResp = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`, {
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` },
  });
  if (!profileResp.ok) return json({ error: 'Failed to verify admin role' }, 403);

  const profiles: Array<{ role?: string }> = await profileResp.json();
  if (profiles[0]?.role !== 'admin') return json({ error: 'Admin role required' }, 403);

  return { userId: user.id };
}

async function serviceFetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('apikey', env.SERVICE_ROLE_KEY);
  headers.set('Authorization', `Bearer ${env.SERVICE_ROLE_KEY}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(`${env.SUPABASE_URL}${path}`, { ...init, headers });
}

function isValidPassword(password: string): boolean {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

async function writeAuditLog(
  env: Env,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await serviceFetch(env, '/rest/v1/audit_logs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        actor_id: actorId,
        action,
        target_type: targetType,
        target_id: targetId,
        details: JSON.stringify(details),
      }),
    });
  } catch (err) {
    console.error('[admin/users audit] failed:', err);
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const resp = await serviceFetch(env, '/rest/v1/profiles?select=*&order=created_at.desc');
  if (!resp.ok) return json({ error: 'Failed to fetch users', detail: (await resp.text()).slice(0, 200) }, 500);
  return json({ users: await resp.json() });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  let body: { employeeId?: string; email?: string; password?: string; role?: 'user' | 'admin' };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const email = (body.email || (body.employeeId ? `${body.employeeId.trim()}@local.app` : '')).trim().toLowerCase();
  const password = body.password || '';
  const role = body.role === 'admin' ? 'admin' : 'user';
  if (!email || !isValidPassword(password)) return json({ error: 'email and a password with 8+ characters, letters and numbers are required' }, 400);

  const authResp = await serviceFetch(env, '/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!authResp.ok) return json({ error: 'Failed to create auth user', detail: (await authResp.text()).slice(0, 200) }, authResp.status);

  const authUser: { id?: string } = await authResp.json();
  if (!authUser.id) return json({ error: 'Auth user id missing' }, 500);

  const profileResp = await serviceFetch(env, '/rest/v1/profiles', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: authUser.id, email, role }),
  });
  if (!profileResp.ok) {
    const detail = (await profileResp.text()).slice(0, 200);
    const rollbackResp = await serviceFetch(env, '/auth/v1/admin/users/' + authUser.id, { method: 'DELETE' });
    if (!rollbackResp.ok && rollbackResp.status !== 404) {
      console.error('[admin/users] failed to roll back auth user:', await rollbackResp.text());
    }
    return json({ error: 'Failed to create profile', detail }, 500);
  }

  await writeAuditLog(env, admin.userId, 'create_user', 'profile', authUser.id, { email, role });
  return json({ ok: true, userId: authUser.id });
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  let body: { userId?: string; role?: 'user' | 'admin'; new_password?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  if (!body.userId) return json({ error: 'userId is required' }, 400);

  const actions: string[] = [];
  const details: Record<string, unknown> = {};

  if (body.role) {
    if (body.userId === admin.userId && body.role !== 'admin') {
      return json({ error: 'Cannot remove your own admin role' }, 400);
    }
    const roleResp = await serviceFetch(env, `/rest/v1/profiles?id=eq.${body.userId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ role: body.role }),
    });
    if (!roleResp.ok) return json({ error: 'Failed to update role', detail: (await roleResp.text()).slice(0, 200) }, 500);
    actions.push('update_user_role');
    details.role = body.role;
  }

  if (body.new_password) {
    if (!isValidPassword(body.new_password)) return json({ error: 'password must have 8+ characters, letters and numbers' }, 400);
    const pwdResp = await serviceFetch(env, `/auth/v1/admin/users/${body.userId}`, {
      method: 'PUT',
      body: JSON.stringify({ password: body.new_password, email_confirm: true }),
    });
    if (!pwdResp.ok) return json({ error: 'Failed to reset password', detail: (await pwdResp.text()).slice(0, 200) }, pwdResp.status);
    actions.push('reset_password');
    details.password_changed = true;
  }

  if (actions.length === 0) return json({ error: 'No changes provided' }, 400);
  await writeAuditLog(env, admin.userId, actions.join('+'), 'profile', body.userId, details);
  return json({ ok: true });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  if (!userId) return json({ error: 'userId is required' }, 400);
  if (userId === admin.userId) return json({ error: 'Cannot delete yourself' }, 400);

  await writeAuditLog(env, admin.userId, 'delete_user', 'profile', userId, { userId });

  for (const path of [
    `/rest/v1/practice_sessions?user_id=eq.${userId}`,
    `/rest/v1/user_progress?user_id=eq.${userId}`,
    `/rest/v1/question_banks?created_by=eq.${userId}`,
    `/rest/v1/profiles?id=eq.${userId}`,
  ]) {
    const resp = await serviceFetch(env, path, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    if (!resp.ok) return json({ error: 'Failed to delete user data', detail: (await resp.text()).slice(0, 200) }, 500);
  }

  const authResp = await serviceFetch(env, `/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
  if (!authResp.ok && authResp.status !== 404) {
    return json({ error: 'Failed to delete auth user', detail: (await authResp.text()).slice(0, 200) }, authResp.status);
  }

  return json({ ok: true });
};

export const onRequestOptions: PagesFunction<Env> = async () => (
  new Response(null, { status: 204, headers: corsHeaders })
);
