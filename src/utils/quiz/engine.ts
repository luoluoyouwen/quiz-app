import type { Question } from '../../db';

// ---- Quiz Session State (runtime, not a DB record) ----

export interface QuizSession {
  id: string;
  bankId: number;
  questions: Question[];
  currentIndex: number;
  total: number;
  correct: number;
  wrong: number;
  answers: AnswerRecord[];
}

export interface AnswerRecord {
  questionId: number | undefined;
  userAnswer: string;
  correct: boolean;
}

// ---- Seeded Pseudo-Random Number Generator ----

class SeededRng {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }

  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
}

// ---- Fisher-Yates Shuffle ----

export function shuffleQuestions<T extends Question>(
  questions: T[],
  seed?: number
): T[] {
  const result = [...questions];
  const n = result.length;

  if (seed !== undefined) {
    const rng = new SeededRng(seed);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
  } else {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
  }

  return result;
}

// ---- Filter by Type ----

export function filterByType(
  questions: Question[],
  type: 'choice' | 'multi' | 'fill' | 'judge' | 'essay' | 'nofill' | 'all'
): Question[] {
  if (type === 'all') return [...questions];
  return questions.filter((q) => q.type === type);
}

// ---- Levenshtein Distance ----

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
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[bn];
}

// ---- Answer Normalisation ----

function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- Check Answer ----

export interface CheckResult {
  correct: boolean;
  expected: string;
}

export function checkAnswer(
  question: Question,
  userAnswer: string,
): CheckResult {
  const expected = question.answer;

  switch (question.type) {
    case 'choice': {
      const correct =
        userAnswer.trim().toLowerCase() === expected.trim().toLowerCase();
      return { correct, expected };
    }

    case 'multi': {
      // Compare sorted letter strings (e.g. "BCD" == "BCD", "AD" == "AD")
      const cleanInput = userAnswer.trim().toUpperCase();
      const cleanExpected = expected.trim().toUpperCase();
      // Reject invalid characters (only A-D allowed) — prevents "ABCDE"→"ABCD"
      if (!/^[A-D]*$/.test(cleanInput)) {
        return { correct: false, expected: cleanExpected };
      }
      const correct =
        cleanInput.split('').sort().join('') ===
        cleanExpected.split('').sort().join('');
      return { correct, expected: cleanExpected };
    }

    case 'judge': {
      const normalizeJudge = (s: string): string => {
        const v = s.trim().toLowerCase();
        if (v === '对' || v === 'true' || v === 't' || v === '√') return 'true';
        if (v === '错' || v === 'false' || v === 'f' || v === '×') return 'false';
        return v;
      };
      const correct =
        normalizeJudge(userAnswer) === normalizeJudge(expected);
      return { correct, expected: normalizeJudge(expected) === 'true' ? '对' : '错' };
    }

    case 'fill': {
      // Multi-blank: answers split by ||
      const questionAnswers = question.answers;
      if (questionAnswers && questionAnswers.length > 1) {
        const userBlanks = userAnswer ? userAnswer.split('||') : [];
        let allCorrect = true;
        for (let i = 0; i < questionAnswers.length; i++) {
          const blankAnswer = questionAnswers[i];
          const userBlank = userBlanks[i] || '';
          const nu = normalizeText(userBlank);
          const ne = normalizeText(blankAnswer);
          const blankCorrect = nu === ne ||
            (nu.length >= 2 && ne.length >= 2 && (ne.includes(nu) || nu.includes(ne))) ||
            (nu.length > 0 && ne.length > 0 && levenshteinDistance(nu, ne) <= 2);
          if (!blankCorrect) { allCorrect = false; break; }
        }
        return { correct: allCorrect, expected: questionAnswers.join('、') };
      }

      const nu = normalizeText(userAnswer);
      const ne = normalizeText(expected);

      // Exact
      if (nu === ne) return { correct: true, expected };

      // Substring containment (both sides, min 2 chars)
      if (
        nu.length >= 2 &&
        ne.length >= 2 &&
        (ne.includes(nu) || nu.includes(ne))
      ) {
        return { correct: true, expected };
      }

      // Levenshtein distance <= 2
      if (nu.length > 0 && ne.length > 0 && levenshteinDistance(nu, ne) <= 2) {
        return { correct: true, expected };
      }

      return { correct: false, expected };
    }

    case 'essay': {
      // Flashcard / 背题模式: special self-assessment markers
      if (userAnswer === '__remembered__') return { correct: true, expected };
      if (userAnswer === '__forgot__') return { correct: false, expected };
      // Default fallback: user answered freely, always show reference answer
      return { correct: false, expected };
    }

    case 'nofill': {
      // 无空填空题: 背题模式 only, no answer to check
      if (userAnswer === '__remembered__') return { correct: true, expected: '' };
      if (userAnswer === '__forgot__') return { correct: false, expected: '' };
      return { correct: false, expected: '' };
    }

    default:
      return { correct: false, expected };
  }
}

// ---- Generate Session ----

let sessionCounter = 0;

export function generateSession(
  bankId: number,
  questions: Question[],
  mode: 'all' | 'choice' | 'multi' | 'fill' | 'judge' | 'essay' | 'nofill' = 'all',
): QuizSession {
  const id = `session_${Date.now()}_${++sessionCounter}`;
  const filtered = filterByType(questions, mode);

  return {
    id,
    bankId,
    questions: filtered,
    currentIndex: 0,
    total: filtered.length,
    correct: 0,
    wrong: 0,
    answers: [],
  };
}
