export interface SessionAnswerIdentity {
  id?: number;
  userId: string;
  sessionId: number;
  questionId: number;
}

export function findDuplicateSessionAnswerIds(answers: SessionAnswerIdentity[]): number[] {
  const latestByQuestion = new Map<string, SessionAnswerIdentity>();
  const duplicateIds: number[] = [];

  for (const answer of answers) {
    const key = [answer.userId, answer.sessionId, answer.questionId].join('__');
    const previous = latestByQuestion.get(key);
    if (!previous) {
      latestByQuestion.set(key, answer);
      continue;
    }

    if ((answer.id ?? 0) >= (previous.id ?? 0)) {
      if (previous.id !== undefined) duplicateIds.push(previous.id);
      latestByQuestion.set(key, answer);
    } else if (answer.id !== undefined) {
      duplicateIds.push(answer.id);
    }
  }

  return duplicateIds;
}
