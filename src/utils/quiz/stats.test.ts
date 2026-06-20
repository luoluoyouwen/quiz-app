import { describe, it, expect } from 'vitest';
import { calculateStats, getWeakAreas, getReviewQueue } from './stats';
import type { Question, SessionAnswer } from '../../db';

const questions: Question[] = [
  { id: 1, bankId: 1, type: 'choice', content: 'Q1', options: ['A', 'B'], answer: 'A' },
  { id: 2, bankId: 1, type: 'fill', content: 'Q2', answer: 'x' },
  { id: 3, bankId: 1, type: 'judge', content: 'Q3', answer: '对' },
  { id: 4, bankId: 1, type: 'choice', content: 'Q4', options: ['A', 'B'], answer: 'B' },
];

const answers: SessionAnswer[] = [
  { id: 1, sessionId: 1, questionId: 1, userAnswer: 'A', isCorrect: true, timeTaken: 5 },
  { id: 2, sessionId: 1, questionId: 2, userAnswer: 'y', isCorrect: false, timeTaken: 10 },
  { id: 3, sessionId: 1, questionId: 3, userAnswer: '对', isCorrect: true, timeTaken: 3 },
  { id: 4, sessionId: 2, questionId: 1, userAnswer: 'B', isCorrect: false, timeTaken: 8 },
  { id: 5, sessionId: 2, questionId: 4, userAnswer: 'B', isCorrect: true, timeTaken: 2 },
];

// ── calculateStats ──

describe('calculateStats', () => {
  it('returns correct overall totals', () => {
    const s = calculateStats(answers, questions);
    expect(s.total).toBe(5);
    expect(s.correct).toBe(3);
    expect(s.wrong).toBe(2);
  });

  it('calculates accuracy correctly', () => {
    const s = calculateStats(answers, questions);
    expect(s.accuracy).toBe(0.6); // 3/5
  });

  it('returns per-type stats', () => {
    const s = calculateStats(answers, questions);
    // choice: Q1 correct, Q1 wrong, Q4 correct = 3 total, 2 correct
    expect(s.byType.choice.total).toBe(3);
    expect(s.byType.choice.correct).toBe(2);
    expect(s.byType.choice.accuracy).toBeCloseTo(0.67, 1);
    // fill: Q2 wrong = 1 total, 0 correct
    expect(s.byType.fill.total).toBe(1);
    expect(s.byType.fill.correct).toBe(0);
    // judge: Q3 correct = 1 total, 1 correct
    expect(s.byType.judge.total).toBe(1);
    expect(s.byType.judge.correct).toBe(1);
    expect(s.byType.judge.accuracy).toBe(1);
  });

  it('returns zero stats for empty answers', () => {
    const s = calculateStats([], questions);
    expect(s.total).toBe(0);
    expect(s.correct).toBe(0);
    expect(s.wrong).toBe(0);
    expect(s.accuracy).toBe(0);
    expect(s.byType.choice.total).toBe(0);
    expect(s.byType.fill.total).toBe(0);
    expect(s.byType.judge.total).toBe(0);
  });
});

// ── getWeakAreas ──

describe('getWeakAreas', () => {
  it('returns questions below default threshold (0.6)', () => {
    // Q1: 1/2 = 0.5 (below 0.6), Q2: 0/1 = 0, Q4: 1/1 = 1
    const weak = getWeakAreas(answers, questions);
    const ids = weak.map((q) => q.id);
    expect(ids).toContain(1); // 50% accuracy
    expect(ids).toContain(2); // 0% accuracy
    expect(ids).not.toContain(3); // 100% accuracy
    expect(ids).not.toContain(4); // 100% accuracy
  });

  it('respects custom threshold', () => {
    const weak = getWeakAreas(answers, questions, 0.9);
    // Q3 (1.0) and Q4 (1.0) are above 0.9 — not weak
    // Q1 (0.5) and Q2 (0.0) are below 0.9 — weak
    expect(weak).toHaveLength(2);
    expect(weak.find((q) => q.id === 3)).toBeUndefined();
    expect(weak.find((q) => q.id === 4)).toBeUndefined();
  });

  it('returns empty for empty answers', () => {
    const weak = getWeakAreas([], questions);
    expect(weak).toEqual([]);
  });
});

// ── getReviewQueue ──

describe('getReviewQueue', () => {
  it('returns questions whose latest answer was wrong, oldest first', () => {
    const queue = getReviewQueue(answers, questions);
    // Q2: latest answer (id=2) wrong, Q1: latest (id=4) wrong
    // Sorted by negative id → oldest first: Q2 (id=2), Q1 (id=4? No wait...
    // Actually Q1's answers: id=1 (correct), id=4 (wrong). Latest = id=4 (wrong) → in queue
    // Q2: id=2 (wrong) → in queue
    // Q3: id=3 (correct) → not in queue
    // Q4: id=5 (correct) → not in queue
    // Sort by -(latest.id) → -(2) = -2, -(4) = -4 → sorted: -4, -2 → Q1 (id=1) first, Q2 (id=2) second
    // Wait: -(id of latest answer). Q1 latest answer is id=4, so sortKey=-4. Q2 latest answer is id=2, sortKey=-2.
    // Sorted ascending: -4 < -2, so Q1 comes first.
    // Wait, no. sortKey = -(latest.id). For Q2: latest is id=2, sortKey=-2. For Q1: latest is id=4, sortKey=-4.
    // sort((a,b) => a.sortKey - b.sortKey) → -4 first, -2 second → Q1 (with answers id 1&4) then Q2 (answer id 2)
    // Hmm but in the answers array, Q2's only answer is id=2 which is wrong. Q1 has id=1 correct and id=4 wrong.
    // The function sorts by answer.id descending within each group, takes the first (most recent).
    // For Q1: answers grouped: [id=1 (correct), id=4 (wrong)]. Sorted descending: id=4 first. Latest=wrong → in queue. sortKey = -4.
    // For Q2: answers grouped: [id=2 (wrong)]. Latest = wrong → in queue. sortKey = -2.
    // Sorted by sortKey ascending: -4 (Q1) then -2 (Q2).
    expect(queue).toHaveLength(2);
    expect(queue[0].id).toBe(1); // Q1: oldest wrong answer
    expect(queue[1].id).toBe(2); // Q2
  });

  it('excludes questions with latest answer correct', () => {
    const queue = getReviewQueue(answers, questions);
    expect(queue.find((q) => q.id === 3)).toBeUndefined();
    expect(queue.find((q) => q.id === 4)).toBeUndefined();
  });

  it('returns empty when all answers are correct', () => {
    const allCorrect = answers.map((a) => ({ ...a, isCorrect: true }));
    const queue = getReviewQueue(allCorrect, questions);
    expect(queue).toEqual([]);
  });

  it('returns empty for empty answers', () => {
    const queue = getReviewQueue([], questions);
    expect(queue).toEqual([]);
  });
});
