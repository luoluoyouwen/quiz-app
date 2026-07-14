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

type AnnouncementBody = {
  id?: string;
  title?: string;
  content?: string;
  level?: 'info' | 'success' | 'warning' | 'critical';
  is_pinned?: boolean;
  is_published?: boolean;
  published_at?: string | null;
  expires_at?: string | null;
};

function normalize(body: AnnouncementBody, actorId: string): Record<string, unknown> | Response {
  const title = body.title?.trim() || '';
  const content = body.content?.trim() || '';
  if (!title || !content) return json({ error: 'title and content are required' }, 400);
  if (title.length > 80 || content.length > 1200) return json({ error: 'Announcement is too long' }, 400);
  const isPublished = body.is_published === true;
  return {
    title,
    content,
    level: body.level || 'info',
    is_pinned: body.is_pinned === true,
    is_published: isPublished,
    published_at: isPublished ? (body.published_at || new Date().toISOString()) : body.published_at || null,
    expires_at: body.expires_at || null,
    created_by: actorId,
    updated_at: new Date().toISOString(),
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const resp = await serviceFetch(env, '/rest/v1/announcements?select=*&order=created_at.desc&limit=300');
  if (!resp.ok) return tableError('announcements', await resp.text());
  return json({ announcements: await resp.json() });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  let body: AnnouncementBody;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const payload = normalize(body, admin.userId);
  if (payload instanceof Response) return payload;

  const resp = await serviceFetch(env, '/rest/v1/announcements?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) return tableError('announcements', await resp.text());
  const rows = await resp.json() as Array<{ id: string }>;
  await writeAuditLog(env, admin.userId, 'create_announcement', 'announcement', rows[0]?.id || '', { title: payload.title });
  return json({ announcement: rows[0] });
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  let body: AnnouncementBody;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  if (!body.id) return json({ error: 'id is required' }, 400);
  const payload = normalize(body, admin.userId);
  if (payload instanceof Response) return payload;
  delete payload.created_by;

  const resp = await serviceFetch(env, `/rest/v1/announcements?id=eq.${body.id}&select=*`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) return tableError('announcements', await resp.text());
  const rows = await resp.json() as Array<{ id: string }>;
  await writeAuditLog(env, admin.userId, 'update_announcement', 'announcement', body.id, { title: payload.title });
  return json({ announcement: rows[0] });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: 'id is required' }, 400);

  const resp = await serviceFetch(env, `/rest/v1/announcements?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  if (!resp.ok) return tableError('announcements', await resp.text());
  await writeAuditLog(env, admin.userId, 'delete_announcement', 'announcement', id, {});
  return json({ ok: true });
};

export const onRequestOptions: PagesFunction<Env> = async () => new Response(null, { status: 204, headers: corsHeaders });
