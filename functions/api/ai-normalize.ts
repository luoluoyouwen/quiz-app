interface Env {
  AI_NORMALIZE_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
}

const responseHeaders = { 'Content-Type': 'application/json' };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401);
  const userResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authHeader },
  });
  if (!userResponse.ok) return json({ error: 'Invalid session' }, 401);
  if (!env.AI_NORMALIZE_API_KEY) return json({ error: 'AI normalization is not configured' }, 503);

  const rawBody = await request.text();
  if (!rawBody || rawBody.length > 512 * 1024) return json({ error: 'Invalid request size' }, 413);

  let body: { messages?: Array<{ role?: string; content?: string }> };
  try { body = JSON.parse(rawBody); }
  catch { return json({ error: 'Invalid JSON body' }, 400); }

  const systemPrompt = body.messages?.find((item) => item.role === 'system')?.content?.trim() || '';
  const userText = body.messages?.find((item) => item.role === 'user')?.content?.trim() || '';
  if (!systemPrompt || !userText || systemPrompt.length > 12000 || userText.length > 200000) {
    return json({ error: 'Invalid normalization content' }, 400);
  }

  try {
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.AI_NORMALIZE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText },
        ],
        temperature: 0.05,
        max_tokens: Math.min(Math.max(userText.length * 2, 512), 32000),
      }),
      signal: AbortSignal.timeout(65_000),
    });
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upstream request failed';
    return json({ error: message }, 502);
  }
};
