import type { QuestionInput } from './types';

/**
 * Parse markdown quiz format.
 *
 * Format:
 *   ## Bank Name
 *     (optional description lines)
 *   ### Question 1   (or just a numbered line, ### acts as separator)
 *   Question text here
 *   - A. Option A
 *   - B. Option B
 *   - C. Option C
 *   - D. Option D
 *   **答案:** A
 *   *Explanation text*   (optional)
 *   --- or another ### separator
 *
 * Support:
 *   - choice: options as bullet list items prefixed with letter + period
 *   - fill: no option bullets, answer on **答案:** line
 *   - judge: answer is 对/错/正确/错误
 */
export function parseMarkdown(text: string): { bankName: string; questions: QuestionInput[] } {
  const lines = text.split(/\r?\n/);
  let bankName = 'Imported Markdown';
  const blocks: string[][] = [];
  let currentBlock: string[] = [];
  let inQuestion = false;

  for (const raw of lines) {
    const line = raw.trim();

    // Title line: ## Title -> bank name
    if (/^##\s+.+/.test(line)) {
      // If we had a previous block, flush it
      if (inQuestion && currentBlock.length > 0) {
        blocks.push([...currentBlock]);
        currentBlock = [];
        inQuestion = false;
      }
      bankName = line.replace(/^##\s*/, '').trim();
      continue;
    }

    // Separator: ### or --- or ___
    if (/^#{3,}\s*$/.test(line) || /^---+\s*$/.test(line) || /^___+\s*$/.test(line)) {
      if (currentBlock.length > 0) {
        blocks.push([...currentBlock]);
        currentBlock = [];
        inQuestion = false;
      }
      continue;
    }

    // Line starting with a number counts as question start
    if (/^\d+[\.\)、]/.test(line) || /^##?#?\s*\d+[\.\)、]/.test(line)) {
      if (inQuestion && currentBlock.length > 0) {
        blocks.push([...currentBlock]);
        currentBlock = [];
      }
      inQuestion = true;
      // Remove leading hashes if present
      const cleanLine = line.replace(/^#+\s*/, '');
      currentBlock.push(cleanLine);
      continue;
    }

    if (inQuestion) {
      currentBlock.push(line);
    }
  }

  // Flush last block
  if (currentBlock.length > 0) {
    blocks.push([...currentBlock]);
  }

  const questions: QuestionInput[] = [];

  for (const block of blocks) {
    const q = parseMarkdownBlock(block);
    if (q) questions.push(q);
  }

  if (questions.length === 0) {
    throw new Error('No questions found in the markdown content');
  }

  return { bankName, questions };
}

function parseMarkdownBlock(lines: string[]): QuestionInput | null {
  const cleaned = lines.map((l) => l.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;

  // Extract answer line: **答案:** X or **Answer:** X
  const answerIdx = cleaned.findIndex(
    (l) => /\*\*答案\s*[:：]\s*/i.test(l) || /\*\*answer\s*[:：]\s*/i.test(l),
  );

  let answer = '';
  let explanation: string | undefined;

  if (answerIdx >= 0) {
    const answerLine = cleaned[answerIdx];
    const ansMatch = answerLine.match(/\*\*答案\s*[:：]\s*([^*]+)/i)
      ?? answerLine.match(/\*\*answer\s*[:：]\s*([^*]+)/i);
    if (ansMatch) {
      const raw = ansMatch[1].trim();
      // Check for explanation in parentheses after answer
      const parenMatch = raw.match(/^([^（(]+)\s*[（(]\s*([^）)]+)\s*[）)]/);
      if (parenMatch) {
        answer = parenMatch[1].trim();
        explanation = parenMatch[2].trim();
      } else {
        answer = raw;
      }
    }
  }

  // Extract explanation from *italic* lines
  if (!explanation) {
    for (const line of cleaned) {
      const explMatch = line.match(/^\s*\*\*(.+?)\*\*\s*$/);
      if (explMatch) {
        explanation = explMatch[1].trim();
      }
    }
  }

  // Content lines: everything before the answer line, excluding option bullets
  const contentPart = answerIdx >= 0 ? cleaned.slice(0, answerIdx) : cleaned;

  // Find the first non-empty, non-option line as content
  const contentLines = contentPart.filter(
    (l) => !/^[-*]\s+[A-Da-d][\.\)、]/.test(l) && !/^\s*[-*]\s*$/.test(l),
  );

  const content = contentLines.join(' ').replace(/^\d+[\.\)、]\s*/, '').trim();

  if (!answer) {
    return null;
  }

  // Judge question
  if (/^[对错正确√×]$/.test(answer.trim())) {
    return {
      type: 'judge',
      content,
      answer: answer.trim(),
      explanation,
    };
  }

  // Choice: look for bullet options like "- A. text" or "* A. text"
  const optionLines = contentPart.filter((l) => /^[-*]\s+[A-Da-d][\.\)、]\s/.test(l));

  if (optionLines.length > 0) {
    return {
      type: 'choice',
      content,
      options: optionLines.map((l) => l.replace(/^[-*]\s+/, '').trim()),
      answer: answer.trim(),
      explanation,
    };
  }

  // Essay question (long answer) or fill-in-the-blank
  const trimmedAnswer = answer.trim();
  if (trimmedAnswer.length > 15) {
    return {
      type: 'essay',
      content,
      answer: trimmedAnswer,
      explanation,
    };
  }
  return {
    type: 'fill',
    content,
    answer: trimmedAnswer,
    explanation,
  };
}
