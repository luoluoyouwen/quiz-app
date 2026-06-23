import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const isProd = import.meta.env.PROD;

// SDK 要求 URL 必须是完整 HTTP URL，用 custom fetch 在生产环境重写到代理
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
  global: {
    fetch: isProd
      ? async (url, options) => {
          const urlStr = url.toString();
          // 替换 Supabase URL 为本地代理路径
          const newUrl = urlStr.replace(supabaseUrl, '/api');
          return fetch(newUrl, options);
        }
      : undefined,
  },
});
