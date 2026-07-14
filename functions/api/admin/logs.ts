interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SERVICE_ROLE_KEY: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

function serviceHeaders(env: Env, extra: Record<string, string> = {}): HeadersInit {
  return {
    apikey: env.SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

async function serviceGet(env: Env, path: string): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}${path}`, { headers: serviceHeaders(env) });
}

async function servicePost(env: Env, path: string, body: unknown = {}): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: serviceHeaders(env, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const logsResp = await serviceGet(env, '/rest/v1/audit_logs?select=*&order=created_at.desc&limit=300');
  let logs: Array<{ actor_id?: string; actor_email?: string; details?: unknown }>;

  if (logsResp.ok) {
    logs = await logsResp.json();
  } else {
    const tableDetail = await logsResp.text().catch(() => '');
    const rpcResp = await servicePost(env, '/rest/v1/rpc/admin_get_audit_logs');
    if (!rpcResp.ok) {
      return json({
        error: 'Failed to fetch logs',
        detail: (await rpcResp.text()).slice(0, 200) || tableDetail.slice(0, 200),
      }, 500);
    }
    logs = await rpcResp.json();
  }

  const actorIds = [...new Set(logs.map((log) => log.actor_id).filter(Boolean))] as string[];
  let emailMap: Record<string, string> = {};
  if (actorIds.length > 0) {
    const params = new URLSearchParams({ select: 'id,email', id: `in.(${actorIds.join(',')})` });
    const profilesResp = await serviceGet(env, `/rest/v1/profiles?${params}`);
    if (profilesResp.ok) {
      const profiles: Array<{ id: string; email: string }> = await profilesResp.json();
      emailMap = Object.fromEntries(profiles.map((profile) => [profile.id, profile.email]));
    }
  }

  return json({
    logs: logs.map((log) => ({
      ...log,
      actor_email: log.actor_email || (log.actor_id ? (emailMap[log.actor_id] || 'unknown') : 'system'),
      details: typeof log.details === 'string' ? log.details : JSON.stringify(log.details || {}),
    })),
  });
};

export const onRequestOptions: PagesFunction<Env> = async () => (
  new Response(null, { status: 204, headers: corsHeaders })
);
