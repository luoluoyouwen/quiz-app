import { describe, expect, it } from 'vitest';
import { summarizeLatestLearningStatus } from './learningStatus';

describe('summarizeLatestLearningStatus', () => {
  it('counts the latest answer per question as mastered or review', () => {
    const status = summarizeLatestLearningStatus([
      { id: 1, questionId: 101, isCorrect: false },
      { id: 2, questionId: 101, isCorrect: true },
      { id: 3, questionId: 102, isCorrect: true },
      { id: 4, questionId: 102, isCorrect: false },
      { id: 5, questionId: 103, isCorrect: true },
    ]);

    expect(status).toEqual({
      answered: 3,
      mastered: 2,
      review: 1,
    });
  });

  it('uses attemptedAt when numeric ids are not available', () => {
    const status = summarizeLatestLearningStatus([
      { questionId: 'cloud-question-1', isCorrect: true, attemptedAt: '2026-07-10T08:00:00.000Z' },
      { questionId: 'cloud-question-1', isCorrect: false, attemptedAt: '2026-07-10T09:00:00.000Z' },
      { questionId: 'cloud-question-2', isCorrect: false, attemptedAt: '2026-07-10T08:30:00.000Z' },
      { questionId: 'cloud-question-2', isCorrect: true, attemptedAt: '2026-07-10T09:30:00.000Z' },
    ]);

    expect(status).toEqual({
      answered: 2,
      mastered: 1,
      review: 1,
    });
  });
});
