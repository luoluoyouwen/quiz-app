interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SERVICE_ROLE_KEY: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
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

async function serviceFetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(serviceHeaders(env));
  for (const [key, value] of new Headers(init.headers).entries()) headers.set(key, value);
  return fetch(`${env.SUPABASE_URL}${path}`, { ...init, headers });
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
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        actor_id: actorId,
        action,
        target_type: targetType,
        target_id: targetId,
        details: JSON.stringify(details),
      }),
    });
  } catch (err) {
    console.error('[admin/audit] failed:', err);
  }
}

async function getCreatorEmails(env: Env, creatorIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(creatorIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const params = new URLSearchParams({ select: 'id,email', id: `in.(${ids.join(',')})` });
  const resp = await serviceFetch(env, `/rest/v1/profiles?${params}`);
  if (!resp.ok) return {};
  const profiles: Array<{ id: string; email: string }> = await resp.json();
  return Object.fromEntries(profiles.map((profile) => [profile.id, profile.email]));
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const resp = await serviceFetch(env, '/rest/v1/question_banks?select=*&order=created_at.desc');
  if (!resp.ok) return json({ error: 'Failed to fetch banks', detail: (await resp.text()).slice(0, 200) }, 500);

  const banks: Array<{ created_by?: string }> = await resp.json();
  const emailMap = await getCreatorEmails(env, banks.map((bank) => bank.created_by || ''));
  return json({
    banks: banks.map((bank) => ({
      ...bank,
      creator_email: bank.created_by ? (emailMap[bank.created_by] || 'unknown') : 'unknown',
    })),
  });
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  let body: { bankId?: string; review_status?: 'pending' | 'approved' | 'rejected'; name?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  if (!body.bankId) return json({ error: 'bankId is required' }, 400);

  const update: Record<string, string> = {};
  if (body.review_status) update.review_status = body.review_status;
  if (body.name?.trim()) update.name = body.name.trim();
  if (Object.keys(update).length === 0) return json({ error: 'No changes provided' }, 400);

  const resp = await serviceFetch(env, `/rest/v1/question_banks?id=eq.${body.bankId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(update),
  });
  if (!resp.ok) return json({ error: 'Failed to update bank', detail: (await resp.text()).slice(0, 200) }, 500);

  const actions: string[] = [];
  if (body.review_status) actions.push(body.review_status === 'approved' ? 'approve_bank' : body.review_status === 'rejected' ? 'reject_bank' : 'update_bank_status');
  if (body.name?.trim()) actions.push('rename_bank');
  await writeAuditLog(env, admin.userId, actions.join('+') || 'update_bank', 'question_bank', body.bankId, update);

  return json({ ok: true });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const bankId = url.searchParams.get('bankId');
  if (!bankId) return json({ error: 'bankId is required' }, 400);

  const bankResp = await serviceFetch(env, `/rest/v1/question_banks?id=eq.${bankId}&select=id,name,created_by`);
  if (!bankResp.ok) return json({ error: 'Failed to fetch bank', detail: (await bankResp.text()).slice(0, 200) }, 500);
  const banks: Array<{ id: string; name?: string; created_by?: string }> = await bankResp.json();
  const bank = banks[0];
  if (!bank) return json({ error: 'Bank not found' }, 404);

  const deleteResp = await serviceFetch(env, `/rest/v1/question_banks?id=eq.${bankId}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  if (!deleteResp.ok) return json({ error: 'Failed to delete bank', detail: (await deleteResp.text()).slice(0, 200) }, 500);

  await writeAuditLog(env, admin.userId, 'delete_bank', 'question_bank', bankId, {
    name: bank.name || '',
    created_by: bank.created_by || '',
  });

  return json({ ok: true });
};

export const onRequestOptions: PagesFunction<Env> = async () => (
  new Response(null, { status: 204, headers: corsHeaders })
);
