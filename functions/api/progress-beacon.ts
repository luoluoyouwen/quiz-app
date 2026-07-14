/**
 * Progress Beacon Proxy
 *
 * Receives sendBeacon POST requests from the browser and forwards them
 * to Supabase with proper authentication headers.
 *
 * navigator.sendBeacon() cannot set custom HTTP headers, so we use this
 * CF Pages Function as a proxy to inject the required apikey + Authorization
 * headers that Supabase requires.
 *
 * The proxy validates the browser JWT and forwards with the same user
 * Authorization header, so Supabase RLS still applies.
 */
interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Quick validation
  if (!env.SUPABASE_URL) {
    return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to read body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body || body.length < 10) {
    return new Response(JSON.stringify({ error: 'Empty or invalid body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (body.length > 512 * 1024) {
    return new Response(JSON.stringify({ error: 'Payload too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let rows: Array<{ user_id?: string }>;
  try {
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed)) throw new Error('Expected an array');
    rows = parsed;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (rows.length === 0 || rows.length > 500) {
    return new Response(JSON.stringify({ error: 'Invalid record count' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const userResp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: authHeader,
      },
    });

    if (!userResp.ok) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userData: { id?: string } = await userResp.json();
    const userId = userData.id;
    if (!userId || rows.some((row) => row.user_id !== userId)) {
      return new Response(JSON.stringify({ error: 'user_id does not match session' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/user_progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: authHeader,
        Prefer: 'return=minimal',
      },
      body,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error(`[progress-beacon] Supabase error ${resp.status}: ${errText.slice(0, 200)}`);
      return new Response(null, { status: 500 });
    }

    return new Response(null, { status: 200 });
  } catch (err) {
    console.error('[progress-beacon] Fetch error:', err);
    return new Response(null, { status: 500 });
  }
};

// Handle CORS preflight
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
};
