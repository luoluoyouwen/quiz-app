import type { Question, SessionAnswer } from '../../db';

// ---- Type Breakdown Stats ----

export interface TypeStats {
  total: number;
  correct: number;
  wrong: number;
  accuracy: number;
}

export interface OverallStats {
  total: number;
  correct: number;
  wrong: number;
  accuracy: number;
  byType: {
    choice: TypeStats;
    fill: TypeStats;
    judge: TypeStats;
    essay: TypeStats;
  };
}

// ---- Calculate Stats ----

/**
 * Aggregates session answers into overall + per-type statistics.
 * Questions are used to map answer.questionId to question.type.
 */
export function calculateStats(
  answers: SessionAnswer[],
  questions: Question[],
): OverallStats {
  // Build a map: questionId → question type
  const questionTypeMap = new Map<number, string>();
  for (const q of questions) {
    if (q.id !== undefined) {
      questionTypeMap.set(q.id, q.type);
    }
  }

  const byType: Record<string, TypeStats> = {
    choice: { total: 0, correct: 0, wrong: 0, accuracy: 0 },
    fill: { total: 0, correct: 0, wrong: 0, accuracy: 0 },
    judge: { total: 0, correct: 0, wrong: 0, accuracy: 0 },
    essay: { total: 0, correct: 0, wrong: 0, accuracy: 0 },
  };

  for (const answer of answers) {
    const type =
      questionTypeMap.get(answer.questionId) ??
      questions.find((q) => q.id === answer.questionId)?.type ??
      '';

    const ts = byType[type];
    if (ts) {
      ts.total++;
      if (answer.isCorrect) {
        ts.correct++;
      } else {
        ts.wrong++;
      }
    }
  }

  // Compute accuracy per type
  for (const key of Object.keys(byType)) {
    const ts = byType[key];
    ts.accuracy =
      ts.total > 0 ? Math.round((ts.correct / ts.total) * 100) / 100 : 0;
  }

  const totalStats: OverallStats = {
    total: answers.length,
    correct: answers.filter((a) => a.isCorrect).length,
    wrong: answers.filter((a) => !a.isCorrect).length,
    accuracy: 0,
    byType: byType as OverallStats['byType'],
  };
  totalStats.accuracy =
    totalStats.total > 0
      ? Math.round((totalStats.correct / totalStats.total) * 100) / 100
      : 0;

  return totalStats;
}

// ---- Get Weak Areas ----

/**
 * Returns questions where the answer accuracy is below the given threshold.
 * Groups answers by questionId, calculates accuracy per question, filters.
 */
export function getWeakAreas(
  answers: SessionAnswer[],
  questions: Question[],
  threshold = 0.6,
): Question[] {
  const groups = new Map<number, SessionAnswer[]>();
  for (const a of answers) {
    const group = groups.get(a.questionId) ?? [];
    group.push(a);
    groups.set(a.questionId, group);
  }

  const weakIds = new Set<number>();
  for (const [qId, group] of groups) {
    const correctCount = group.filter((a) => a.isCorrect).length;
    const accuracy = group.length > 0 ? correctCount / group.length : 0;
    if (accuracy < threshold) {
      weakIds.add(qId);
    }
  }

  return questions.filter((q) => q.id !== undefined && weakIds.has(q.id));
}

// ---- Get Review Queue ----

/**
 * Returns questions whose most recent answer was wrong,
 * sorted by timeTaken (proxy for staleness) ascending — oldest first.
 * If same session, the answer with earliest id is treated as oldest.
 */
export function getReviewQueue(
  answers: SessionAnswer[],
  questions: Question[],
): Question[] {
  const groups = new Map<number, SessionAnswer[]>();
  for (const a of answers) {
    const group = groups.get(a.questionId) ?? [];
    group.push(a);
    groups.set(a.questionId, group);
  }

  interface QueueEntry {
    question: Question;
    sortKey: number;
  }

  const queue: QueueEntry[] = [];

  for (const [qId, group] of groups) {
    // Sort by id descending (most recent first, assuming auto-increment)
    group.sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
    const latest = group[0];

    if (!latest.isCorrect) {
      const question = questions.find((q) => q.id === qId);
      if (question) {
        // Use (negative id) so lower id = older = sorts first
        queue.push({
          question,
          sortKey: -(latest.id ?? 0),
        });
      }
    }
  }

  // Sort so oldest wrong questions come first
  queue.sort((a, b) => a.sortKey - b.sortKey);

  return queue.map((entry) => entry.question);
}
