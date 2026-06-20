import mammoth from 'mammoth';
import { parseTxt } from './txt';
import type { QuestionInput } from './types';

/**
 * Parse a DOCX file by extracting its text content via mammoth.js,
 * then applying the same TXT regex parser on the extracted text.
 *
 * @param arrayBuffer  The raw DOCX file bytes as an ArrayBuffer
 * @param nameHint     Optional bank name hint (e.g. filename without extension)
 */
export async function parseDocx(
  arrayBuffer: ArrayBuffer,
  nameHint?: string,
): Promise<{ bankName: string; questions: QuestionInput[] }> {
  const result = await mammoth.extractRawText({ arrayBuffer });

  if (result.messages) {
    const warnings = result.messages.filter((m) => m.type === 'warning');
    if (warnings.length > 0) {
      console.warn('mammoth warnings:', warnings);
    }
  }

  const text = result.value;
  if (!text || !text.trim()) {
    throw new Error('No text content found in the DOCX file');
  }

  return parseTxt(text, nameHint);
}
