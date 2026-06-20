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
  type: 'choice' | 'fill' | 'judge' | 'all'
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

    case 'judge': {
      const normalizeJudge = (s: string): string => {
        const v = s.trim().toLowerCase();
        if (v === '对' || v === 'true' || v === 't') return 'true';
        if (v === '错' || v === 'false' || v === 'f') return 'false';
        return v;
      };
      const correct =
        normalizeJudge(userAnswer) === normalizeJudge(expected);
      return { correct, expected };
    }

    case 'fill': {
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

    default:
      return { correct: false, expected };
  }
}

// ---- Generate Session ----

let sessionCounter = 0;

export function generateSession(
  bankId: number,
  questions: Question[],
  mode: 'all' | 'choice' | 'fill' | 'judge' = 'all',
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
