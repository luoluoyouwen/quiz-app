import { describe, expect, it } from 'vitest';
import { findDuplicateSessionAnswerIds } from './sessionAnswerDedupe';

describe('findDuplicateSessionAnswerIds', () => {
  it('keeps the newest answer for each user, session and question', () => {
    expect(findDuplicateSessionAnswerIds([
      { id: 1, userId: 'user-a', sessionId: 10, questionId: 100 },
      { id: 4, userId: 'user-a', sessionId: 10, questionId: 100 },
      { id: 2, userId: 'user-a', sessionId: 10, questionId: 101 },
      { id: 3, userId: 'user-a', sessionId: 10, questionId: 100 },
    ])).toEqual([1, 3]);
  });

  it('does not merge answers from different users or sessions', () => {
    expect(findDuplicateSessionAnswerIds([
      { id: 1, userId: 'user-a', sessionId: 10, questionId: 100 },
      { id: 2, userId: 'user-b', sessionId: 10, questionId: 100 },
      { id: 3, userId: 'user-a', sessionId: 11, questionId: 100 },
    ])).toEqual([]);
  });
});
