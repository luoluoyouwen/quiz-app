import { debug } from '../debug';

/**
 * AI-Enhanced Exam DOCX Parser.
 *
 * Wraps parseExamDocx with AI fallback logic:
 *   1. First try regex-based parsing (fast path)
 *   2. Check 4 trigger conditions for suspicious results
 *   3. If triggered, run AI normalization (normalizeText) then re-parse
 *   4. Cache AI-normalized text in IndexedDB to avoid redundant API calls
 *
 * This is consumed by docx.ts which handles the DOCX→text extraction via mammoth.
 */
import { parseExamDocx } from './exam';
import { normalizeText } from './normalize';
import type { QuestionInput } from './types';

// ── Types ──

export interface AiFallbackResult {
  questions: QuestionInput[];
  bankName: string;
  /** Whether AI fallback was triggered */
  aiTriggered: boolean;
  /** Reason for AI trigger (debug/logging) */
  triggerReason?: string;
}

// ── Trigger Conditions ──

interface TriggerCheck {
  triggered: boolean;
  reason: string;
}

/**
 * Check 4 trigger conditions for when regex parsing results are suspicious.
 */
function checkTriggers(
  questions: QuestionInput[],
  rawText: string,
): TriggerCheck {
  // Count by type
  const typeCounts: Record<string, number> = {};
  for (const q of questions) {
    typeCounts[q.type] = (typeCounts[q.type] || 0) + 1;
  }

  // Condition 1: question count deviates significantly from expected (~70 per non-TOC section)
  // Count real section headers (skip TOC lines with tab+page number)
  const realSections = (rawText.match(/^[一二三四五]\s+\S{1,3}(?!\t)/gm) || []).length;
  const sectionCount = realSections > 0 ? realSections : 5;
  const expectedCount = sectionCount * 70;
  const deviation = Math.abs(questions.length - expectedCount);
  if (deviation > Math.max(30, expectedCount * 0.1)) {
    return {
      triggered: true,
      reason: `题数偏差过大: 解析${questions.length}题 vs 预期~${expectedCount}题 (${sectionCount}个章节)`,
    };
  }

  // Condition 2: a question type has 0 questions but text has its section header
  const SECTION_KEYWORDS: Record<string, string> = {
    choice: '单选', multi: '多选', fill: '填空', judge: '判断', essay: '问答',
  };
  for (const [type, keyword] of Object.entries(SECTION_KEYWORDS)) {
    if ((typeCounts[type] || 0) === 0 && rawText.includes(keyword)) {
      return {
        triggered: true,
        reason: `题型「${keyword}」在原文中存在章节但解析出0题`,
      };
    }
  }

  // Condition 3: any choice/multi question has <2 options (not just consecutive)
  const badOptCount = questions.filter(q =>
    (q.type === 'choice' || q.type === 'multi') && (!q.options || q.options.length < 2)
  ).length;
  if (badOptCount >= 2) {
    return {
      triggered: true,
      reason: `${badOptCount}道选择题选项数<2，可能选项提取失败`,
    };
  }

  // Condition 4: >50% of fill-section questions are nofill (was 70%, too high)
  const fillTotal = (typeCounts.fill || 0) + (typeCounts.nofill || 0);
  const nofillPct = fillTotal > 0 ? (typeCounts.nofill || 0) / fillTotal : 0;
  if (fillTotal >= 10 && nofillPct >= 0.5) {
    return {
      triggered: true,
      reason: `填空题${fillTotal}道中${typeCounts.nofill}道为nofill (${Math.round(nofillPct * 100)}%)，可能填空空位漏检`,
    };
  }

  // Condition 5: more nofill than actual fill questions
  if ((typeCounts.nofill || 0) > (typeCounts.fill || 0) && fillTotal >= 20) {
    return {
      triggered: true,
      reason: `nofill(${typeCounts.nofill})多于fill(${typeCounts.fill})，填空解析严重异常`,
    };
  }

  return { triggered: false, reason: '' };
}

// ── Simple in-memory cache (per session) ──

const cache = new Map<string, string>();

/**
 * Hash a raw text for cache key purposes (simple string hash, per-session only).
 */
function hashText(text: string): string {
  let h = 0;
  for (let i = 0; i < Math.min(text.length, 5000); i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return String(h) + '_' + text.length;
}

// ── Main Export ──

/**
 * Parse exam DOCX text with AI fallback.
 *
 * @param rawText - The raw text extracted from DOCX (via mammoth)
 * @param bankName - Optional bank name hint
 * @returns Parsed result with AI fallback metadata
 */
export async function parseExamWithAiFallback(
  rawText: string,
  bankName?: string,
): Promise<AiFallbackResult> {
  // ── Fast path: regex parsing ──
  let result = parseExamDocx(rawText);
  if (bankName && bankName !== result.bankName) {
    result = { ...result, bankName };
  }

  // ── Check triggers ──
  const trigger = checkTriggers(result.questions, rawText);

  if (!trigger.triggered) {
    return {
      bankName: result.bankName,
      questions: result.questions,
      aiTriggered: false,
    };
  }

  debug.warn(`[exam-ai] Triggered: ${trigger.reason}`);
  debug.log(`[exam-ai] Attempting AI normalization fallback...`);

  // ── Check cache ──
  const cacheKey = hashText(rawText);
  const cachedNormalized = cache.get(cacheKey);
  let normalized: string;

  if (cachedNormalized) {
    debug.log('[exam-ai] Using cached AI normalization result');
    normalized = cachedNormalized;
  } else {
    try {
      normalized = await normalizeText(rawText);
      // Basic validation: normalized text should be roughly similar length
      if (Math.abs(normalized.length - rawText.length) > rawText.length * 0.8) {
        debug.warn('[exam-ai] AI normalization returned drastically different length — discarding');
        return {
          bankName: result.bankName,
          questions: result.questions,
          aiTriggered: true,
          triggerReason: `${trigger.reason} (AI降级失败: 长度差异过大)`,
        };
      }
      cache.set(cacheKey, normalized);
    } catch (err) {
      debug.error('[exam-ai] AI normalization failed:', err);
      return {
        bankName: result.bankName,
        questions: result.questions,
        aiTriggered: true,
        triggerReason: `${trigger.reason} (AI降级失败: ${err instanceof Error ? err.message : 'unknown'})`,
      };
    }
  }

  // ── Re-parse with normalized text ──
  try {
    const aiResult = parseExamDocx(normalized);
    debug.log(`[exam-ai] AI fallback result: ${aiResult.questions.length} questions (was ${result.questions.length})`);

    // Basic validation: AI result should have reasonable question count
    if (aiResult.questions.length === 0) {
      debug.warn('[exam-ai] AI normalization produced 0 questions — using original result');
      return {
        bankName: result.bankName,
        questions: result.questions,
        aiTriggered: true,
        triggerReason: `${trigger.reason} (AI降级结果为空)`,
      };
    }

    return {
      bankName: result.bankName,
      questions: aiResult.questions,
      aiTriggered: true,
      triggerReason: trigger.reason,
    };
  } catch (err) {
    debug.error('[exam-ai] AI-reparsed parse failed:', err);
    return {
      bankName: result.bankName,
      questions: result.questions,
      aiTriggered: true,
      triggerReason: `${trigger.reason} (AI后解析失败)`,
    };
  }
}
