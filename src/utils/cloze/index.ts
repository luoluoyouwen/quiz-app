// ---- Shared Type (defined locally as specified) ----

export interface QuestionInput {
  type: string;        // 'choice' | 'fill' | 'judge'
  content: string;
  options?: string;    // JSON string for choice questions
  answer: string;
  explanation?: string;
}

// ---- Regex Patterns ----

/** Matches numbers, years, percentages, currencies, and common number formats */
const NUMBER_PATTERN =
  /-?\d{1,3}(?:,\d{3})*(?:\.\d+)?%?|(?:\$|¥|€|£)?\s?-?\d+(?:\.\d+)?(?:%|美元|元|块|毛|分)?/g;

/** Matches content inside quotes (single, double, guillemets, book-title marks, CJK quotes) */
const QUOTE_PATTERN =
  /["""'']\s*([^""""'']+?)\s*["""'']|「([^」]+)」|『([^』]+)』|《([^》]+)》|【([^】]+)】/g;

/** Common Chinese measure word / pattern that often precedes keywords */
const KEYWORD_TRIGGER_PATTERN =
  /(?:是|为|指|叫作|称为|叫做|即|如|比如|例如|包括|包含|分为|有|具有|拥有|涉及|涉及|关于|对于|通过|使用|利用|采用|所谓)(.{2,20}?)(?:[，。；：、\n]|$)/g;

/** English word boundary: 2+ consecutive alpha chars */
const ENGLISH_WORD_PATTERN = /\b([a-zA-Z]{2,})\b/g;

/** CJK character sequences: 2+ consecutive CJK characters */
const CJK_SEQUENCE_PATTERN = /([\u4e00-\u9fff]{2,})/g;

// ---- Question Input Dedup ----

/**
 * Simple text-based dedup to avoid generating very similar blanks.
 * Checks if a new answer is already similar to an existing one via Levenshtein.
 */
function isDuplicateAnswer(
  answers: string[],
  candidate: string,
  threshold = 3
): boolean {
  const norm = (s: string) => s.trim().toLowerCase();
  const nc = norm(candidate);
  return answers.some((a) => {
    const na = norm(a);
    if (na === nc) return true;
    if (na.includes(nc) || nc.includes(na)) return true;
    return levenshteinDistance(na, nc) <= threshold;
  });
}

function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  let prev = new Array<number>(bn + 1);
  let curr = new Array<number>(bn + 1);
  for (let j = 0; j <= bn; j++) prev[j] = j;
  for (let i = 1; i <= an; i++) {
    curr[0] = i;
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[bn];
}

// ---- Auto-Generate Cloze from Text ----

/**
 * Generates fill-in-the-blank questions from a text paragraph.
 * Strategy: number/date extraction → quote extraction → keyword extraction.
 * Each extracted blank becomes one fill question.
 */
export function autoGenerateCloze(text: string): QuestionInput[] {
  const questions: QuestionInput[] = [];
  const usedAnswers: string[] = [];

  // --- Normalise text for processing ---
  // Replace multiple whitespace with single space
  const cleanText = text.replace(/\s+/g, ' ').trim();

  // --- Helper to add a cloze question ---
  function addBlank(fragment: string, originalText: string) {
    const answer = fragment.trim();
    if (!answer || answer.length < 1) return;
    if (isDuplicateAnswer(usedAnswers, answer)) return;

    // Build the question content: show the paragraph with the blank word replaced
    const blankPlaceholder = '________';
    const questionContent = originalText.replace(fragment, blankPlaceholder);

    questions.push({
      type: 'fill',
      content: questionContent,
      answer,
    });
    usedAnswers.push(answer);
  }

  // --- a) Number/date extraction ---
  let numberMatch: RegExpExecArray | null;
  NUMBER_PATTERN.lastIndex = 0;
  while ((numberMatch = NUMBER_PATTERN.exec(cleanText)) !== null) {
    const value = numberMatch[0];
    addBlank(value, cleanText);
  }

  // --- b) Quote extraction ---
  let quoteMatch: RegExpExecArray | null;
  QUOTE_PATTERN.lastIndex = 0;
  while ((quoteMatch = QUOTE_PATTERN.exec(cleanText)) !== null) {
    // Extract the captured group (which one depends on the quote style)
    const value =
      quoteMatch[1] ||
      quoteMatch[2] ||
      quoteMatch[3] ||
      quoteMatch[4] ||
      quoteMatch[5];
    if (value && value.trim().length >= 1) {
      addBlank(value.trim(), cleanText);
    }
  }

  // --- c) Keyword extraction ---
  // c1) Chinese keywords after trigger patterns
  let triggerMatch: RegExpExecArray | null;
  KEYWORD_TRIGGER_PATTERN.lastIndex = 0;
  while ((triggerMatch = KEYWORD_TRIGGER_PATTERN.exec(cleanText)) !== null) {
    const keyword = triggerMatch[1].trim();
    if (keyword.length >= 2) {
      // Split on punctuation within the capture
      const parts = keyword.split(/[、，,;；]/).map((s) => s.trim());
      for (const part of parts) {
        if (part.length >= 2) {
          addBlank(part, cleanText);
        }
      }
    }
  }

  // c2) English words (2+ chars)
  let engMatch: RegExpExecArray | null;
  ENGLISH_WORD_PATTERN.lastIndex = 0;
  while ((engMatch = ENGLISH_WORD_PATTERN.exec(cleanText)) !== null) {
    const word = engMatch[1];
    // Skip very common short words and numbers already captured
    if (
      word.length >= 3 &&
      !/^(the|and|for|are|but|not|you|all|can|had|her|was|one|our|out|has|have|been|some|its|than|that|this|with|from|they|what|when|where|which|their|there|would|about|could|should|will|after|then|only)$/i.test(
        word
      )
    ) {
      addBlank(word, cleanText);
    }
  }

  // c3) CJK bigrams and longer (2+ CJK chars)
  let cjkMatch: RegExpExecArray | null;
  CJK_SEQUENCE_PATTERN.lastIndex = 0;
  while ((cjkMatch = CJK_SEQUENCE_PATTERN.exec(cleanText)) !== null) {
    const seq = cjkMatch[1];
    // Only consider sequences of 2-6 chars to avoid whole-sentence captures
    if (seq.length >= 2 && seq.length <= 6) {
      addBlank(seq, cleanText);
    }
  }

  return questions;
}

// ---- Generate Cloze from Existing Questions ----

/**
 * For an array of existing questions (choice/fill/judge), blank out the answer.
 * Returns QuestionInput[] with the answer replaced by "________" in the content.
 */
export function generateClozeFromQuestions(
  questions: QuestionInput[]
): QuestionInput[] {
  return questions.map((q) => {
    const blankPlaceholder = '________';
    let clozeContent = q.content;

    // Replace the answer in the content (fuzzy: try exact, then lowercase, then word-boundary)
    const answer = q.answer.trim();

    // Try exact match first
    if (clozeContent.includes(answer)) {
      clozeContent = clozeContent.replace(answer, blankPlaceholder);
    } else {
      // Try case-insensitive replacement
      const lowerAnswer = answer.toLowerCase();
      const lowerContent = clozeContent.toLowerCase();
      const idx = lowerContent.indexOf(lowerAnswer);
      if (idx !== -1) {
        clozeContent =
          clozeContent.slice(0, idx) +
          blankPlaceholder +
          clozeContent.slice(idx + answer.length);
      } else {
        // If we can't find it, just blank the whole content as a fill question
        clozeContent = clozeContent + ` (${blankPlaceholder})`;
      }
    }

    return {
      type: 'fill',
      content: clozeContent,
      answer: q.answer,
      explanation: q.explanation,
    };
  });
}
