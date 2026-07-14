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

function isVisibleAnnouncement(item: { is_published?: boolean; published_at?: string | null; expires_at?: string | null }): boolean {
  if (!item.is_published) return false;
  const now = Date.now();
  if (item.published_at && new Date(item.published_at).getTime() > now) return false;
  if (item.expires_at && new Date(item.expires_at).getTime() < now) return false;
  return true;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;

  const resp = await serviceFetch(env, '/rest/v1/announcements?select=*&order=is_pinned.desc,created_at.desc&limit=80');
  if (!resp.ok) return tableError('announcements', await resp.text());

  const readResp = await serviceFetch(env, `/rest/v1/announcement_reads?user_id=eq.${user.userId}&select=announcement_id,read_at`);
  if (!readResp.ok) return tableError('announcement_reads', await readResp.text());

  const reads: Array<{ announcement_id: string; read_at: string }> = await readResp.json();
  const readMap = Object.fromEntries(reads.map((read) => [read.announcement_id, read.read_at]));
  const announcements = ((await resp.json()) as Array<Record<string, unknown>>)
    .filter((item) => isVisibleAnnouncement(item))
    .map((item) => ({ ...item, read_at: readMap[String(item.id)] || null }));

  return json({ announcements });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;

  let body: { announcement_id?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  if (!body.announcement_id) return json({ error: 'announcement_id is required' }, 400);

  const resp = await serviceFetch(env, '/rest/v1/announcement_reads', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ announcement_id: body.announcement_id, user_id: user.userId, read_at: new Date().toISOString() }),
  });
  if (!resp.ok) return tableError('announcement_reads', await resp.text());
  return json({ ok: true });
};

export const onRequestOptions: PagesFunction<Env> = async () => new Response(null, { status: 204, headers: corsHeaders });
