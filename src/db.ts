import Dexie, { type EntityTable } from 'dexie';

export interface QuestionBank {
  id?: number;
  name: string;
  description: string;
  createdAt: Date;
  lastPracticed?: Date;
}

export type QuestionType = 'choice' | 'fill' | 'judge';

export interface Question {
  id?: number;
  bankId: number;
  type: QuestionType;
  content: string;
  options?: string[]; // for choice questions: [A, B, C, D]
  answer: string;
  explanation?: string;
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

const db = new Dexie('QuizApp') as Dexie & {
  banks: EntityTable<QuestionBank, 'id'>;
  questions: EntityTable<Question, 'id'>;
  sessions: EntityTable<Session, 'id'>;
  sessionAnswers: EntityTable<SessionAnswer, 'id'>;
};

db.version(1).stores({
  banks: '++id, name, createdAt',
  questions: '++id, bankId, type',
  sessions: '++id, bankId, startedAt',
  sessionAnswers: '++id, sessionId, questionId',
});

export { db };
