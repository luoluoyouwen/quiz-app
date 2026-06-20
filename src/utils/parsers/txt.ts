import type { QuestionInput } from './types';

/**
 * Parse TXT quiz format.
 *
 * Supported question types:
 *   choice — numbered question with A/B/C/D options and 答案: X line
 *   fill   — numbered question with no option lines, 答案: ... present
 *   judge  — numbered question with 答案: 对 or 答案: 错
 *
 * Format per question block:
 *   1. Question text
 *   A. Option A
 *   B. Option B
 *   C. Option C
 *   D. Option D
 *   答案: A
 *   --- (separator line, optional between questions)
 *
 * @param text  Raw TXT content
 * @param nameHint  Optional hint for bank name (e.g. filename without extension)
 */
export function parseTxt(text: string, nameHint?: string): { bankName: string; questions: QuestionInput[] } {
  const lines = text.split(/\r?\n/);
  const questions: QuestionInput[] = [];
  let currentLines: string[] = [];
  let bankName = nameHint ?? 'Imported TXT';

  // Look for a title on the very first line (non-empty, not a question number)
  const firstMeaningful = lines.find((l) => l.trim().length > 0);
  if (firstMeaningful && !/^\d+[\.\)、]/.test(firstMeaningful.trim())) {
    bankName = firstMeaningful.trim();
    // Remove the title line from processing
    const titleIdx = lines.findIndex((l) => l.trim() === firstMeaningful.trim());
    if (titleIdx >= 0) {
      lines.splice(titleIdx, 1);
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Separator line ends a question block
    if (/^---{3,}$/.test(line) || /^___+$/.test(line)) {
      const q = parseBlock(currentLines);
      if (q) questions.push(q);
      currentLines = [];
      continue;
    }

    // Line starting with a number begins a new question block
    if (/^\d+[\.\)、]/.test(line)) {
      const q = parseBlock(currentLines);
      if (q) questions.push(q);
      currentLines = [line];
      continue;
    }

    currentLines.push(line);
  }

  // Flush remaining block
  const q = parseBlock(currentLines);
  if (q) questions.push(q);

  if (questions.length === 0) {
    throw new Error('No questions found in the TXT content');
  }

  return { bankName, questions };
}

function parseBlock(lines: string[]): QuestionInput | null {
  if (lines.length === 0) return null;

  const cleaned = lines.map((l) => l.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;

  // Extract answer line first
  const answerIdx = cleaned.findIndex(
    (l) => /^答案\s*[:：]\s*/i.test(l),
  );

  let answer = '';
  let explanation: string | undefined;

  if (answerIdx >= 0) {
    const answerLine = cleaned[answerIdx];
    const answerMatch = answerLine.match(/^答案\s*[:：]\s*(.+)/i);
    if (answerMatch) {
      const rawAnswer = answerMatch[1].trim();
      // Check for explanation after answer
      if (rawAnswer.includes('（') || rawAnswer.includes('(')) {
        const explMatch = rawAnswer.match(/^([^（(]+)\s*[（(]\s*([^）)]+)\s*[）)]/);
        if (explMatch) {
          answer = explMatch[1].trim();
          explanation = explMatch[2].trim();
        } else {
          answer = rawAnswer;
        }
      } else {
        answer = rawAnswer;
      }
    }
  }

  // Remove answer line from consideration
  const contentLines = answerIdx >= 0 ? cleaned.slice(0, answerIdx) : cleaned;

  if (!answer) {
    throw new Error(
      `Missing 答案: line in block:\n${cleaned.join('\n')}`,
    );
  }

  // Detect type and parse
  const firstLine = contentLines[0];

  // Judge question: answer is 对/错/正确/错误/√/×
  if (/^[对错正确√×]$/.test(answer.trim())) {
    return {
      type: 'judge',
      content: firstLine.replace(/^\d+[\.\)、]\s*/, '').trim(),
      answer: answer.trim(),
      explanation,
    };
  }

  // Check for option lines: A. / A) / A、 etc.
  const optionLines = contentLines.slice(1).filter((l) => /^[A-Da-d][\.\)、]\s/.test(l));

  if (optionLines.length > 0) {
    // Choice question
    const content = firstLine.replace(/^\d+[\.\)、]\s*/, '').trim();
    return {
      type: 'choice',
      content,
      options: optionLines.map((l) => l.trim()),
      answer: answer.trim(),
      explanation,
    };
  }

  // Fill-in-the-blank question
  const content = contentLines.map((l) => l.replace(/^\d+[\.\)、]\s*/, '').trim()).join(' ');
  return {
    type: 'fill',
    content,
    answer: answer.trim(),
    explanation,
  };
}
