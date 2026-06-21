/**
 * CF Pages Function — AI 格式整理代理
 *
 * 将前端的 AI 规整请求转发到 DeepSeek API，
 * API key 仅存在 Cloudflare 环境变量中，不进前端 bundle。
 *
 * 环境变量需要配置：
 *   AI_NORMALIZE_API_KEY = sk-xxx
 */

interface Env {
  AI_NORMALIZE_API_KEY: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = env.AI_NORMALIZE_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'AI_NORMALIZE_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const body = await request.json();

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(65_000),
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
