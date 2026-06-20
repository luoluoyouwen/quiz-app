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
): UseQuizSessionReturn {
  const [session, setSession] = useState<QuizSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState<Record<number, boolean>>({});
  const [sessionDone, setSessionDone] = useState(false);
  const [startTime] = useState(Date.now());
  const [answerTime, setAnswerTime] = useState<Record<number, number>>({});
  const questionStartRef = useRef(Date.now());
  const savedRef = useRef(false);

  const sessionQuestions = session?.questions ?? [];
  const currentQuestion = sessionQuestions[currentIndex] ?? null;
  const totalQuestions = sessionQuestions.length;

  // Generate session when questions load
  useEffect(() => {
    if (!allQuestions || allQuestions.length === 0) return;
    savedRef.current = false;
    const quizSession = generateSession(Number(bankId), allQuestions, typeParam as QuestionType | 'all');
    setSession(quizSession);
    setCurrentIndex(0);
    setUserAnswers({});
    setSubmitted({});
    setSessionDone(false);
    setAnswerTime({});
    questionStartRef.current = Date.now();
  }, [allQuestions, bankId, typeParam]);

  // Save results to DB when done
  useEffect(() => {
    if (!sessionDone || savedRef.current) return;
    savedRef.current = true;

    const saveSession = async () => {
      const duration = Math.round((Date.now() - startTime) / 1000);
      let correct = 0;

      for (let i = 0; i < sessionQuestions.length; i++) {
        const q = sessionQuestions[i];
        const ua = userAnswers[i] || '';
        if (checkAnswer(q, ua).correct) correct++;
      }

      const sessionId = await db.sessions.add({
        bankId: Number(bankId),
        startedAt: new Date(startTime),
        endedAt: new Date(),
        totalQuestions,
        correctAnswers: correct,
        wrongAnswers: totalQuestions - correct,
        score: totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0,
        duration,
      });

      if (sessionId === undefined) return;

      await db.sessionAnswers.bulkAdd(
        sessionQuestions.map((q, i) => ({
          sessionId,
          questionId: q.id!,
          userAnswer: userAnswers[i] || '',
          isCorrect: checkAnswer(q, userAnswers[i] || '').correct,
          timeTaken: answerTime[i] || 0,
        })),
      );

      await db.banks.update(Number(bankId), { lastPracticed: new Date() });
    };

    saveSession();
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
    const quizSession = generateSession(Number(bankId), allQuestions, typeParam as QuestionType | 'all');
    setSession(quizSession);
    setCurrentIndex(0);
    setUserAnswers({});
    setSubmitted({});
    setSessionDone(false);
    setAnswerTime({});
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
    handleAnswer,
    handleSubmit,
    handleNext,
    handlePrev,
    goToQuestion,
    handleRestart,
  };
}
