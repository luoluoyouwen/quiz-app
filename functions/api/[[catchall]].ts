interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // 路由分发：去掉 /api 前缀，其余原样透传到 Supabase
  let targetPath: string;
  if (url.pathname.startsWith('/api/auth')) {
    targetPath = url.pathname.replace('/api', '');
  } else if (url.pathname.startsWith('/api/rest')) {
    targetPath = url.pathname.replace('/api', '');
  } else {
    return new Response('Not found', { status: 404 });
  }

  // 保留查询参数
  const targetUrl = `${env.SUPABASE_URL}${targetPath}${url.search}`;

  // 转发请求头
  const headers = new Headers(request.headers);
  headers.set('Host', new URL(env.SUPABASE_URL).host);
  headers.set('apikey', env.SUPABASE_PUBLISHABLE_KEY);
  headers.delete('cookie');

  const body = ['GET', 'HEAD'].includes(request.method)
    ? undefined
    : await request.text();

  const proxyResponse = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
  });

  // 透传响应
  const responseHeaders = new Headers(proxyResponse.headers);
  responseHeaders.set('Access-Control-Allow-Origin', '*');

  return new Response(proxyResponse.body, {
    status: proxyResponse.status,
    headers: responseHeaders,
  });
};
