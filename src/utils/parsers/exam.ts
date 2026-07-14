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
  // NOT TOC entries like "一 填空题\t1" (tab + page number suffix)
  if (/\t\d+\s*$/.test(line)) return null;
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

// ── Strip option prefix (A. / A、/ A．/ A) / A）/ A: / A（space)) ──

function stripOptionPrefix(opt: string): string {
  return opt.replace(/^[A-Ea-e](?:[.、．)）:：\s\u3000]+\s*)?/, '');
}

// ── Choice question: check if line has (A)/(B)/(C)/(D) or (A,B,C) ──

function tryParseChoice(line: string): ParsedBlock | null {
  // Multi-choice: （ABCD）or (ABC) etc
  const multiMatch = line.match(/[（(]\s*([A-E]{2,})\s*[）)]/);
  if (multiMatch) {
    return { type: 'choice', content: '', answer: multiMatch[1] };
  }

  // Single choice: (C) or (　C　)
  const singleMatch = line.match(/[（(]\s*([A-E])\s*[）)]/);
  if (singleMatch) {
    return { type: 'choice', content: '', answer: singleMatch[1] };
  }

  return null;
}

// ── Fill question: extract answers between 3+ spaces ──

function tryParseFill(line: string): ParsedBlock | null {
  const explicitBlankPattern = /\{\{BLANK:([^}]*)\}\}/g;
  const cleanExplicitAnswer = (value: string) =>
    value
      .replace(/^[，,。.;；:：、\s]+/, '')
      .replace(/[，,。.;；:：、\s]+$/, '')
      .trim();
  const explicitAnswers = [...line.matchAll(explicitBlankPattern)]
    .map((match) => cleanExplicitAnswer(match[1]))
    .filter(Boolean);
  if (explicitAnswers.length > 0) {
    const content = line
      .replace(explicitBlankPattern, '____')
      .replace(/_{4,}/g, '____')
      .replace(/\s+([，,。.;；:：、])/g, '$1')
      .trim();
    return {
      type: 'fill',
      content,
      answer: explicitAnswers[0],
      answers: explicitAnswers,
    };
  }

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
      let term = line.substring(termStart, pos);
      if (/^[A-Za-z]+$/.test(term)) {
        const afterFirstToken = pos;
        while (pos < line.length && (line[pos] === ' ' || line[pos] === '\u3000')) pos++;
        const nextTokenStart = pos;
        while (pos < line.length && line[pos] !== ' ' && line[pos] !== '\u3000') pos++;
        const nextToken = line.substring(nextTokenStart, pos);
        if (/^[A-Za-z0-9][A-Za-z0-9./+\-]*$/.test(nextToken) && /\d/.test(nextToken)) {
          term = `${term} ${nextToken}`;
        } else {
          pos = afterFirstToken;
        }
      }
      // Check trailing: allow end-of-line, trailing space, or sentence-ending punctuation
      const atEOL = pos >= line.length;
      const nextChar = atEOL ? '' : line[pos];
      const isTrailingOK = atEOL
        || nextChar === ' '
        || nextChar === '\u3000'
        || (/^[\u3002.\uff01!\uff1f?]$/.test(nextChar));
      if (!isTrailingOK) continue;
      // Skip trailing space if present
      if (!atEOL && (nextChar === ' ' || nextChar === '\u3000')) pos++;
      // Valid fill blank: char before the first space must NOT be enumeration punctuation
      // (e.g. "、氢气" is enumeration, "承 油膜不容易建立 ，会" is a fill blank)
      const punctBefore = /^[、，。；：,.;:：、，）)\]》」』>]$/;
      if (before && !punctBefore.test(before) && term.length > 1 && !punctBefore.test(term[0])
        && (pos < line.length ? line[pos] !== '、' : true)) {
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

// Extract fill answers from parts split by \s{2,} (and optionally by
// conjunctive single-space boundaries like 及/与/和/或).
//
// Two common patterns:
//   Type A (alternating): [content, answer, content, answer, ...]
//     e.g. "提供    润滑油  及 调节油   并采用"
//   Type B (sequential):  [content, answer, answer, answer, ...]
//     e.g. "工业分析： 水分    灰分   挥发分   固定碳。"
//
// We detect the pattern by checking if parts[2] is answer-like or content-like.
function extractFillAnswers(parts: string[]): ParsedBlock | null {
  if (parts.length < 2) return null;

  // ── Classification helpers ──
  const isConjunctionOnly = (s: string): boolean =>
    /^[及与和或、，]+$/.test(s.trim());

  const isAnswerLike = (s: string): boolean => {
    const t = s.trim();
    if (t.length === 0 || t.length > 15) return false;
    if (isConjunctionOnly(t)) return false;
    // Contains number + unit → strong answer signal
    if (/\d/.test(t) && /[℃%KPa\/\-~<>≤≥]/.test(t)) return true;
    // Short technical term (all CJK, no conjunctions/verbs)
    if (/^[一-鿿\d\s\-.℃%KPa\/]+$/.test(t) && t.length <= 6) return true;
    // Very short, no punctuation
    if (t.length <= 3 && /^[一-鿿\d]+$/.test(t)) return true;
    return false;
  };

  // ── Classify segments ──
  const contentParts: string[] = [parts[0]];
  const rawAnswers: string[] = [];

  // Detect pattern: if both parts[1] and parts[2] are answer-like, use sequential
  const parts1Answer = parts.length > 1 && isAnswerLike(parts[1]);
  const parts2Answer = parts.length > 2 && isAnswerLike(parts[2]);
  const sequential = parts1Answer && parts2Answer;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];

    // Enumeration
    const enumMatch = part.match(/^、\s*(.{1,10})[。]?$/);
    if (enumMatch) {
      rawAnswers.push(enumMatch[1].trim());
      contentParts.push('、');
      continue;
    }

    if (sequential) {
      // Type B: all segments after leading content are answers
      if (isAnswerLike(part)) {
        rawAnswers.push(part);
      } else if (isConjunctionOnly(part)) {
        contentParts.push(part);
      } else {
        // Could be a multi-word answer or trailing content
        // Check if it contains embedded answer at start
        const m = part.match(/^(\S{1,10})\s+(.{3,})/);
        if (m && isAnswerLike(m[1])) {
          rawAnswers.push(m[1]);
          contentParts.push(m[2]);
        } else {
          rawAnswers.push(part);
        }
      }
    } else {
      // Type A: alternating content/answer starting from answer
      if (i % 2 === 1) {
        // Odd → answer
        rawAnswers.push(part);
      } else {
        // Even → content
        contentParts.push(part);
      }
    }
  }

  // ── Clean answers ──
  const cleanAnswers: string[] = [];
  for (const ans of rawAnswers) {
    // Skip pure conjunctions
    if (isConjunctionOnly(ans)) continue;
    let cleaned = ans
      .replace(/^[，、。；：,.;:：、，\s]+/, '')
      .replace(/[，、。；：,.;:：、，\s]+$/, '')
      .trim();
    // Strip content after space+punctuation when followed by long text
    cleaned = cleaned.replace(/\s[、，]\s*.{5,}$/, '');
    // Strip single-space content: "答案 后缀长文本" → "答案"
    // But NOT if the rest also looks like technical content (units, numbers, etc.)
    const spaceSplit = cleaned.split(/\s+/);
    if (spaceSplit.length >= 2) {
      const rest = spaceSplit.slice(1).join('');
      // Rest looks like answer continuation if it has digits/symbols/units, OR is ≤2 CJK chars
      const isCJKOnly = /^[一-鿿]+$/.test(rest);
      const restLooksAnswer = /\d/.test(rest) || /[℃%KPaM]/.test(rest) || (isCJKOnly && rest.length <= 2);
      // Strip CJK-only trailing text that clearly isn't part of the answer
      const shouldStrip = isAnswerLike(spaceSplit[0]) && !restLooksAnswer && (isCJKOnly || rest.length >= 5);
      if (shouldStrip) {
        cleaned = spaceSplit[0];
      }
    }
    cleaned = cleaned.trim();
    if (cleaned && !isConjunctionOnly(cleaned)) cleanAnswers.push(cleaned);
  }

  if (cleanAnswers.length === 0) return null;

  // ── Build content with blanks ──
  const finalParts: string[] = [];
  for (let i = 0; i < contentParts.length; i++) {
    finalParts.push(contentParts[i]);
    if (i < cleanAnswers.length) {
      finalParts.push('____');
    }
  }
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
  return /^\d+[）.、]/.test(line) || /^[①-⑩]/.test(line) || /^[（(]\d+[）)]/.test(line);
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
    if (/^\d+\s/.test(line) && !/^[A-Ea-e]/.test(line)) {
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
      // Lines in fill section that have no fill blanks → 背记题 (背题 only)
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
          // Skip empty lines between options
          if (!optLine.trim()) { j++; continue; }
          // Skip lines that look like options (start with A-E + CJK) but actually contain
          // an answer marker like （A） — they are new questions, not options
          if (/^[A-Ea-e](?:[\u4e00-\u9fff])/.test(optLine) && /[（(]\s*[A-E]{1,}\s*[）)]/.test(optLine)) {
            break;
          }
          if (/^[A-Ea-e](?:[.、．)）:：\s\u3000]|[\u4e00-\u9fff])/.test(optLine)) {
            const multiOpts = optLine.split(/\t| {2,}(?=[A-Ea-e](?:[.、．)）:：\s\u3000]|[\u4e00-\u9fff]))|\s(?=[A-Ea-e](?:[.、．\s\u3000]|[\u4e00-\u9fff]))|(?=[A-Ea-e](?:[.、．]))/).filter(o => /^[A-Ea-e](?:[.、．\s\u3000]|[\u4e00-\u9fff])/.test(o.trim()));
            if (multiOpts.length > 1) {
              multiOpts.forEach(o => options.push(stripOptionPrefix(o.trim())));
            } else {
              options.push(stripOptionPrefix(optLine.trim()));
            }
            j++;
          } else if (options.length === 0) {
            // If this line has its own answer marker like （A）, it's a new question
            if (/[（(]\s*[A-E]{1,}\s*[）)]/.test(optLine)) {
              break;
            }
            // ——— New: missing "A." prefix ———
            // e.g. "转速    B.风量     C.加载力     D.给煤量"
            // First option lacks "A." prefix, B/C/D have proper prefixes
            if (/\S\s{2,}[B-Eb-e][.、．)）]/.test(optLine)) {
              const parts = optLine.split(/\t| {2,}/).filter(p => p.trim());
              options.push(parts[0].trim());
              for (let k = 1; k < parts.length; k++) {
                options.push(stripOptionPrefix(parts[k].trim()));
              }
              j++;
            } else if ((() => {
              let nextOpt = '';
              for (let k = j + 1; k < Math.min(j + 5, lines.length); k++) {
                const trimmed = lines[k].trim();
                if (trimmed) { nextOpt = trimmed; break; }
              }
              return !!nextOpt && /^[Bb][.):\s]/.test(nextOpt) && !detectSection(optLine);
            })()) {
              options.push(optLine.trim());
              j++;
            // ——— New: skip ①-⑩ definition lines ———
            // e.g. "①旋转分离器转速  ②磨辊作用力…" between question and options
            } else if (/^[①-⑩]/.test(optLine)) {
              j++;
            } else {
              break;
            }
          } else if (options.length > 0 && /^\p{Script=Han}/u.test(optLine.trim())
                     && !/[（(]\s*[A-Z]{1,}\s*[）)]/.test(optLine)) {
            // ——— Section header guard ——— never consume a section header as option content
            if (detectSection(optLine)) break;

            // ——— Option continuation: previous option was truncated (ends mid-sentence) ———
            // e.g. "A.特种设备使用单位...安全监管的部" + "门办理使用登记,取得使用登记证书"
            const lastOpt = options[options.length - 1];
            const lastOptTruncated = lastOpt && !/[。；]$/.test(lastOpt) && lastOpt.length > 10;
            if (lastOptTruncated) {
              // Append continuation to the previous option
              options[options.length - 1] = lastOpt + optLine.trim();
              j++; continue;
            }

            // ——— Missing middle option prefix ———
            // e.g. options A/B collected, then CJK line (missing "C." prefix) on line 729,
            // then next non-empty line starts with "D.有关..." (line 731).
            // The CJK line IS the C option, and D is the next expected letter.
            let nextOpt = '';
            for (let k = j + 1; k < Math.min(j + 5, lines.length); k++) {
              const trimmed = lines[k].trim();
              if (trimmed) { nextOpt = trimmed; break; }
            }
            // Current CJK line should be the option at position options.length (A=0,B=1,C=2,...)
            // Next non-empty line should start with the next letter (D when C is missing)
            const expectedNextLetter = String.fromCharCode(66 + options.length); // C missing → D expected
            if (nextOpt && new RegExp('^' + expectedNextLetter + '[.、．)）]').test(nextOpt)) {
              options.push(optLine.trim());
              j++; continue;
            }
            break;
          } else if (/^[A-Ea-e]/.test(optLine) && /\s{2,}[A-Ea-e](?:[.、．)）:：\s\u3000]|[\u4e00-\u9fff])/.test(optLine)
                     && !/[（(]\s*[A-E]{1,}\s*[）)]/.test(optLine)) {
            // ——— Continuation option line with non-standard first separator ———
            // e.g. "C-301 停机联锁                  D. 旋转阀压差联锁"
            // First option starts with letter followed by non-separator (-301),
            // but line has B/D/E options with standard separators later
            const parts = optLine.split(/\t| {2,}(?=[A-Ea-e](?:[.、．)）:：\s\u3000]|[\u4e00-\u9fff]))/).filter(p => p.trim());
            if (parts.length > 1) {
              for (const part of parts) {
                if (/^[A-Ea-e]/.test(part)) {
                  options.push(stripOptionPrefix(part));
                }
              }
            } else {
              options.push(stripOptionPrefix(optLine.trim()));
            }
            j++;
          } else {
            break;
          }
        }

        // Question content: replace answer marker with ____ if in the middle of the stem
        let content = line
          .replace(/[（(]\s*[A-E]{1,}\s*[）)]\s*[。.]?\s*$/, '') // trailing marker → remove
          .replace(/^[（(]\s*[A-E]{1,}\s*[）)]\s*/, '') // leading marker → remove
          .replace(/[（(]\s*[A-E]{1,}\s*[）)]/, '____') // middle marker → replace with blank
          .replace(/[。.]?\s*$/, '')
          .trim();

        // ——— Inline options: when forward scan found none, check if options
        // are concatenated on the same line as the question (no space between them).
        // e.g. "question？（ABCD）A.opt1B.opt2C.opt3D.opt4"
        // After marker replacement: "question____A.opt1B.opt2C.opt3D.opt4"
        if (options.length === 0) {
          const inlineOptsMatch = content.match(/[A-D][.、．]/);
          if (inlineOptsMatch && (inlineOptsMatch.index ?? -1) > 0) {
            const optStart = inlineOptsMatch.index!;
            const questionText = content.substring(0, optStart).replace(/[_…]+\s*$/, '').trim();
            const optText = content.substring(optStart);
            const optParts = optText.split(/(?=[A-D][.、．])/).filter(p => /^[A-D][.、．]/.test(p.trim()));
            if (optParts.length >= 2) {
              content = questionText;
              options.length = 0;
              optParts.forEach(p => options.push(stripOptionPrefix(p.trim())));
            }
          }
        }

        const finalAnswer = qType === 'multi' && options.length > 0
          ? answerInfo.answer.split('').filter(c => {
              const idx = c.charCodeAt(0) - 65;
              return idx >= 0 && idx < options.length;
            }).join('')
          : answerInfo.answer;
        questions.push({
          type: qType,
          content: content || (qType === 'multi' ? '（多选题）' : ''),
          options: options.length > 0 ? options : undefined,
          answer: finalAnswer,
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
        if (ansLine.startsWith('答：') || ansLine.startsWith('答:') || /^答[（(]/.test(ansLine) || /^答案[:：]/.test(ansLine)) {
          const cleaned = ansLine.replace(/^(?:答|答案)[：:（(]\s*/, '');
          answerLines.push(cleaned);
          j++;
        } else if (answerLines.length === 0 && isAnswerStart(ansLine)) {
          // Handle answers starting with numbered lists like "1）text"
          answerLines.push(ansLine);
          j++;
        } else if (answerLines.length > 0) {
          // Use look-ahead for edge cases: lines matched by 方法$/步骤$ are new
          // questions only if followed by 答：; lines ending with ？ are always new.
          if (isQuestionLine(ansLine)) {
            if (/[？?]$/.test(ansLine)) {
              // Lines ending with ？ are always new questions
              break;
            }
            // Lines matching via 方法$/步骤$: only break if followed by 答：
            const nextIsAnswer = j + 1 < lines.length && (/^答[：:（(]/.test(lines[j + 1]) || /^答案[:：]/.test(lines[j + 1]));
            if (nextIsAnswer) {
              break;
            }
            // Otherwise it's an answer sub-header — continue collecting
          }
          if (detectSection(ansLine)) {
            break;
          }
          // Existing answer continuation check: numbered list items stay as answer
          // (e.g. "1.xxx", "(1)xxx", "①xxx")
          // NEW: standalone line (not a numbered-list continuation) followed by
          // 答： → this is a new essay question, not answer continuation
          // (e.g. "2#集油箱液位（LICA-001Z4/002Z4）调整：" followed by "答：")
          if (!isAnswerStart(ansLine)) {
            const nextIsAnswer = j + 1 < lines.length && (/^答[：:（(]/.test(lines[j + 1]) || /^答案[:：]/.test(lines[j + 1]));
            if (nextIsAnswer) {
              break;
            }
          }
          // Sub-header or continuation of answer
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

      // Answerless essay question: still keep it (likely an image-based question)
      // The answer is the image itself, stored in the `image` field later
      questions.push({
        type: 'essay',
        content: questionText,
        answer: '',
      });
      i = i + 1;
      continue;
    }

    i++;
  }

  if (questions.length === 0) {
    throw new Error('未能从文档中解析出任何题目，请检查文件格式');
  }

  return { bankName, questions };
}
