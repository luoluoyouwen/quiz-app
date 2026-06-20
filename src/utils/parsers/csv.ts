import Papa from 'papaparse';
import type { QuestionInput } from './types';

/**
 * Parse CSV quiz data.
 *
 * Expected columns: type, content, options, answer, explanation, tags
 *   - type: 'choice' | 'fill' | 'judge'
 *   - content: Question text
 *   - options: Semicolon-separated option strings (e.g. "A. foo; B. bar; C. baz; D. qux")
 *   - answer: Correct answer
 *   - explanation: Optional explanation
 *   - tags: Comma-separated tag strings (e.g. "math, algebra, beginner")
 *
 * The first row is treated as a header. If the first cell is NOT one of the expected
 * column names, the first row may be treated as the bank name.
 */
export function parseCsv(text: string): { bankName: string; questions: QuestionInput[] } {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim().toLowerCase(),
  });

  if (result.errors.length > 0) {
    const firstErr = result.errors[0];
    throw new Error(`CSV parse error at row ${firstErr.row ?? '?'}: ${firstErr.message}`);
  }

  const rows = result.data;
  if (rows.length === 0) {
    throw new Error('CSV file is empty or has no data rows');
  }

  let bankName = 'Imported CSV';
  const questions: QuestionInput[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const typeRaw = (row.type ?? '').trim().toLowerCase();
    const content = (row.content ?? '').trim();
    const optionsRaw = (row.options ?? '').trim();
    const answer = (row.answer ?? '').trim();
    const explanation = (row.explanation ?? '').trim();
    const tagsRaw = (row.tags ?? '').trim();

    if (!content) {
      throw new Error(`Row ${i + 1}: missing "content"`);
    }

    if (!answer) {
      throw new Error(`Row ${i + 1}: missing "answer"`);
    }

    const validTypes = ['choice', 'fill', 'judge'];
    if (!validTypes.includes(typeRaw)) {
      throw new Error(
        `Row ${i + 1}: invalid type "${typeRaw}". Must be one of: ${validTypes.join(', ')}`,
      );
    }

    const q: QuestionInput = {
      type: typeRaw as 'choice' | 'fill' | 'judge',
      content,
      answer,
    };

    if (optionsRaw) {
      q.options = optionsRaw
        .split(';')
        .map((o: string) => o.trim())
        .filter(Boolean);
    }

    if (explanation) {
      q.explanation = explanation;
    }

    if (tagsRaw) {
      q.tags = tagsRaw
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean);
    }

    questions.push(q);
  }

  return { bankName, questions };
}
