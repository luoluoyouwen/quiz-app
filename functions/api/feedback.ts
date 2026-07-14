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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;

  const resp = await serviceFetch(env, `/rest/v1/feedback_items?user_id=eq.${user.userId}&select=*&order=created_at.desc`);
  if (!resp.ok) return tableError('feedback_items', await resp.text());
  return json({ feedback: await resp.json() });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;

  let body: { category?: string; title?: string; content?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const category = body.category?.trim() || '';
  const title = body.title?.trim() || '';
  const content = body.content?.trim() || '';
  if (!category || !title || !content) return json({ error: 'category, title and content are required' }, 400);
  if (!['bug', 'suggestion', 'content', 'account', 'other'].includes(category)) return json({ error: 'Invalid category' }, 400);
  if (title.length > 60 || content.length > 800) return json({ error: 'Feedback is too long' }, 400);

  const resp = await serviceFetch(env, '/rest/v1/feedback_items?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: user.userId, category, title, content, status: 'open' }),
  });
  if (!resp.ok) return tableError('feedback_items', await resp.text());
  const rows = await resp.json() as unknown[];
  return json({ feedback: rows[0] });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;

  const id = new URL(request.url).searchParams.get('id')?.trim() || '';
  if (!id) return json({ error: 'id is required' }, 400);

  const lookupParams = new URLSearchParams({
    id: `eq.${id}`,
    select: 'id,user_id,status,admin_reply,category',
  });
  const lookupResp = await serviceFetch(env, `/rest/v1/feedback_items?${lookupParams}`);
  if (!lookupResp.ok) return tableError('feedback_items', await lookupResp.text());
  const rows = await lookupResp.json() as Array<{
    id: string;
    user_id: string;
    status: string;
    admin_reply?: string | null;
    category?: string;
  }>;
  const item = rows[0];
  if (!item || item.user_id !== user.userId) return json({ error: 'Feedback not found' }, 404);
  if (item.status !== 'open' || item.admin_reply?.trim()) {
    return json({ error: '已处理的反馈不能删除' }, 409);
  }

  const deleteParams = new URLSearchParams({
    id: `eq.${id}`,
    user_id: `eq.${user.userId}`,
    status: 'eq.open',
    or: '(admin_reply.is.null,admin_reply.eq.)',
    select: 'id',
  });
  const deleteResp = await serviceFetch(env, `/rest/v1/feedback_items?${deleteParams}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  if (!deleteResp.ok) return tableError('feedback_items', await deleteResp.text());
  const deleted = await deleteResp.json() as Array<{ id: string }>;
  if (deleted.length === 0) return json({ error: '反馈状态已变化，请刷新后重试' }, 409);

  await writeAuditLog(env, user.userId, 'delete_own_feedback', 'feedback', id, {
    category: item.category || 'unknown',
    previous_status: item.status,
  });
  return json({ ok: true });
};

export const onRequestOptions: PagesFunction<Env> = async () => new Response(null, { status: 204, headers: corsHeaders });
