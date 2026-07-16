import Dexie, { type EntityTable } from 'dexie';
import { findDuplicateSessionAnswerIds } from './utils/sessionAnswerDedupe';

export interface QuestionBank {
  id?: number;
  userId: string;        // 所属用户，用于多账号隔离
  name: string;
  description: string;
  createdAt: Date;
  lastPracticed?: Date;
}

export type QuestionType = 'choice' | 'multi' | 'fill' | 'judge' | 'essay' | 'nofill';

export interface Question {
  id?: number;
  bankId: number;
  type: QuestionType;
  content: string;
  options?: string[]; // for choice questions: [A, B, C, D]
  answer: string;
  answers?: string[]; // multiple answers for multi-blank fill
  explanation?: string;
  image?: string;     // data:image/...;base64,... for inline question images
  cloudId?: string;   // Supabase question UUID（离线缓存时保留）
}

export interface Session {
  id?: number;
  userId: string;
  bankId: number;
  /** Cached bank name for display even after bank deletion */
  bankName?: string;
  startedAt: Date;
  endedAt?: Date;
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  score: number;
  duration: number; // in seconds
}

export interface SessionAnswer {
  id?: number;
  userId: string;
  sessionId: number;
  questionId: number;
  userAnswer: string;
  isCorrect: boolean;
  timeTaken: number; // in seconds
}

export interface UserProgress {
  id?: number;
  userId: string;           // Supabase UUID of user
  questionId: string;       // Supabase UUID of question
  bankId: string;           // Supabase UUID of bank
  userAnswer: string;
  isCorrect: boolean;
  timeTaken: number;        // seconds
  syncStatus: 'pending' | 'synced';
  attemptedAt: Date;
}

/** SM-2 spaced repetition data per question */
export interface SM2Record {
  id?: number;
  /** Composite key: `${bankId}__${questionId}` or `cloud__${cloudUuid}` */
  key: string;
  ef: number;
  interval: number;
  repetitions: number;
  nextReview: number;
  lastReview: number;
}

export interface CloudBankCacheRecord {
  key: string;
  userId: string;
  bankId: string;
  data: unknown;
  cachedAt: number;
  validatedAt: number;
}

const db = new Dexie('QuizApp') as Dexie & {
  banks: EntityTable<QuestionBank, 'id'>;
  questions: EntityTable<Question, 'id'>;
  sessions: EntityTable<Session, 'id'>;
  sessionAnswers: EntityTable<SessionAnswer, 'id'>;
  userProgress: EntityTable<UserProgress, 'id'>;
  sm2Data: EntityTable<SM2Record, 'id'>;
  cloudBankCache: EntityTable<CloudBankCacheRecord, 'key'>;
};

db.version(1).stores({
  banks: '++id, name, createdAt',
  questions: '++id, bankId, type',
  sessions: '++id, bankId, startedAt',
  sessionAnswers: '++id, sessionId, questionId',
});

db.version(2).stores({
  banks: '++id, name, createdAt',
  questions: '++id, bankId, type',
  sessions: '++id, bankId, startedAt',
  sessionAnswers: '++id, sessionId, questionId',
  userProgress: '++id, userId, questionId, bankId, syncStatus',
});

db.version(3).stores({
  banks: '++id, userId, name, createdAt',
  questions: '++id, bankId, type',
  sessions: '++id, bankId, startedAt',
  sessionAnswers: '++id, sessionId, questionId',
  userProgress: '++id, userId, questionId, bankId, syncStatus',
});

db.version(4).stores({
  banks: '++id, userId, name, createdAt',
  questions: '++id, bankId, type',
  sessions: '++id, userId, bankId, startedAt',
  sessionAnswers: '++id, userId, sessionId, questionId',
  userProgress: '++id, userId, questionId, bankId, syncStatus',
});

db.version(5).stores({
  banks: '++id, userId, name, createdAt',
  questions: '++id, bankId, type',
  sessions: '++id, userId, bankId, startedAt',
  sessionAnswers: '++id, userId, sessionId, questionId',
  userProgress: '++id, userId, questionId, bankId, syncStatus',
  sm2Data: '++id, key',
});

db.version(6).stores({
  banks: '++id, userId, name, createdAt',
  questions: '++id, bankId, type',
  sessions: '++id, userId, bankId, startedAt',
  sessionAnswers: '++id, userId, sessionId, questionId',
  userProgress: '++id, userId, questionId, bankId, syncStatus',
  sm2Data: '++id, key',
}).upgrade(async (transaction) => {
  const table = transaction.table('sessionAnswers');
  const answers = await table.toArray() as SessionAnswer[];
  const duplicateIds = findDuplicateSessionAnswerIds(answers);

  if (duplicateIds.length > 0) await table.bulkDelete(duplicateIds);
});

db.version(7).stores({
  banks: '++id, userId, name, createdAt',
  questions: '++id, bankId, type',
  sessions: '++id, userId, bankId, startedAt',
  sessionAnswers: '++id, userId, sessionId, questionId',
  userProgress: '++id, userId, questionId, bankId, syncStatus',
  sm2Data: '++id, key',
  cloudBankCache: 'key, userId, bankId, cachedAt, validatedAt',
});

export { db };

// ── Storage quota helper ──

/** Check IndexedDB storage usage and warn if near quota */
export async function checkStorageQuota(): Promise<{ usage: number; quota: number; pct: number } | null> {
  if (!('storage' in navigator) || !navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const usageMB = usage / (1024 * 1024);
    const quotaMB = quota / (1024 * 1024);
    const pct = quota > 0 ? (usage / quota) * 100 : 0;
    return { usage: usageMB, quota: quotaMB, pct };
  } catch {
    return null;
  }
}

/**
 * Wrap a Dexie write operation with quota checking.
 * If storage is > 90% full, warns the user and optionally skips image-heavy writes.
 */
export async function withQuotaCheck<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      // Try to notify the user
      if (typeof window !== 'undefined') {
        const { message } = await import('antd');
        message.warning('设备存储空间不足，请清理浏览器缓存后重试');
      }
      return fallback;
    }
    throw err;
  }
}
