import mammoth from 'mammoth';
import { parseTxt } from './txt';
import { parseExamDocx } from './exam';
import type { QuestionInput } from './types';

/**
 * Parses a DOCX file.
 * First attempts to detect whether the document is a structured exam paper
 * (Chinese化工 exam format with 填空题/单选题/多选题/判断题/问答题 sections).
 * If detection fails, falls back to TXT parser.
 *
 * @param arrayBuffer  The raw DOCX file bytes as an ArrayBuffer
 * @param nameHint     Optional bank name hint (e.g. filename without extension)
 */
export async function parseDocx(
  arrayBuffer: ArrayBuffer,
  nameHint?: string,
): Promise<{ bankName: string; questions: QuestionInput[] }> {
  const result = await mammoth.extractRawText({ arrayBuffer });

  const text = result.value;
  if (!text || !text.trim()) {
    throw new Error('No text content found in the DOCX file');
  }

  // Try exam format first for Chinese-language documents
  // Match loosely: any section header or fill-blank pattern
  const hasSectionHeaders = /(填空|单选|多选|判断|问答).*[（(]/.test(text) || /[（(]\s*[√×]\s*[）)]/.test(text);
  const hasFillBlanks = /\s{2,}[\u4e00-\u9fff\w]/.test(text) || /[\u4e00-\u9fff\w]\s{2,}/.test(text);

  if (hasSectionHeaders || hasFillBlanks) {
    try {
      return parseExamDocx(text);
    } catch {
      // Exam parser failed, fall through to TXT parser
    }
  }

  // Fall back to TXT parser
  return parseTxt(text, nameHint);
}
