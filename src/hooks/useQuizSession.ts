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
  handleSubmit: () => void;
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
): UseQuizSessionReturn {
  const [session, setSession] = useState<QuizSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState<Record<number, boolean>>({});
  const [sessionDone, setSessionDone] = useState(false);
  const [startTime] = useState(Date.now());
  const [answerTime, setAnswerTime] = useState<Record<number, number>>({});
  const [shuffledOrders, setShuffledOrders] = useState<Record<number, number[]>>({});
  const questionStartRef = useRef(Date.now());
  const savedRef = useRef(false);
  const sessionIdRef = useRef<number | null>(null);

  const sessionQuestions = session?.questions ?? [];
  const currentQuestion = sessionQuestions[currentIndex] ?? null;
  const totalQuestions = sessionQuestions.length;

  // ── 随错随记：立即保存单题结果到 IndexedDB ──

  const saveCurrentAnswer = async (index: number) => {
    const q = sessionQuestions[index];
    if (!q || !q.id) return;

    // 首次保存时创建 session 记录
    if (!sessionIdRef.current) {
      const sid = await db.sessions.add({
        bankId: Number(bankId),
        startedAt: new Date(startTime),
        totalQuestions: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        score: 0,
        duration: 0,
      });
      if (sid === undefined) return;
      sessionIdRef.current = sid;
    }

    const isCorrect = checkAnswer(q, userAnswers[index] || '').correct;
    try {
      await db.sessionAnswers.add({
        sessionId: sessionIdRef.current,
        questionId: q.id,
        userAnswer: userAnswers[index] || '',
        isCorrect,
        timeTaken: answerTime[index] || 0,
      });
    } catch {
      // 重复保存忽略
    }
  };

  // Generate session when questions load
  useEffect(() => {
    if (!allQuestions || allQuestions.length === 0) return;
    savedRef.current = false;
    sessionIdRef.current = null;
    const quizSession = generateSession(Number(bankId), allQuestions, typeParam as QuestionType | 'all', questionIds);
    setSession(quizSession);

    if (resumeState) {
      setCurrentIndex(resumeState.currentIndex);
      setUserAnswers(resumeState.userAnswers);
      setSubmitted(resumeState.submitted);
    } else {
      setCurrentIndex(0);
      setUserAnswers({});
      setSubmitted({});
    }

    setSessionDone(false);
    setAnswerTime({});
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
      if (submitted[currentIndex]) {
        await saveCurrentAnswer(currentIndex);
      }

      // 更新 session 记录
      if (sessionIdRef.current) {
        const allForSession = await db.sessionAnswers
          .where('sessionId').equals(sessionIdRef.current).toArray();
        const correct = allForSession.filter(sa => sa.isCorrect).length;
        const total = allForSession.length;
        const duration = Math.round((Date.now() - startTime) / 1000);
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
    if (submitted[currentIndex]) return;
    setUserAnswers((prev) => ({ ...prev, [currentIndex]: value }));
    setAnswerTime((prev) => ({ ...prev, [currentIndex]: Date.now() - questionStartRef.current }));
  };

  const handleSubmit = () => {
    if (!userAnswers[currentIndex] && userAnswers[currentIndex] !== '') {
      return; // caller should show warning
    }
    setSubmitted((prev) => ({ ...prev, [currentIndex]: true }));
  };

  const handleNext = () => {
    // 随错随记：保存当前题目的答题结果
    if (submitted[currentIndex]) {
      saveCurrentAnswer(currentIndex);
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
    const quizSession = generateSession(Number(bankId), allQuestions, typeParam as QuestionType | 'all', questionIds);
    setSession(quizSession);
    setCurrentIndex(0);
    setUserAnswers({});
    setSubmitted({});
    setSessionDone(false);
    setAnswerTime({});
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
