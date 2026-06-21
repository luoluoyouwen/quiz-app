/**
 * AI Text Normalizer for exam paper DOCX parsing.
 *
 * Pre-processes raw DOCX text before feeding it to the regex-based
 * parseExamDocx() parser. An LLM normalizes whitespace, formatting,
 * and separator inconsistencies — without altering question content.
 *
 * Usage:
 *   import { normalizeText } from './normalize';
 *
 *   const raw = fs.readFileSync('exam.docx', 'utf-8');
 *   const clean = await normalizeText(raw);
 *   const result = parseExamDocx(clean);
 *
 * Token configuration (优先级从高到低):
 *   1. normalizeText(raw, { apiKey: 'sk-xxx' }) — 调用时传参
 *   2. 环境变量 AI_NORMALIZE_API_KEY
 *   3. 项目根目录 .env.normalize 文件中的 AI_NORMALIZE_API_KEY=
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// ── Types ──

export interface NormalizeOptions {
  /** LLM API key. Falls back to env/fallback */
  apiKey?: string;
  /** Model identifier (default: auto-detected from key prefix) */
  model?: string;
  /** Base URL for the OpenAI-compatible API (default: auto-detected) */
  baseUrl?: string;
  /** If the AI call fails, return the original text unchanged (default: true) */
  fallbackSilently?: boolean;
}

// ── Key resolution ──

let _envLoaded = false;
function ensureEnvLoaded(): void {
  if (_envLoaded) return;
  _envLoaded = true;
  try {
    const envPath = resolve(process.cwd(), '.env.normalize');
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2];
        }
      }
    }
  } catch {
    // Not running in Node.js (browser, bundled) — skip
  }
}

const DEEPSEEK_KEY = ''; // 请通过 .env.normalize 配置 API key

function resolveApiKey(passed?: string): string | undefined {
  // 1) 调用时传参
  if (passed && passed.length > 0) return passed;

  // 2) 环境变量
  if (typeof process !== 'undefined' && process.env?.AI_NORMALIZE_API_KEY) {
    return process.env.AI_NORMALIZE_API_KEY;
  }

  // 试试自动从 .env.normalize 加载到环境变量
  ensureEnvLoaded();
  if (typeof process !== 'undefined' && process.env?.AI_NORMALIZE_API_KEY) {
    return process.env.AI_NORMALIZE_API_KEY;
  }

  // 3) 内嵌 key（仅适用于这个项目）
  return DEEPSEEK_KEY;
}

// ── Prompt ──

const SYSTEM_PROMPT = `你是一个化工题库 DOCX 文本格式整理工具。你的任务是把各种混乱排版的题目文本整理成统一的规范格式，然后交给一个严格的正则解析器去解析。

注意：你只做格式规范化，绝不改题、不添题、不删题、不改答案、不改选项内容。

--- 你能遇到的错乱类型 ---

1. 选项排版混乱
   - 多个选项挤在同一行："A.一次风过大  B.一次风过小\tC.二次风过大"
   ➔ 拆成每行一个选项
   - 选项前缀格式不统一：A. / A、/ A．/ A) / A) / A: / A）
   ➔ 统一为 "A.xxx"（英文句点）
   - 选项后面的文字像 "C.排出泵内气体。"— 句点不是选项的一部分，去掉
   - 选项跨行（选项文字太长换行了）→ 合并回同一选项行

2. 答案标记位置混乱
   - 题头内联："（C）离心泵启动前..." 或 "离心泵启动前（C）..." 或 "离心泵启动前（ C ）"
   ➔ 保留在原位，不要移动。只统一括号样式为半角空格填充：（ C ）或（C）→（C）
   - 答案独占一行："答案：C" 或 "【答案】C" 或 "参考答案：C"
   ➔ 合并到该题的题头行末尾，不改变其他内容位置
   - 多选题答案："（ABCD）" 或 "（A,B,C）" → 统一为 "（ABCD）"

3. 题型标题变化
   - 一、填空题 / 一 填空题 / 一、 填空题 / 一. 填空题
   ➔ 统一为 "一 填空题"
   - 五 问答题 / 五 简答题 / 五 简答
   ➔ 统一为 "五 问答题"
   - 其他题型：二 单选题、三 多选题、四 判断题、五 问答题

4. 填空题空位混乱
   - 答案在原文中用各种方式标注：____ / ___ / （ ）/ 【 】/ 连续3+空格
   ➔ 保留原样不动——填空答案位置用连续3+个空格或____标识，不要删除
   - 填空答案用 、 枚举："氮气 、氢气  氧气"→保留枚举符号，空格保留

5. 空格/分隔符问题
   - **tab 字符必须替换为单个空格**（这是最常见的错误排版）
   - 全角空格（　）→ 替换为半角空格
   - 3+连续空格 → 保留（填空空位标记，不能破坏）
   - 2个连续空格 → 替换为1个空格（除非是填空标记的一部分）
   - 题号和题目之间、选项字母和选项文字之间：保持单个空格

6. 判断题格式
   - 原文："（√）..." 或 "（×）..." 或 "（对）..." 或 "（错）..."
   ➔ 保留原样，不要改动

7. 问答题格式
   - 问题独占一行，答案行用 "答：" 或 "答：" + 内容
   - 多行答案：保持顺序，不要合并
   - 答案编号：如 "1）..." "2）..." → 保留不合并

8. 其他格式问题
   - 全日制/半角符号混用：统一为中文标点（， 。、）
   - OCR 产生的多余空格：删除单词内部的多余空格
   - 文字中的英文/数字：保持原样
   - 题目间空行：保留（用于分隔不同题目）

9. 强制规则（优先级最高）
   - **文本中不能出现任何 tab 字符！！！必须全部替换为空格**
   - **不能添加、删除、修改任何中文字符**
   - **不要修改题目文字内容、选项文字、答案文字**
   - **不要创造不存在的题目或选项**
   - **不要删除任何题目**
   - **不要添加 markdown 标记、代码块、解释文字**
   - **只返回整理后的纯文本**

10. 输出格式总结
    - 每个题型标题独占一行，格式为 "一 填空题"
    - 每题一行或多行
    - 答案标记在题头最前面
    - 每个选项单独一行，前缀为 "A."
    - 判断题保持 "（√）..." 或 "（×）..."
    - 问答题保持 "答：" 格式
    - 题目之间用空行隔开

--- 正确输出示例 ---

输入：
一、单选题
1.离心泵启动前为什么要灌泵？（C）
A.防止汽蚀  B.防止干磨\tC.排出泵内气体

输出：
一 单选题

（C）离心泵启动前为什么要灌泵？
A.防止汽蚀
B.防止干磨
C.排出泵内气体

`;

// ── Core function ──

export async function normalizeText(
  raw: string,
  options: NormalizeOptions = {},
): Promise<string> {
  if (!raw || raw.trim().length === 0) return raw;

  // 部署版走 CF Pages Function 代理（key 在服务器端）
  const proxyUrl = (
    typeof import.meta !== 'undefined' &&
    (import.meta as any).env?.VITE_AI_NORMALIZE_PROXY
  ) || '';
  const useProxy = !!proxyUrl;

  if (!useProxy) {
    const apiKey = resolveApiKey(options.apiKey);
    if (!apiKey) {
      console.warn('[normalizeText] No API key configured — returning original text');
      return raw;
    }

    // ── 直接模式（本地开发）──
    const baseUrl = options.baseUrl ?? (apiKey.startsWith('sk-or-v1-')
      ? 'https://openrouter.ai/api/v1'
      : 'https://api.deepseek.com');
    const model = options.model ?? (apiKey.startsWith('sk-or-v1-')
      ? 'deepseek/deepseek-chat'
      : 'deepseek-chat');
    const fallback = options.fallbackSilently ?? true;

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildRequestBody(raw, model)),
        signal: AbortSignal.timeout(60_000),
      });
      return handleResponse(response, raw, fallback);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[normalizeText] Failed: ${msg}`);
      return fallback ? raw : Promise.reject(err);
    }
  }

  // ── 代理模式（部署版）──
  const proxyFallback = options.fallbackSilently ?? true;
  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestBody(raw, 'deepseek-chat')),
      signal: AbortSignal.timeout(65_000),
    });
    return handleResponse(response, raw, proxyFallback);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[normalizeText] Proxy failed: ${msg}`);
    return proxyFallback ? raw : Promise.reject(err);
  }
}

/** Build the request body shared by direct and proxy mode */
function buildRequestBody(raw: string, model: string) {
  return {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: raw },
    ],
    temperature: 0.05,
    max_tokens: Math.min(raw.length * 2, 32000),
  };
}

/** Parse the API response, handling the common logic */
async function handleResponse(
  response: Response,
  raw: string,
  fallback: boolean,
): Promise<string> {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`[normalizeText] API error ${response.status}: ${body.slice(0, 200)}`);
    if (fallback) return raw;
    throw new Error(`API error ${response.status}`);
  }

  const json: { choices?: { message?: { content?: string } }[] } = await response.json();
  const result = json?.choices?.[0]?.message?.content;

  if (!result || result.trim().length === 0) {
    console.warn('[normalizeText] Empty AI response — using original text');
    return raw;
  }

  return result
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n```\s*$/, '')
    .trim();
}
