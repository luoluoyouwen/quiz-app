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
  type: 'choice' | 'multi' | 'fill' | 'judge' | 'essay' | 'nofill';
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
  // Only match actual section headers like "一 填空题", "二 单选题", etc.
  // NOT arbitrary text that happens to contain "判断" etc. in the middle.
  const headerMatch = line.match(/^[一二三四五]\s+(.+?)$/);
  if (!headerMatch) return null;
  const sectionName = headerMatch[1];
  for (const [key, value] of Object.entries(SECTION_PATTERNS)) {
    if (sectionName.includes(key)) return value;
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
  // ── Try 2+ space delimiters (primary) ──
  if (/\s{2,}/.test(line)) {
    const parts = line.split(/\s{2,}|(?<=及|与|和|或)\s/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const result = extractFillAnswers(parts);
      if (result) return result;
    }
  }

  // ── Single-space fill fallback: detect "prefix answer suffix" patterns ──
  // Match terms bounded by single spaces where the adjacent chars aren't punctuation
  // (avoids matching enumeration like "氮气 、氢气")
  type Span = { term: string; start: number; end: number };
  const spans: Span[] = [];
  // Scan char by char to find single-space bounded terms
  for (let pos = 0; pos < line.length; pos++) {
    // Find start of a single-space run
    if (line[pos] === ' ' || line[pos] === '\u3000') {
      const spaceStart = pos;
      while (pos < line.length && (line[pos] === ' ' || line[pos] === '\u3000')) pos++;
      const spaceLen = pos - spaceStart;
      if (spaceLen !== 1) continue; // single space only
      const before = spaceStart > 0 ? line[spaceStart - 1] : '';
      // Find end of term
      const termStart = pos;
      while (pos < line.length && line[pos] !== ' ' && line[pos] !== '\u3000') pos++;
      const term = line.substring(termStart, pos);
      // Check trailing space
      if (pos >= line.length || (line[pos] !== ' ' && line[pos] !== '\u3000')) continue;
      // Skip one space after the term
      pos++;
      // Valid fill blank: char before the first space must NOT be enumeration punctuation
      // (e.g. "、氢气" is enumeration, "承 油膜不容易建立 ，会" is a fill blank)
      const punctBefore = /^[、，。；：,.;:：、，）)\]》」』>]$/;
      if (before && !punctBefore.test(before) && term.length > 0 && !punctBefore.test(term[0])) {
        spans.push({ term, start: spaceStart, end: pos });
      }
    }
  }

  if (spans.length > 0) {
    const answers: string[] = spans.map(s => s.term);
    // Build content by replacing each answer span with ____
    let content = '';
    let lastIdx = 0;
    for (const span of spans) {
      content += line.substring(lastIdx, span.start);
      content += '____';
      lastIdx = span.end;
    }
    content += line.substring(lastIdx);
    content = content.trim();
    return { type: 'fill', content, answer: answers[0], answers };
  }

  return null;
}

// Extract fill answers from parts split by whitespace/pattern delimiters.
// Single-pass linear scan: preserves original order, promotes "、"
// enumeration segments (short text after Chinese enumeration comma) to answers,
// and applies alternating content/answer pattern for the rest.
function extractFillAnswers(parts: string[]): ParsedBlock | null {
  const contentParts: string[] = [parts[0]];
  const rawAnswers: string[] = [];

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];

    // Check for "、" enumeration: short text after "、" is an answer continuation
    const enumMatch = part.match(/^、\s*(.{1,7})[。]?$/);
    const looseMatch = part.match(/^、\s(.{1,8})$/);

    if (enumMatch || looseMatch) {
      // Enumeration → answer; "、" alone stays as content separator
      const text = (enumMatch || looseMatch)![1].trim();
      rawAnswers.push(text);
      contentParts.push('、');
    } else {
      // Alternating pattern: odd index = answer, even index = content
      if (i % 2 === 0) {
        contentParts.push(part);
      } else {
        rawAnswers.push(part);
      }
    }
  }

  // Clean answers
  const cleanAnswers: string[] = [];
  for (const ans of rawAnswers) {
    let cleaned = ans
      .replace(/^[，、。；：,.;:：、，]+/, '')
      .replace(/[，、。；：,.;:：、，]+$/, '')
      .trim();
    // Strip content after space+Chinese punctuation when followed by stop words
    cleaned = cleaned.replace(/\s[、，]\s*[^会将]*[会将].*$/, '');
    // Strip content after space+stop word (existing heuristic)
    cleaned = cleaned.replace(/\s+(了|的|在|是|将|会|等|和|与|及|并|或|而|且|但|如|时|后|前|中|上|下|内|外|间|为|以|从|对|把|被|让|向|往|到|于|由|遭|受|给|才|就|还|也|都|再|又|却|便|则|虽|因|所|被|把).*$/, '');
    cleaned = cleaned.trim();
    if (cleaned) cleanAnswers.push(cleaned);
  }

  if (cleanAnswers.length === 0) return null;

  // Build content: interleave contentParts with blanks, one per answer
  const finalParts: string[] = [];
  for (let i = 0; i < contentParts.length; i++) {
    finalParts.push(contentParts[i]);
    if (i < cleanAnswers.length) {
      finalParts.push('____');
    }
  }
  // Extra blanks if more answers than contentParts slots
  for (let ai = contentParts.length; ai < cleanAnswers.length; ai++) {
    finalParts.push('____');
  }

  const content = finalParts.join('').trim();
  return { type: 'fill', content, answer: cleanAnswers[0], answers: cleanAnswers };
}

// ── Essay question ──

// Pattern for answer lines that don't start with 答： but are obviously answers
// (numbered lists like "1）text", "①text", "(1) text")
function isAnswerStart(line: string): boolean {
  return /^\d+[）.、]/.test(line) || /^[①-⑩]/.test(line) || /^\(\d+\)/.test(line);
}

function isQuestionLine(line: string): boolean {
  return /[？?]$/.test(line) || /如何|怎样|哪些|什么|为什么|简述|说明|方法$|步骤$/.test(line);
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
      const q = tryParseFill(line);
      if (q) {
        questions.push(q);
        i++;
        continue;
      }
      // Lines in fill section that have no fill blanks → 无空填空题 (背题 only)
      if (line.length > 5) {
        questions.push({
          type: 'nofill',
          content: line,
          answer: '',
        });
        i++;
        continue;
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
            const multiOpts = optLine.split(/\t| {2,}(?=[A-Da-d][.、．])/).filter(o => /^[A-Da-d][.、．]/.test(o.trim()) || /^[A-Da-d]\s/.test(o.trim()));
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
        } else if (answerLines.length === 0 && isAnswerStart(ansLine)) {
          // Handle answers starting with numbered lists like "1）text"
          answerLines.push(ansLine);
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
