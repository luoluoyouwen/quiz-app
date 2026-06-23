interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SERVICE_ROLE_KEY: string;
}

// Decode a JWT without verification (extract payload for role checking)
function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const decoded = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const headers = new Headers(request.headers);

  // CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // 1. Verify the caller is authenticated
  const authHeader = headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '未授权：缺少登录令牌' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const token = authHeader.slice(7);
  const payload = decodeJWT(token);
  if (!payload || !payload.sub) {
    return new Response(JSON.stringify({ error: '无效的登录令牌' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // 2. Verify the caller is an admin by calling the profiles table
  // Use the user's own JWT to query their profile
  const profileUrl = `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${payload.sub}&select=role`;
  const profileRes = await fetch(profileUrl, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': env.SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!profileRes.ok) {
    return new Response(JSON.stringify({ error: '无法验证身份' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const profiles = await profileRes.json() as Array<{ role: string }>;
  if (!profiles.length || profiles[0].role !== 'admin') {
    return new Response(JSON.stringify({ error: '权限不足：仅管理员可执行此操作' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // 3. Parse request body
  let body: { user_id?: string; new_password?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: '请求体无效' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (!body.user_id || !body.new_password) {
    return new Response(JSON.stringify({ error: '缺少参数：user_id 和 new_password 必填' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (body.new_password.length < 6) {
    return new Response(JSON.stringify({ error: '密码至少 6 位' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // 4. Call Supabase Auth admin API to reset password
  // Use service_role key (secret key) via apikey header
  const adminUrl = `${env.SUPABASE_URL}/auth/v1/admin/users/${body.user_id}`;

  try {
    const adminRes = await fetch(adminUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        password: body.new_password,
        email_confirm: true,
      }),
    });

    if (!adminRes.ok) {
      const errText = await adminRes.text();
      console.error('Auth admin API error:', adminRes.status, errText);
      return new Response(JSON.stringify({
        error: `密码重置 API 调用失败 (${adminRes.status})`,
        detail: errText.slice(0, 200),
      }), {
        status: adminRes.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Extract user ID from response to confirm
    const userData = await adminRes.json() as { id?: string };

    return new Response(JSON.stringify({
      success: true,
      message: '密码重置成功',
      user_id: userData.id || body.user_id,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误';
    console.error('Password reset error:', msg);
    return new Response(JSON.stringify({ error: `密码重置失败：${msg}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};

// Handle OPTIONS preflight for CORS
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
