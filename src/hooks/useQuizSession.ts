import { useState, useEffect, useRef } from 'react';
import { generateSession, checkAnswer } from '../utils/quiz/engine';
import { db } from '../db';
import type { Question, QuestionType } from '../db';
import type { QuizSession } from '../utils/quiz/engine';

export interface UseQuizSessionReturn {
  session: QuizSession | null;
  currentIndex: number;
  sessionDone: boolean;
  userAnswers: Record<number, string>;
  submitted: Record<number, boolean>;
  answerTime: Record<number, number>;
  totalQuestions: number;
  currentQuestion: Question | null;
  shuffledOrders: Record<number, number[]>;  // questionId → shuffled option indices
  handleAnswer: (value: string) => void;
  handleSubmit: (value?: string) => void;
  handleNext: () => void;
  handlePrev: () => void;
  goToQuestion: (index: number) => void;
  handleRestart: () => void;
}

export function useQuizSession(
  bankId: string,
  allQuestions: Question[] | undefined,
  typeParam: string,
  questionIds?: number[],
  resumeState?: { currentIndex: number; userAnswers: Record<number, string>; submitted: Record<number, boolean> } | null,
  userId?: string,
): UseQuizSessionReturn {
  const [session, setSession] = useState<QuizSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState<Record<number, boolean>>({});
  const [sessionDone, setSessionDone] = useState(false);
  const [answerTime, setAnswerTime] = useState<Record<number, number>>({});
  const [shuffledOrders, setShuffledOrders] = useState<Record<number, number[]>>({});
  const startTimeRef = useRef(Date.now());
  const questionStartRef = useRef(startTimeRef.current);
  const savedRef = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const userAnswersRef = useRef<Record<number, string>>({});
  const submittedRef = useRef<Record<number, boolean>>({});
  const answerTimeRef = useRef<Record<number, number>>({});
  const answerWriteQueueRef = useRef<Promise<void>>(Promise.resolve());

  const sessionQuestions = session?.questions ?? [];
  const currentQuestion = sessionQuestions[currentIndex] ?? null;
  const totalQuestions = sessionQuestions.length;

  // ── 随错随记：立即保存单题结果到 IndexedDB ──

  const saveCurrentAnswer = async (index: number) => {
    const q = sessionQuestions[index];
    if (!q || !q.id) return;

    // 首次保存时创建 session 记录
    if (!sessionIdRef.current) {
      // Look up bank name for display in stats
      let bankName = '';
      try {
        const numId = Number(bankId);
        if (!isNaN(numId)) {
          const bank = await db.banks.get(numId);
          bankName = bank?.name || '';
        }
      } catch { /* ignore */ }
      const sid = await db.sessions.add({
        bankId: isNaN(Number(bankId)) ? 0 : Number(bankId),
        bankName: bankName || bankId,
        userId: userId || '',
        startedAt: new Date(startTimeRef.current),
        totalQuestions: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        score: 0,
        duration: 0,
      });
      if (sid === undefined) return;
      sessionIdRef.current = sid;
    }

    const answer = userAnswersRef.current[index] || '';
    const isCorrect = checkAnswer(q, answer).correct;
    try {
      const answerRecord = {
        sessionId: sessionIdRef.current,
        userId: userId || '',
        questionId: q.id,
        userAnswer: answer,
        isCorrect,
        timeTaken: answerTimeRef.current[index] || 0,
      };
      const existing = await db.sessionAnswers
        .where('sessionId')
        .equals(sessionIdRef.current)
        .and((item) => item.questionId === q.id && item.userId === (userId || ''))
        .first();

      if (existing?.id !== undefined) await db.sessionAnswers.update(existing.id, answerRecord);
      else await db.sessionAnswers.add(answerRecord);
    } catch {
      // 重复保存忽略
    }
  };

  const queueCurrentAnswerSave = (index: number): Promise<void> => {
    const queued = answerWriteQueueRef.current
      .catch(() => undefined)
      .then(() => saveCurrentAnswer(index));
    answerWriteQueueRef.current = queued.catch(() => undefined);
    return queued;
  };

  // Generate session when questions load
  useEffect(() => {
    if (!allQuestions || allQuestions.length === 0) return;
    savedRef.current = false;
    sessionIdRef.current = null;
    startTimeRef.current = Date.now();
    answerWriteQueueRef.current = Promise.resolve();
    const quizSession = generateSession(Number(bankId), allQuestions, typeParam as QuestionType | 'all', questionIds);
    setSession(quizSession);

    if (resumeState) {
      setCurrentIndex(resumeState.currentIndex);
      setUserAnswers(resumeState.userAnswers);
      setSubmitted(resumeState.submitted);
      userAnswersRef.current = resumeState.userAnswers;
      submittedRef.current = resumeState.submitted;
    } else {
      setCurrentIndex(0);
      setUserAnswers({});
      setSubmitted({});
      userAnswersRef.current = {};
      submittedRef.current = {};
    }

    setSessionDone(false);
    setAnswerTime({});
    answerTimeRef.current = {};
    // 选项乱序：为每道选择题生成打乱索引
    const orders: Record<number, number[]> = {};
    for (const q of quizSession.questions) {
      if ((q.type === 'choice' || q.type === 'multi') && q.options && q.options.length > 0 && q.id !== undefined) {
        const indices = q.options.map((_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        orders[q.id] = indices;
      }
    }
    setShuffledOrders(orders);
    questionStartRef.current = Date.now();
  }, [allQuestions, bankId, typeParam, questionIds, resumeState]);

  // ── 练习完成：更新 session 记录（单题结果已提前保存）──

  useEffect(() => {
    if (!sessionDone || savedRef.current) return;
    savedRef.current = true;

    const finalizeSession = async () => {
      // 保存最后一道题（如果还没保存）
      if (submittedRef.current[currentIndex]) {
        await queueCurrentAnswerSave(currentIndex);
      }
      await answerWriteQueueRef.current;

      // 更新 session 记录
      if (sessionIdRef.current) {
        const allForSession = await db.sessionAnswers
          .where('sessionId').equals(sessionIdRef.current).toArray();
        const correct = allForSession.filter(sa => sa.isCorrect).length;
        const total = allForSession.length;
        const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
        await db.sessions.update(sessionIdRef.current, {
          endedAt: new Date(),
          totalQuestions: total,
          correctAnswers: correct,
          wrongAnswers: total - correct,
          score: total > 0 ? Math.round((correct / total) * 100) : 0,
          duration,
        });
        await db.banks.update(Number(bankId), { lastPracticed: new Date() });
      }
    };

    finalizeSession();
  }, [sessionDone]);

  const handleAnswer = (value: string) => {
    if (submittedRef.current[currentIndex]) return;
    const nextAnswers = { ...userAnswersRef.current, [currentIndex]: value };
    const nextAnswerTime = { ...answerTimeRef.current, [currentIndex]: Date.now() - questionStartRef.current };
    userAnswersRef.current = nextAnswers;
    answerTimeRef.current = nextAnswerTime;
    setUserAnswers(nextAnswers);
    setAnswerTime(nextAnswerTime);
  };

  const handleSubmit = (value?: string) => {
    if (value !== undefined) {
      const nextAnswers = { ...userAnswersRef.current, [currentIndex]: value };
      const nextAnswerTime = { ...answerTimeRef.current, [currentIndex]: Date.now() - questionStartRef.current };
      userAnswersRef.current = nextAnswers;
      answerTimeRef.current = nextAnswerTime;
      setUserAnswers(nextAnswers);
      setAnswerTime(nextAnswerTime);
    }

    const answer = value ?? userAnswersRef.current[currentIndex];
    if (!answer && answer !== '') {
      return; // caller should show warning
    }
    const nextSubmitted = { ...submittedRef.current, [currentIndex]: true };
    submittedRef.current = nextSubmitted;
    setSubmitted(nextSubmitted);
  };

  const handleNext = () => {
    // 随错随记：保存当前题目的答题结果
    if (submittedRef.current[currentIndex]) {
      void queueCurrentAnswerSave(currentIndex);
    }
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
      questionStartRef.current = Date.now();
    } else {
      setSessionDone(true);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      questionStartRef.current = Date.now();
    }
  };

  const goToQuestion = (index: number) => {
    if (index >= 0 && index < totalQuestions) {
      setCurrentIndex(index);
      questionStartRef.current = Date.now();
    }
  };

  const handleRestart = () => {
    if (!allQuestions) return;
    savedRef.current = false;
    sessionIdRef.current = null;
    startTimeRef.current = Date.now();
    answerWriteQueueRef.current = Promise.resolve();
    const quizSession = generateSession(Number(bankId), allQuestions, typeParam as QuestionType | 'all', questionIds);
    setSession(quizSession);
    setCurrentIndex(0);
    setUserAnswers({});
    setSubmitted({});
    userAnswersRef.current = {};
    submittedRef.current = {};
    setSessionDone(false);
    setAnswerTime({});
    answerTimeRef.current = {};
    // 重新生成选项乱序
    const orders: Record<number, number[]> = {};
    for (const q of quizSession.questions) {
      if ((q.type === 'choice' || q.type === 'multi') && q.options && q.options.length > 0 && q.id !== undefined) {
        const indices = q.options.map((_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        orders[q.id] = indices;
      }
    }
    setShuffledOrders(orders);
    questionStartRef.current = Date.now();
  };

  return {
    session,
    currentIndex,
    sessionDone,
    userAnswers,
    submitted,
    answerTime,
    totalQuestions,
    currentQuestion,
    shuffledOrders,
    handleAnswer,
    handleSubmit,
    handleNext,
    handlePrev,
    goToQuestion,
    handleRestart,
  };
}
