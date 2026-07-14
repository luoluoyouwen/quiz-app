export interface NormalizeOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fallbackSilently?: boolean;
}

// Clean UTF-8 prompt used only when the deterministic parser requests AI repair.
const SYSTEM_PROMPT = `你是化工题库 DOCX 文本格式整理工具。只修复排版，不得改题、增题、删题，也不得修改答案、选项和专业术语。

规则：
1. 将制表符和全角空格转换为普通空格，清理无意义的重复空格。
2. 每个选择题选项独占一行，统一写成 A.、B.、C.、D.；不要改变选项内容。
3. 保留原有答案标记，只统一括号和分隔符。多选答案保留原字母顺序。
4. 题型标题独占一行，保留填空题、单选题、多选题、判断题、问答题的原始归属。
5. 原文已有的填空标记统一为四个下划线；原文没有空位时不得自行挖空。
6. 判断题的对错标记保持原意；问答题的问题与答案顺序不得调整。
7. 不得添加 Markdown、解释、序号说明或任何原文不存在的内容。
8. 只返回整理后的纯文本。`;

function resolveApiKey(passed?: string): string | undefined {
  if (passed?.trim()) return passed.trim();
  if (typeof process !== 'undefined' && process.env?.AI_NORMALIZE_API_KEY) {
    return process.env.AI_NORMALIZE_API_KEY;
  }
  return undefined;
}

export async function normalizeText(raw: string, options: NormalizeOptions = {}): Promise<string> {
  if (!raw || raw.trim().length === 0) return raw;

  const proxyUrl = import.meta.env?.VITE_AI_NORMALIZE_PROXY || '';
  if (proxyUrl) {
    const { supabase } = await import('../../lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      if (options.fallbackSilently ?? true) return raw;
      throw new Error('AI normalization requires an authenticated session');
    }
    return requestNormalization(proxyUrl, raw, 'deepseek-chat', options.fallbackSilently ?? true, token);
  }

  const apiKey = resolveApiKey(options.apiKey);
  if (!apiKey) return raw;

  const baseUrl = options.baseUrl ?? (apiKey.startsWith('sk-or-v1-')
    ? 'https://openrouter.ai/api/v1'
    : 'https://api.deepseek.com');
  const model = options.model ?? (apiKey.startsWith('sk-or-v1-')
    ? 'deepseek/deepseek-chat'
    : 'deepseek-chat');

  return requestNormalization(
    `${baseUrl}/chat/completions`,
    raw,
    model,
    options.fallbackSilently ?? true,
    apiKey,
  );
}

async function requestNormalization(
  url: string,
  raw: string,
  model: string,
  fallback: boolean,
  authorizationToken?: string,
): Promise<string> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authorizationToken) headers.Authorization = 'Bearer ' + authorizationToken;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: raw },
        ],
        temperature: 0.05,
        max_tokens: Math.min(Math.max(raw.length * 2, 512), 32000),
      }),
      signal: AbortSignal.timeout(65_000),
    });
    return handleResponse(response, raw, fallback);
  } catch (error) {
    if (fallback) return raw;
    throw error;
  }
}

async function handleResponse(response: Response, raw: string, fallback: boolean): Promise<string> {
  if (!response.ok) {
    if (fallback) return raw;
    throw new Error(`AI normalization failed with status ${response.status}`);
  }

  const json: { choices?: Array<{ message?: { content?: string } }> } = await response.json();
  const result = json.choices?.[0]?.message?.content?.trim();
  if (!result) return raw;

  return result
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n```\s*$/, '')
    .trim();
}
