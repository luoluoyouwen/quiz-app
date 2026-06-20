/**
 * Parse a Chinese exam paper DOCX format.
 *
 * Supports sections:
 *   填空题  — blanks marked by 3+ spaces, answers extracted from between them
 *   单选题  — ( C ) answer inline, followed by A/B/C/D option lines
 *   多选题  — (ABCD) answer inline, followed by A/B/C/D option lines
 *   判断题  — （√）or （×）at end of statement
 *   问答题  — question line followed by 答： answer lines
 */
import type { QuestionInput } from '../parsers/types';

interface ParsedBlock {
  type: 'choice' | 'multi' | 'fill' | 'judge' | 'essay';
  content: string;
  options?: string[];
  answer: string;
  answers?: string[];
}

// ── Section detection ──

const SECTION_PATTERNS: Record<string, 'choice' | 'multi' | 'fill' | 'judge' | 'essay'> = {
  单选: 'choice',
  多选: 'multi',
  填空: 'fill',
  判断: 'judge',
  问答: 'essay',
};

function detectSection(line: string): string | null {
  for (const [key, value] of Object.entries(SECTION_PATTERNS)) {
    if (line.includes(key)) return value;
  }
  return null;
}

// ── Judge question: check if line has (√) or (×) ──

function tryParseJudge(line: string): ParsedBlock | null {
  const match = line.match(/[（(]\s*([√×])\s*[）)]/);
  if (!match) return null;
  const answer = match[1] === '√' ? '对' : '错';
  const content = line.replace(/[（(]\s*[√×]\s*[）)]\s*[。.]?\s*$/, '').trim();
  if (!content) return null;
  return { type: 'judge', content, answer };
}

// ── Choice question: check if line has (A)/(B)/(C)/(D) or (A,B,C) ──

function tryParseChoice(line: string): ParsedBlock | null {
  // Multi-choice: （ABCD）or (ABC) etc
  const multiMatch = line.match(/[（(]\s*([A-D]{2,})\s*[）)]/);
  if (multiMatch) {
    return { type: 'choice', content: '', answer: multiMatch[1] };
  }

  // Single choice: (C) or (　C　)
  const singleMatch = line.match(/[（(]\s*([A-D])\s*[）)]/);
  if (singleMatch) {
    return { type: 'choice', content: '', answer: singleMatch[1] };
  }

  return null;
}

// ── Fill question: extract answers between 3+ spaces ──

function tryParseFill(line: string): ParsedBlock | null {
  // Must have at least one segment of 2+ spaces
  if (!/\s{2,}/.test(line)) return null;

  // Extract text segments separated by 2+ spaces
  const parts = line.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  // Take segments at odd indices (1, 3, 5...) as answers.
  // Parts[0] = question prefix, even indices = continuation text, odd indices = answers
  const answers: string[] = [];
  for (let idx = 1; idx < parts.length; idx += 2) {
    let ans = parts[idx]
      .replace(/^[，、。；：,.;:：、，]+/, '')
      .replace(/[，、。；：,.;:：、，]+$/, '')
      .trim();
    // If answer contains inner spaces, take only up to the first
    // Chinese function word or sentence-ending context
    ans = ans.replace(/\s+(了|的|在|是|将|会|等|和|与|及|并|或|而|且|但|如|时|后|前|中|上|下|内|外|间|为|以|从|对|把|被|让|向|往|到|于|由|遭|受|给|才|就|还|也|都|再|又|却|便|则|虽|因|所|被|把).*$/, '');
    ans = ans.trim();
    if (ans) answers.push(ans);
  }

  if (answers.length === 0) return null;

  // Build content: text parts (even indices) kept, answer parts (odd indices) → ____
  const contentParts: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      contentParts.push(parts[i]);
    } else {
      contentParts.push('____');
    }
  }
  const content = contentParts.join('').trim();

  // Return ONE question with all answers
  return {
    type: 'fill',
    content,
    answer: answers[0],
    answers,
  };
}

// ── Essay question ──

function isQuestionLine(line: string): boolean {
  return /[？?]$/.test(line) || /如何|怎样|哪些|什么|为什么|简述|说明$/.test(line);
}

// ── Main parser ──

export function parseExamDocx(text: string): { bankName: string; questions: QuestionInput[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const questions: QuestionInput[] = [];

  let bankName = '主风岗位题库';
  let currentSection: string | null = null;
  let i = 0;

  // Find bank name from first meaningful line
  if (lines.length > 0 && !/^[一二三四五]\s/.test(lines[0])) {
    const nameLine = lines.find((l) => l.length > 2 && l.length < 50 && !/^(目录|主风|一|二|三|四|五)/.test(l));
    if (nameLine) bankName = nameLine;
  }

  while (i < lines.length) {
    const line = lines[i];

    // Detect section header
    const sectionKey = detectSection(line);
    if (sectionKey) {
      currentSection = sectionKey;
      i++;
      continue;
    }

    // Skip table of contents lines and header info
    if (/^\d+\s/.test(line) && !/^[A-Da-d]/.test(line)) {
      // TOC line like "一 填空题\t1" - skip
      if (line.length < 30 && /[一二三四五]/.test(line)) {
        i++;
        continue;
      }
    }
    
    if (/^(目录|主风岗位)/.test(line)) {
      i++;
      continue;
    }

    // Based on current section, try to parse
    if (currentSection === 'judge') {
      const q = tryParseJudge(line);
      if (q) {
        questions.push(q);
        i++;
        continue;
      }
    }

    if (currentSection === 'fill') {
      // Skip lines without blanks (informational text)
      if (/\s{2,}/.test(line)) {
        const q = tryParseFill(line);
        if (q) {
          questions.push(q);
          i++;
          continue;
        }
      }
    }

    if (currentSection === 'choice' || currentSection === 'multi') {
      const answerInfo = tryParseChoice(line);
      if (answerInfo) {
        // Determine single vs multi based on answer length
        const qType = answerInfo.answer.length > 1 ? 'multi' : 'choice';
        // Collect option lines that follow
        const options: string[] = [];
        let j = i + 1;
        while (j < lines.length) {
          const optLine = lines[j];
          if (/^[A-Da-d][.、．]/.test(optLine) || /^[A-Da-d]\s/.test(optLine)) {
            // Check if this line has multiple options (e.g. "A. text        B. text")
            const multiOpts = optLine.split(/\s{3,}/).filter(o => /^[A-Da-d][.、．]/.test(o.trim()) || /^[A-Da-d]\s/.test(o.trim()));
            if (multiOpts.length > 1) {
              multiOpts.forEach(o => options.push(o.trim()));
            } else {
              options.push(optLine.trim());
            }
            j++;
          } else {
            break;
          }
        }

        // Question content is the line minus the answer marker
        const content = line.replace(/[（(]\s*[A-D]{1,}\s*[）)]/, '').replace(/[。.]?\s*$/, '').trim();

        questions.push({
          type: qType,
          content: content || (qType === 'multi' ? '（多选题）' : ''),
          options: options.length > 0 ? options : undefined,
          answer: answerInfo.answer,
        });

        i = j;
        continue;
      }
    }

    if (currentSection === 'essay' || (!currentSection && isQuestionLine(line))) {
      // Essay: question line + 答： answer lines
      const questionText = line;
      const answerLines: string[] = [];
      let j = i + 1;

      while (j < lines.length) {
        const ansLine = lines[j];
        if (ansLine.startsWith('答：') || ansLine.startsWith('答:')) {
          answerLines.push(ansLine.replace(/^答[:：]\s*/, ''));
          j++;
        } else if (answerLines.length > 0 && !isQuestionLine(ansLine) && !detectSection(ansLine)) {
          // Continuation of answer
          answerLines.push(ansLine);
          j++;
        } else {
          break;
        }
      }

      if (answerLines.length > 0) {
        questions.push({
          type: 'essay',
          content: questionText,
          answer: answerLines.join('\n'),
        });
        i = j;
        continue;
      }
    }

    i++;
  }

  if (questions.length === 0) {
    throw new Error('未能从文档中解析出任何题目，请检查文件格式');
  }

  return { bankName, questions };
}
