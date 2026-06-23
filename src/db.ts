import Dexie, { type EntityTable } from 'dexie';

export interface QuestionBank {
  id?: number;
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
  bankId: number;
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

const db = new Dexie('QuizApp') as Dexie & {
  banks: EntityTable<QuestionBank, 'id'>;
  questions: EntityTable<Question, 'id'>;
  sessions: EntityTable<Session, 'id'>;
  sessionAnswers: EntityTable<SessionAnswer, 'id'>;
  userProgress: EntityTable<UserProgress, 'id'>;
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

export { db };
