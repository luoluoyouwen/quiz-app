/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Based on SuperMemo 2, adapted for quiz context.
 * After each answer, update the question's easiness factor and interval.
 *
 * Quality ratings (mapped from isCorrect + timeTaken):
 *   5 = correct, answered < 3s
 *   4 = correct, answered ≥ 3s
 *   3 = correct, answered ≥ 10s
 *   2 = wrong, but answer was close (partial credit)
 *   1 = wrong, completely off
 *   0 = wrong, didn't know at all (timeout/blank)
 */

export interface SM2Data {
  /** Easiness factor (EF), starts at 2.5, range [1.3, 2.5] */
  ef: number;
  /** Current interval in days */
  interval: number;
  /** Number of consecutive correct reviews */
  repetitions: number;
  /** Timestamp (ms) of the next scheduled review */
  nextReview: number;
  /** Timestamp (ms) of the last review */
  lastReview: number;
}

export function createInitialSM2(): SM2Data {
  return {
    ef: 2.5,
    interval: 0,
    repetitions: 0,
    nextReview: 0, // due immediately
    lastReview: 0,
  };
}

/**
 * Map quiz answer result to SM-2 quality score (0-5).
 */
export function answerToQuality(
  isCorrect: boolean,
  timeTakenSec: number,
): number {
  if (!isCorrect) {
    // Wrong answers get 1 (worst)
    return 1;
  }
  // Correct answers: quality depends on speed
  if (timeTakenSec < 3) return 5;
  if (timeTakenSec < 10) return 4;
  return 3;
}

/**
 * Update SM-2 data based on a quality score.
 * Returns the updated SM2Data.
 *
 * @param prev - Previous SM-2 data (or undefined for new questions)
 * @param quality - Quality score (0-5) from answerToQuality()
 * @param now - Current timestamp (ms)
 */
export function updateSM2(
  prev: SM2Data | undefined,
  quality: number,
  now: number = Date.now(),
): SM2Data {
  const data: SM2Data = prev ? { ...prev } : createInitialSM2();

  if (quality >= 3) {
    // Correct answer
    if (data.repetitions === 0) {
      data.interval = 1;
    } else if (data.repetitions === 1) {
      data.interval = 6;
    } else {
      data.interval = Math.round(data.interval * data.ef);
    }
    data.repetitions += 1;
  } else {
    // Wrong answer — reset
    data.repetitions = 0;
    data.interval = 1;
  }

  // Update easiness factor
  const q = quality;
  data.ef = data.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (data.ef < 1.3) data.ef = 1.3;

  data.lastReview = now;
  data.nextReview = now + data.interval * 24 * 60 * 60 * 1000;

  return data;
}

/**
 * Check if a question is due for review.
 */
export function isDueForReview(data: SM2Data, now: number = Date.now()): boolean {
  return now >= data.nextReview;
}

/**
 * Get the priority score for scheduling reviews.
 * Lower nextReview = higher priority. Wrong answers (rep=0) get highest priority.
 */
export function reviewPriority(data: SM2Data, now: number = Date.now()): number {
  if (data.repetitions === 0 && data.lastReview > 0) return -Infinity; // wrong recently = top priority
  return data.nextReview - now; // negative = overdue, smaller = more urgent
}
