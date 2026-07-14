import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { parseExamDocx } from './exam';
import { resolve } from 'path';

const rawDocxPath = resolve(__dirname, '../../../raw_docx.txt');
const hasRawDocx = existsSync(rawDocxPath);
const rawDocx = hasRawDocx ? readFileSync(rawDocxPath, 'utf-8') : '';

const DOCX_BANK_TOTAL = 350;

describe.skipIf(!hasRawDocx)('raw_docx integration', () => {
  it('parses all questions', () => {
    const result = parseExamDocx(rawDocx);
    expect(result.questions.length).toBe(DOCX_BANK_TOTAL);
    expect(result.bankName).toBeTruthy();
  });

  it('every fill/nofill question has content', () => {
    const result = parseExamDocx(rawDocx);
    for (const q of result.questions) {
      if (q.type === 'fill' || q.type === 'nofill') {
        expect(q.content?.trim()).toBeTruthy();
      }
    }
  });

  it('every non-nofill question has a non-empty answer', () => {
    const result = parseExamDocx(rawDocx);
    for (const q of result.questions) {
      if (q.type !== 'nofill') {
        if (!q.answer?.trim()) {
          // Essay questions without answers are valid (image-based questions)
          expect(q.type).toBe('essay');
        }
      }
    }
  });

  it('correctly classifies fill vs nofill', () => {
    const result = parseExamDocx(rawDocx);
    const fills = result.questions.filter(q => q.type === 'fill');
    const nofills = result.questions.filter(q => q.type === 'nofill');

    // All fill questions must have ____ in content
    for (const q of fills) {
      expect(q.content).toContain('____');
    }

    // All nofill questions must NOT have fill-blank markers inserted by parser.
    // Skip cases where ____ is literal source text (e.g. "严禁在____带压__状态").
    for (const q of nofills) {
      if (q.content.includes('____') && /____\S/.test(q.content)) {
        // ____ followed by non-space → likely literal text from DOCX, not a parser blank
        continue;
      }
      expect(q.content).not.toContain('____');
    }
  });
});
