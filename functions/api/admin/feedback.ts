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

async function requireUser(request: Request, env: Env): Promise<{ userId: string } | Response> {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Missing Authorization header' }, 401);

  const userResp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authHeader },
  });
  if (!userResp.ok) return json({ error: 'Invalid session' }, 401);

  const user: { id?: string } = await userResp.json();
  if (!user.id) return json({ error: 'Invalid user' }, 401);
  return { userId: user.id };
}

async function requireAdmin(request: Request, env: Env): Promise<{ userId: string } | Response> {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;

  const profileResp = await serviceFetch(env, `/rest/v1/profiles?id=eq.${user.userId}&select=role`);
  if (!profileResp.ok) return json({ error: 'Failed to verify admin role' }, 403);

  const profiles: Array<{ role?: string }> = await profileResp.json();
  if (profiles[0]?.role !== 'admin') return json({ error: 'Admin role required' }, 403);
  return user;
}

async function serviceFetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('apikey', env.SERVICE_ROLE_KEY);
  headers.set('Authorization', `Bearer ${env.SERVICE_ROLE_KEY}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(`${env.SUPABASE_URL}${path}`, { ...init, headers });
}

function tableError(table: string, detail: string): Response {
  return json({
    error: `${table} 数据表未就绪，请先执行 supabase/announcements-feedback.sql`,
    detail: detail.slice(0, 240),
  }, 500);
}

async function writeAuditLog(env: Env, actorId: string, action: string, targetType: string, targetId: string, details: Record<string, unknown>): Promise<void> {
  try {
    await serviceFetch(env, '/rest/v1/audit_logs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ actor_id: actorId, action, target_type: targetType, target_id: targetId, details: JSON.stringify(details) }),
    });
  } catch (err) {
    console.error('[message-center audit] failed:', err);
  }
}

async function getUserEmails(env: Env, ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const params = new URLSearchParams({ select: 'id,email', id: `in.(${unique.join(',')})` });
  const resp = await serviceFetch(env, `/rest/v1/profiles?${params}`);
  if (!resp.ok) return {};
  const rows = await resp.json() as Array<{ id: string; email: string }>;
  return Object.fromEntries(rows.map((row) => [row.id, row.email]));
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const resp = await serviceFetch(env, '/rest/v1/feedback_items?select=*&order=created_at.desc&limit=300');
  if (!resp.ok) return tableError('feedback_items', await resp.text());
  const feedback = await resp.json() as Array<{ user_id: string }>;
  const emailMap = await getUserEmails(env, feedback.map((item) => item.user_id));
  return json({ feedback: feedback.map((item) => ({ ...item, user_email: emailMap[item.user_id] || 'unknown' })) });
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  let body: { id?: string; admin_reply?: string; status?: 'open' | 'replied' | 'closed' };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  if (!body.id) return json({ error: 'id is required' }, 400);
  if (body.admin_reply && body.admin_reply.trim().length > 1000) return json({ error: 'Reply is too long' }, 400);
  const status = body.status || (body.admin_reply?.trim() ? 'replied' : 'open');
  const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (body.admin_reply != null) {
    payload.admin_reply = body.admin_reply.trim();
    payload.replied_by = admin.userId;
    payload.replied_at = new Date().toISOString();
  }

  const resp = await serviceFetch(env, `/rest/v1/feedback_items?id=eq.${body.id}&select=*`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) return tableError('feedback_items', await resp.text());
  const rows = await resp.json() as Array<{ id: string }>;
  await writeAuditLog(env, admin.userId, 'reply_feedback', 'feedback', body.id, { status });
  return json({ feedback: rows[0] });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const params = new URL(request.url).searchParams;
  const id = params.get('id')?.trim() || '';
  const scope = params.get('scope');
  if (!id) return json({ error: 'id is required' }, 400);
  if (scope !== 'feedback' && scope !== 'reply') return json({ error: 'scope must be feedback or reply' }, 400);

  const lookupParams = new URLSearchParams({
    id: `eq.${id}`,
    select: 'id,user_id,status,admin_reply,category',
  });
  const lookupResp = await serviceFetch(env, `/rest/v1/feedback_items?${lookupParams}`);
  if (!lookupResp.ok) return tableError('feedback_items', await lookupResp.text());
  const rows = await lookupResp.json() as Array<{
    id: string;
    user_id: string;
    status: 'open' | 'replied' | 'closed';
    admin_reply?: string | null;
    category?: string;
  }>;
  const item = rows[0];
  if (!item) return json({ error: 'Feedback not found' }, 404);

  if (scope === 'reply') {
    if (!item.admin_reply?.trim()) return json({ error: '该反馈没有可撤回的回复' }, 409);
    const updatedAt = new Date().toISOString();
    const updateResp = await serviceFetch(env, `/rest/v1/feedback_items?id=eq.${encodeURIComponent(id)}&select=*`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'open',
        admin_reply: null,
        replied_by: null,
        replied_at: null,
        updated_at: updatedAt,
      }),
    });
    if (!updateResp.ok) return tableError('feedback_items', await updateResp.text());
    const updated = await updateResp.json() as Array<Record<string, unknown>>;
    if (!updated[0]) return json({ error: 'Feedback not found' }, 404);
    await writeAuditLog(env, admin.userId, 'withdraw_feedback_reply', 'feedback', id, {
      user_id: item.user_id,
      previous_status: item.status,
      category: item.category || 'unknown',
    });
    return json({ feedback: updated[0] });
  }

  const deleteResp = await serviceFetch(env, `/rest/v1/feedback_items?id=eq.${encodeURIComponent(id)}&select=id`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  if (!deleteResp.ok) return tableError('feedback_items', await deleteResp.text());
  const deleted = await deleteResp.json() as Array<{ id: string }>;
  if (!deleted[0]) return json({ error: 'Feedback not found' }, 404);
  await writeAuditLog(env, admin.userId, 'delete_feedback', 'feedback', id, {
    user_id: item.user_id,
    previous_status: item.status,
    category: item.category || 'unknown',
    had_reply: Boolean(item.admin_reply?.trim()),
  });
  return json({ ok: true });
};

export const onRequestOptions: PagesFunction<Env> = async () => new Response(null, { status: 204, headers: corsHeaders });
