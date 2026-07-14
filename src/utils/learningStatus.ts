export interface LearningStatus {
  mastered: number;
  review: number;
  answered: number;
}

export interface LearningAnswerRecord {
  id?: number | string;
  questionId: number | string;
  isCorrect: boolean;
  attemptedAt?: Date | string;
}

export const EMPTY_LEARNING_STATUS: LearningStatus = {
  mastered: 0,
  review: 0,
  answered: 0,
};

function recordRank(record: LearningAnswerRecord, fallbackIndex: number): number {
  const numericId = typeof record.id === 'number' ? record.id : Number(record.id);
  if (Number.isFinite(numericId)) return numericId;

  if (record.attemptedAt) {
    const time = new Date(record.attemptedAt).getTime();
    if (Number.isFinite(time)) return time;
  }

  return fallbackIndex;
}

export function summarizeLatestLearningStatus(records: LearningAnswerRecord[]): LearningStatus {
  const latestByQuestion = new Map<string, { record: LearningAnswerRecord; rank: number }>();

  records.forEach((record, index) => {
    const key = String(record.questionId);
    const rank = recordRank(record, index);
    const previous = latestByQuestion.get(key);
    if (!previous || rank >= previous.rank) {
      latestByQuestion.set(key, { record, rank });
    }
  });

  const status = { ...EMPTY_LEARNING_STATUS };
  for (const { record } of latestByQuestion.values()) {
    status.answered += 1;
    if (record.isCorrect) status.mastered += 1;
    else status.review += 1;
  }

  return status;
}