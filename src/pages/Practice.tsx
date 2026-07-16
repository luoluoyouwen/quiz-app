import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  Card, Button, Progress, Typography, Radio, Checkbox, Input, Space, Tag, Result, message, Modal,
  Skeleton,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined,
  OrderedListOutlined, FastForwardOutlined, CloudOutlined,
} from '@ant-design/icons';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuizSession } from '../hooks/useQuizSession';
import { checkAnswer } from '../utils/quiz/engine';
import QuestionCard from '../components/QuestionCard';
import QuestionImage from '../components/QuestionImage';
import type { Question, QuestionType } from '../db';
import {
  getCachedCloudBankData, loadCloudBankData,
  type CloudBankInfo, type CloudQuestionData,
} from '../lib/cloudBankData';
import { supabase } from '../lib/supabase';
import { isCloudId, syncCloudBankToLocal } from '../lib/uploadService';
import { submitPracticeProgress, fetchBankProgress, submitProgressBeacon } from '../lib/syncService';
import type { ProgressRecord } from '../lib/syncService';
import { useAuth } from '../contexts/AuthContext';
import { debug } from '../utils/debug';

function getOptionIndexFromKeyboardEvent(e: KeyboardEvent): number {
  const key = e.key || '';
  const code = e.code || '';
  const legacyCode = e.keyCode || e.which || 0;

  const digitFromKey = /^[1-9]$/.test(key) ? Number(key) : 0;
  const digitFromCode = /^(?:Digit|Numpad)([1-9])$/.exec(code)?.[1];
  const digitFromLegacy = legacyCode >= 49 && legacyCode <= 57
    ? legacyCode - 48
    : legacyCode >= 97 && legacyCode <= 105
      ? legacyCode - 96
      : 0;
  const digit = digitFromKey || (digitFromCode ? Number(digitFromCode) : 0) || digitFromLegacy;
  if (digit >= 1 && digit <= 9) return digit - 1;

  const letter = /^[a-e]$/i.test(key)
    ? key.toUpperCase()
    : /^Key[A-E]$/.test(code)
      ? code.slice(3)
      : legacyCode >= 65 && legacyCode <= 69
        ? String.fromCharCode(legacyCode)
        : '';
  return letter ? letter.charCodeAt(0) - 65 : -1;
}
const getStorageKey = (bankId: string, typeParam: string, questionIds?: number[]): string => {
  const type = typeParam || 'all';
  const extra = questionIds ? '_wrong' : '';
  return `quiz_progress_${bankId}_${type}${extra}`;
};

interface ResumeData {
  currentIndex: number;
  userAnswers: Record<number, string>;
  submitted: Record<number, boolean>;
  timestamp: number;
}

const { Title, Text } = Typography;
const { TextArea } = Input;

function getQuestionTypeLabel(type?: QuestionType): string {
  switch (type) {
    case 'choice': return '选择题';
    case 'multi': return '多选题';
    case 'fill': return '填空题';
    case 'judge': return '判断题';
    case 'nofill': return '背记题';
    case 'essay': return '问答题';
    default: return '题目';
  }
}

function getQuestionTypeColor(type?: QuestionType): string {
  switch (type) {
    case 'choice': return 'blue';
    case 'multi': return 'cyan';
    case 'fill': return 'orange';
    case 'judge': return 'purple';
    case 'nofill': return 'gold';
    case 'essay': return 'green';
    default: return 'default';
  }
}

/** Supabase 题目格式 */
type CloudQuestion = CloudQuestionData;

/**
 * 将云端题目转换为本地 Question 格式，同时维护合成 ID → 真实 UUID 映射
 */
function mapCloudQuestions(bankId: number, questions: CloudQuestion[], idMap: Map<number, string>): Question[] {
  return questions.map((q, i) => {
    const syntheticId = -(i + 1);
    idMap.set(syntheticId, q.id); // 合成 ID → 真实 UUID
    return {
      id: syntheticId,  // 负 ID 避免与本地冲突
      bankId,
      type: q.type as QuestionType,
      content: q.content,
      options: q.options || undefined,
      answer: q.answer,
      answers: q.answers || undefined,
      explanation: q.explanation,
      image: q.image_url || undefined,
    };
  });
}

export default function Practice() {
  const { bankId } = useParams<{ bankId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isCloud = bankId ? isCloudId(bankId) : false;
  const locationState = location.state as { type?: string; questionIds?: number[]; isCloud?: boolean } | null;
  const storedReviewQuestionIds = useMemo(() => {
    if (!bankId || locationState?.questionIds || searchParams.get('review') !== '1') return undefined;
    try {
      const raw = sessionStorage.getItem(`review_queue_${bankId}`);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as { questionIds?: number[]; ts?: number };
      if (!Array.isArray(parsed.questionIds)) return undefined;
      if (parsed.ts && Date.now() - parsed.ts > 24 * 60 * 60 * 1000) return undefined;
      return parsed.questionIds.filter((item) => typeof item === 'number');
    } catch {
      return undefined;
    }
  }, [bankId, locationState?.questionIds, searchParams]);
  const typeParam = searchParams.get('type') || locationState?.type || 'all';
  const questionIds = locationState?.questionIds || storedReviewQuestionIds;
  const cloudFlag = locationState?.isCloud || isCloud;
  const isReviewSession = searchParams.get('review') === '1' || Boolean(questionIds?.length);
  const { user } = useAuth();

  // ── 云端数据 ──
  const initialCloudData = cloudFlag && bankId ? getCachedCloudBankData(bankId, user?.id) : undefined;
  const [cloudBank, setCloudBank] = useState<CloudBankInfo | null>(() => initialCloudData?.bank || null);
  const [cloudQuestions, setCloudQuestions] = useState<CloudQuestion[]>(() => initialCloudData?.questions || []);
  const [cloudDataLoading, setCloudDataLoading] = useState(() => cloudFlag && !initialCloudData);

  // 本地数据
  const localBank = useLiveQuery(
    () => cloudFlag ? undefined : db.banks.get(Number(bankId)),
    [cloudFlag, bankId],
  );
  const localQuestions = useLiveQuery(
    () => cloudFlag ? ([] as Question[]) : db.questions.where('bankId').equals(Number(bankId)).toArray(),
    [cloudFlag, bankId],
  );


  // 云端题目 ID 映射（合成 ID → 真实 Supabase UUID）
  const cloudQuestionIdMap = useRef<Map<number, string>>(new Map());

  // 云端：拉取题库信息和题目（在线走 Supabase，离线走 Dexie 缓存）
  useEffect(() => {
    if (!cloudFlag || !bankId) return;
    const cached = getCachedCloudBankData(bankId, user?.id);
    if (cached) {
      setCloudBank(cached.bank);
      setCloudQuestions(cached.questions);
      setCloudDataLoading(false);
      return;
    }

    setCloudBank(null);
    setCloudQuestions([]);
    setCloudDataLoading(true);
    loadCloudBankData(bankId, { userId: user?.id }).then(({ bank: nextBank, questions: nextQuestions }) => {
      setCloudBank(nextBank);
      setCloudQuestions(nextQuestions);
      setCloudDataLoading(false);
    }).catch(async () => {
      // 离线兜底：从 Dexie 缓存读取 ☁️ {bankId}
      try {
        const { db } = await import('../db');
        const cachedBanks = await db.banks
          .filter(b => b.description === `☁️ ${bankId}`)
          .toArray();
        const cachedBank = cachedBanks[0];
        if (cachedBank) {
          const localQuestions = await db.questions
            .where('bankId')
            .equals(cachedBank.id!)
            .toArray();
          setCloudBank({
            id: bankId!,
            name: cachedBank.name,
            description: '离线缓存',
            question_count: localQuestions.length,
          });
          const mapped: CloudQuestion[] = localQuestions.map((q, i) => ({
            id: q.cloudId || q.id?.toString() || `cached-${i}`,
            bank_id: bankId!,
            type: q.type,
            content: q.content,
            options: q.options || null,
            answer: q.answer,
            answers: q.answers || null,
            explanation: q.explanation || '',
            image_url: q.image || '',
            sort_order: i + 1,
          }));
          setCloudQuestions(mapped);
        }
      } catch { /* 兜底失败，无网络也无缓存 */ }
      setCloudDataLoading(false);
    });
  }, [cloudFlag, bankId, user?.id]);

  // 决定最终的 bank 和 questions
  const bank = cloudFlag ? cloudBank : localBank;
  const rawQuestions = cloudFlag ? cloudQuestions : localQuestions;
  const dataLoading = cloudFlag ? cloudDataLoading : (localBank === undefined);

  // 云端：映射到本地 Question 格式，使用合成 bankId
  const [syntheticBankId] = useState(() =>
    cloudFlag && bankId
      ? Math.abs(bankId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % 1000000 + 1000000
      : Number(bankId),
  );

  const allQuestions: Question[] | undefined = useMemo(() => {
    if (!rawQuestions) return undefined;
    if (cloudFlag) {
      return mapCloudQuestions(syntheticBankId, rawQuestions as CloudQuestion[], cloudQuestionIdMap.current);
    }
    return rawQuestions as Question[];
  }, [cloudFlag, rawQuestions, syntheticBankId]);

  // ── 断点续刷 ──
  const [resumeState, setResumeState] = useState<ResumeData | null | undefined>(undefined);
  const [resumeModalOpen, setResumeModalOpen] = useState(false);
  const [savedResume, setSavedResume] = useState<ResumeData | null>(null);

  const {
    session, currentIndex, sessionDone,
    userAnswers, submitted,
    totalQuestions, currentQuestion,
    handleAnswer, handleSubmit, handleNext, handlePrev, goToQuestion, handleRestart,
    shuffledOrders,
  } = useQuizSession(String(syntheticBankId), allQuestions, typeParam, questionIds, resumeState, user?.id);

  const isSubmitted = submitted[currentIndex];

  // Question grid
  const [gridOpen, setGridOpen] = useState(false);

  const openModal = (modal: 'grid' | 'resume') => {
    if (modal === 'grid') setGridOpen(true);
    if (modal === 'resume') setResumeModalOpen(true);
    const next = new URLSearchParams(searchParams);
    if (!next.get('type')) next.set('type', typeParam);
    next.set('modal', modal);
    setSearchParams(next);
  };

  const closeModal = (modal?: 'grid' | 'resume') => {
    if (!modal || modal === 'grid') setGridOpen(false);
    if (!modal || modal === 'resume') setResumeModalOpen(false);
    if (!modal || searchParams.get('modal') === modal) {
      const next = new URLSearchParams(searchParams);
      next.delete('modal');
      setSearchParams(next, { replace: true });
    }
  };

  useEffect(() => {
    const modal = searchParams.get('modal');
    setGridOpen(modal === 'grid');
    if (modal !== 'resume') setResumeModalOpen(false);
  }, [searchParams]);

  // Check for saved progress on mount
  useEffect(() => {
    if (bankId) {
      try {
        const raw = localStorage.getItem(getStorageKey(bankId, typeParam, questionIds));
        if (raw) {
          const data: ResumeData = JSON.parse(raw);
          if (data.timestamp && Date.now() - data.timestamp < 86400000) {
            setSavedResume(data);
            openModal('resume');
          } else {
            localStorage.removeItem(getStorageKey(bankId, typeParam, questionIds));
          }
        }
      } catch { /* ignore corrupt data */ }
    }
  }, [bankId, typeParam, questionIds]);

  const handleResume = () => {
    if (savedResume) {
      setResumeState(savedResume);
      closeModal('resume');
    }
  };

  const handleNoResume = () => {
    localStorage.removeItem(getStorageKey(bankId!, typeParam, questionIds));
    setSavedResume(null);
    closeModal('resume');
    setResumeState(null);
  };

  // Save progress to localStorage
  useEffect(() => {
    if (!bankId || !session || Object.keys(userAnswers).length === 0) return;
    if (sessionDone) {
      localStorage.removeItem(getStorageKey(bankId, typeParam, questionIds));
      return;
    }
    try {
      const data: ResumeData = {
        currentIndex,
        userAnswers,
        submitted,
        timestamp: Date.now(),
      };
      localStorage.setItem(getStorageKey(bankId, typeParam, questionIds), JSON.stringify(data));
    } catch { /* quota exceeded */ }
  }, [bankId, session, userAnswers, submitted, currentIndex, sessionDone]);

  // Save on beforeunload
  useEffect(() => {
    const save = () => {
      if (!bankId || !session || Object.keys(userAnswers).length === 0) return;
      if (sessionDone) { localStorage.removeItem(getStorageKey(bankId, typeParam, questionIds)); return; }
      try {
        localStorage.setItem(getStorageKey(bankId, typeParam, questionIds), JSON.stringify({
          currentIndex, userAnswers, submitted, timestamp: Date.now(),
        }));
      } catch {
        // Closing the browser can make local persistence unavailable.
      }
    };
    window.addEventListener('beforeunload', save);
    return () => window.removeEventListener('beforeunload', save);
  }, [bankId, session, userAnswers, submitted, currentIndex, sessionDone]);

  // ── P4: 进入练习页时拉取云端进度 ──
  const [cloudProgress, setCloudProgress] = useState<Map<string, { isCorrect: boolean; userAnswer: string }>>(new Map());

  // 云端已答的合成 ID 集合（grid 中标记）
  const cloudAnsweredSet = useMemo(() => {
    if (cloudProgress.size === 0) return new Set<number>();
    // 反转映射：uuid → syntheticId
    const uuidToSynth = new Map<string, number>();
    for (const [synthId, uuid] of cloudQuestionIdMap.current.entries()) {
      uuidToSynth.set(uuid, synthId);
    }
    const answered = new Set<number>();
    for (const uuid of cloudProgress.keys()) {
      const synthId = uuidToSynth.get(uuid);
      if (synthId !== undefined) answered.add(synthId);
    }
    return answered;
  }, [cloudProgress, cloudQuestionIdMap]);

  useEffect(() => {
    if (!cloudFlag || !user || !bankId) return;
    if (cloudQuestions.length === 0) return;

    fetchBankProgress(user.id, bankId).then(setCloudProgress).catch((err) => {
      debug.warn('拉取云端进度失败:', err.message);
    });
  }, [cloudFlag, user, bankId, cloudQuestions]);

  // ── 云端：练习开始时记录时间 ──
  const sessionStartRef = useRef<number>(0);
  useEffect(() => {
    if (cloudFlag && session && session.questions.length > 0 && sessionStartRef.current === 0) {
      sessionStartRef.current = Date.now();
    }
  }, [cloudFlag, session]);

  // ── P4: 练习完成时提交进度 + 会话记录 ──
  const progressSubmittedRef = useRef(false);

  useEffect(() => {
    if (!sessionDone || progressSubmittedRef.current) return;
    if (!user || !bankId) return;
    if (!cloudFlag) return; // 只有云端题库才同步

    const records: ProgressRecord[] = [];
    for (let i = 0; i < session!.questions.length; i++) {
      const q = session!.questions[i];
      const realUuid = cloudQuestionIdMap.current.get(q.id!);
      if (!realUuid) continue;

      records.push({
        questionId: realUuid,
        bankId: bankId,
        userAnswer: userAnswers[i] || '',
        isCorrect: checkAnswer(q, userAnswers[i] || '').correct,
        timeTaken: 0, // 精确计时后续优化
      });
    }

    if (records.length > 0) {
      submitPracticeProgress(records, user.id).then(() => {
        progressSubmittedRef.current = true;

        // 同步提交练习会话记录
        const correctCount = records.filter(r => r.isCorrect).length;
        const wrongCount = records.length - correctCount;
        const durationMs = sessionStartRef.current > 0
          ? Date.now() - sessionStartRef.current
          : 0;
        const startedAt = new Date(
          sessionStartRef.current > 0
            ? sessionStartRef.current
            : Date.now() - durationMs
        );

        supabase.rpc('submit_practice_session', {
          p_bank_id: bankId,
          p_started_at: startedAt.toISOString(),
          p_ended_at: new Date().toISOString(),
          p_total_questions: records.length,
          p_correct_count: correctCount,
          p_wrong_count: wrongCount,
          p_duration_seconds: Math.round(durationMs / 1000),
        }).then(({ error }: any) => {
          if (error) debug.warn('提交练习会话失败:', error.message);
        });
      });
    } else {
      progressSubmittedRef.current = true;
    }
  }, [sessionDone, user, bankId, cloudFlag, session, userAnswers]);

  // ── P4: 离开页面时兜底提交（仅在 unmount 时触发） ──
  const unmountDataRef = useRef<{
    cloudFlag: boolean; user: typeof user; bankId: string | undefined;
    submitted: Record<number, boolean>; session: typeof session;
    userAnswers: Record<number, string>;
  } | null>(null);

  // 每次渲染时同步最新值到 ref
  unmountDataRef.current = { cloudFlag, user, bankId, submitted, session, userAnswers };

  useEffect(() => {
    return () => {
      const d = unmountDataRef.current;
      if (!d) return;
      if (!d.cloudFlag || !d.user || !d.bankId) return;
      if (Object.keys(d.submitted).length === 0) return;
      if (progressSubmittedRef.current) return;
      if (!d.session) return;

      const records: ProgressRecord[] = [];
      for (let i = 0; i < Object.keys(d.submitted).length; i++) {
        if (!d.submitted[i]) continue;
        const q = d.session.questions[i];
        if (!q) continue;
        const realUuid = cloudQuestionIdMap.current.get(q.id!);
        if (!realUuid) continue;
        records.push({
          questionId: realUuid,
          bankId: d.bankId,
          userAnswer: d.userAnswers[i] || '',
          isCorrect: checkAnswer(q, d.userAnswers[i] || '').correct,
          timeTaken: 0,
        });
      }
      if (records.length > 0) {
        const userId = d.user.id;
        // 使用 sendBeacon 确保页面关闭前发出请求
        const ok = submitProgressBeacon(records, userId);
        void ok.then((sent) => {
          if (!sent) {
            void submitPracticeProgress(records, userId);
          }
        });
      }
    };
  }, []); // 空 deps：只在 unmount 时执行

  // Touch swipe
  const touchStartRef = useRef<number | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartRef.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartRef.current;
    const threshold = 60;
    if (diff > threshold && currentIndex > 0) {
      handlePrev();
    } else if (diff < -threshold && currentIndex < totalQuestions - 1) {
      handleNext();
    }
    touchStartRef.current = null;
  }, [currentIndex, totalQuestions, handleNext, handlePrev]);

  // ── Keyboard shortcuts (desktop) ──
  // Use ref pattern: listener registered ONCE, always calls latest state via refs.
  // This avoids race conditions where useEffect cleanup/re-register drops key events.
  const kbRef = useRef({
    currentIndex, totalQuestions, isSubmitted, currentQuestion, userAnswers,
    shuffledOrders, handleNext, handlePrev, handleSubmit, handleAnswer,
  });
  // Always keep ref current — no useEffect deps needed
  kbRef.current = {
    currentIndex, totalQuestions, isSubmitted, currentQuestion, userAnswers,
    shuffledOrders, handleNext, handlePrev, handleSubmit, handleAnswer,
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctx = kbRef.current;
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      const inputType = tag === 'INPUT' ? (target as HTMLInputElement).type : '';
      if (inputType === 'text' || inputType === 'number' || inputType === 'search'
        || inputType === 'email' || tag === 'TEXTAREA' || target?.isContentEditable) return;

      const { code } = e;

      // Navigation
      if (code === 'ArrowRight' || code === 'Space') {
        e.preventDefault();
        if (ctx.currentIndex < ctx.totalQuestions - 1) ctx.handleNext();
        return;
      }
      if (code === 'ArrowLeft') {
        e.preventDefault();
        if (ctx.currentIndex > 0) ctx.handlePrev();
        return;
      }
      if (code === 'Enter' && !ctx.isSubmitted) {
        e.preventDefault();
        ctx.handleSubmit();
        return;
      }

      // Option selection
      if (ctx.isSubmitted) return;
      const q = ctx.currentQuestion;
      if (!q || (q.type !== 'choice' && q.type !== 'multi')) return;
      if (!q.options?.length) return;

      const order = ctx.shuffledOrders?.[q.id ?? -1];
      const indices = order ?? q.options.map((_, i) => i);

      // Map keyboard input to option index. Some Android/Windows browsers report
      // NumLock keypad events inconsistently, so this also checks legacy codes.
      const optIdx = getOptionIndexFromKeyboardEvent(e);

      if (optIdx >= 0 && optIdx < indices.length) {
        e.preventDefault();
        e.stopPropagation();
        const originalLabel = String.fromCharCode(65 + indices[optIdx]);
        if (q.type === 'multi') {
          const cur = (ctx.userAnswers[ctx.currentIndex] || '').split('').filter(Boolean);
          const exists = cur.includes(originalLabel);
          const next = exists ? cur.filter(c => c !== originalLabel) : [...cur, originalLabel];
          ctx.handleAnswer(next.sort().join(''));
        } else {
          ctx.handleAnswer(originalLabel);
        }
      }
    };
    // Capture phase + registered once (empty deps = never re-registers)
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── SM-2 spaced repetition update on session completion ──
  useEffect(() => {
    if (!sessionDone || !session) return;
    const now = Date.now();
    (async () => {
      const { db } = await import('../db');
      const { answerToQuality, updateSM2 } = await import('../utils/quiz/sm2');
      for (let i = 0; i < session.questions.length; i++) {
        const q = session.questions[i];
        const isCorrect = checkAnswer(q, userAnswers[i] || '').correct;
        const quality = answerToQuality(isCorrect, 5); // approximate 5s for time
        const key = `${bankId}__${q.id}`;
        try {
          const existing = await db.sm2Data.where('key').equals(key).first();
          const updated = updateSM2(existing || undefined, quality, now);
          if (existing) {
            await db.sm2Data.update(existing.id!, updated);
          } else {
            await db.sm2Data.put({ key, ...updated });
          }
        } catch { /* ignore — don't block the UI */ }
      }
    })();
  }, [sessionDone]);

  // Essay flashcard state
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [memoryFeedback, setMemoryFeedback] = useState<"remembered" | "review" | null>(null);
  useEffect(() => {
    setAnswerRevealed(false);
    setMemoryFeedback(null);
  }, [currentIndex]);

  // Save lastPracticed to local Dexie (only for local banks, cloud handled later)
  useEffect(() => {
    return () => {
      if (bankId && Object.keys(submitted).length > 0 && !cloudFlag) {
        db.banks.update(Number(bankId), { lastPracticed: new Date() });
      }
    };
  }, [bankId, submitted, cloudFlag]);

  // Flashcard mode
  const [flashcardMode, setFlashcardMode] = useState(false);

  // Auto return timer
  const autoReturnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cancelReturn, setCancelReturn] = useState(false);

  useEffect(() => {
    if (sessionDone && bank && !cancelReturn) {
      autoReturnTimer.current = setTimeout(() => {
        navigate(`/bank/${bankId}`);
      }, 3000);
    }
    return () => {
      if (autoReturnTimer.current) {
        clearTimeout(autoReturnTimer.current);
        autoReturnTimer.current = null;
      }
    };
  }, [sessionDone, bank, cancelReturn, navigate, bankId]);

  // Auto advance on correct
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userAnswer = userAnswers[currentIndex] || '';
  const checkResult = isSubmitted && currentQuestion ? checkAnswer(currentQuestion, userAnswer) : null;
  const isCorrect = checkResult?.correct;

  useEffect(() => {
    if (isSubmitted && isCorrect && !flashcardMode) {
      autoAdvanceTimer.current = setTimeout(() => {
        handleNext();
      }, 1500);
    }
    return () => {
      if (autoAdvanceTimer.current) {
        clearTimeout(autoAdvanceTimer.current);
        autoAdvanceTimer.current = null;
      }
    };
  }, [isSubmitted, isCorrect, flashcardMode, handleNext, currentIndex]);

  const originalHandleNext = handleNext;
  const wrappedHandleNext = useCallback(() => {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
    originalHandleNext();
  }, [originalHandleNext]);

  // ── Results View ──

  if (sessionDone && bank) {
    const correctCount = session!.questions.filter(
      (q, i) => checkAnswer(q, userAnswers[i] || '').correct,
    ).length;
    const wrongQuestions = session!.questions
      .map((q, i) => ({
        question: q,
        userAnswer: userAnswers[i] || '',
        isCorrect: checkAnswer(q, userAnswers[i] || '').correct,
        index: i,
      }))
      .filter((r) => !r.isCorrect);
    const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    return (
      <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
        <Result
          status={accuracy >= 80 ? 'success' : accuracy >= 50 ? 'warning' : 'error'}
          title={`练习完成！正确率 ${accuracy}%`}
          subTitle={`${totalQuestions} 题，正确 ${correctCount} 题，错误 ${totalQuestions - correctCount} 题`}
          extra={
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div className="practice-result-status-row">
                <span className="is-mastered"><CheckCircleOutlined /> 本轮已掌握 {correctCount}</span>
                <span className={wrongQuestions.length > 0 ? 'is-review has-items' : 'is-review'}><CloseCircleOutlined /> 需复习 {wrongQuestions.length}</span>
              </div>
              <Space>
                <Button icon={<ReloadOutlined />} onClick={handleRestart}>重新刷题（全部）</Button>
                <Button icon={<FastForwardOutlined />} onClick={() => {
                  const t = location.state as { type?: string; questionIds?: number[] } || {};
                  const nextType = t.type || typeParam || 'all';
                  const nextQuestionIds = t.questionIds || questionIds;
                  const reviewSuffix = nextQuestionIds?.length ? '&review=1' : '';
                  navigate(`/practice/${bankId}?type=${nextType}${reviewSuffix}`, {
                    state: { type: nextType, questionIds: nextQuestionIds, isCloud: cloudFlag },
                  });
                }}>再刷一组</Button>
                <Button onClick={() => navigate(`/bank/${bankId}`)}>返回题库</Button>
              </Space>
              {!cancelReturn && (
                <Button type="link" size="small" onClick={() => setCancelReturn(true)} style={{ opacity: 0.6 }}>
                  5 秒后自动返回题库… 点击取消
                </Button>
              )}
            </div>
          }
        />
        {wrongQuestions.length > 0 && (
          <Card className="practice-review-card" title={`需复习回顾 (${wrongQuestions.length} 题)`} style={{ marginTop: 16 }}>
            {wrongQuestions.map((r) => (
              <QuestionCard
                key={r.question.id}
                question={r.question}
                showAnswer
                userAnswer={r.userAnswer}
                isCorrect={false}
              />
            ))}
          </Card>
        )}
        {cloudFlag && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <Button
              type="link"
              icon={<CloudOutlined />}
              onClick={async () => {
                if (bankId) {
                  const added = await syncCloudBankToLocal(bankId, bank.name, user!.id);
                  if (added > 0) message.success(`已缓存 ${added} 题到本地`);
                  else message.info('已缓存到本地');
                }
              }}
            >
              💾 缓存到本地
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── Loading / Empty ──

  const practiceLoadingView = (
    <div className="practice-page practice-loading-page" style={{ maxWidth: 960, margin: '0 auto' }}>
      <div className="practice-header practice-loading-header">
        <Skeleton active paragraph={{ rows: 1 }} title={false} />
      </div>
      <div className="practice-workbench practice-loading-workbench" aria-label="刷题加载中">
        <div className="practice-workbench-glow" aria-hidden="true" />
        <div className="practice-phone-shell">
          <div className="practice-phone-top" aria-hidden="true" />
          <div className="practice-phone-screen">
            <Card className="practice-progress-card" size="small">
              <Skeleton active paragraph={{ rows: 1 }} title={false} />
            </Card>
            <Card className="practice-question-card">
              <Skeleton active paragraph={{ rows: 4 }} title={{ width: '45%' }} />
            </Card>
            <div className="practice-loading-caption">正在同步本题库数据</div>
          </div>
        </div>
      </div>
    </div>
  );

  if (dataLoading) {
    return practiceLoadingView;
  }

  if (!bank || !allQuestions || !session) {
    return practiceLoadingView;
  }

  if (totalQuestions === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Result
          status="info"
          title="暂无题目"
          subTitle="该题库中没有符合条件的题目"
          extra={<Button onClick={() => navigate(`/bank/${bankId}`)}>返回题库</Button>}
        />
      </div>
    );
  }

  // ── Practice View ──

  const effectiveFlashcardMode = flashcardMode && currentQuestion?.type !== 'essay';

  const handleSubmitClick = () => {
    if (!userAnswers[currentIndex] && userAnswers[currentIndex] !== '') {
      message.warning('请先作答');
      return;
    }
    handleSubmit();
  };

  const memoryActionClass = ["practice-memory-actions", memoryFeedback ? "is-" + memoryFeedback : ""].filter(Boolean).join(" ");

  const handleMemorySelfCheck = (remembered: boolean) => {
    if (memoryFeedback) return;
    const nextFeedback = remembered ? "remembered" : "review";
    setMemoryFeedback(nextFeedback);
    handleSubmit(remembered ? "__remembered__" : "__forgot__");
    message.open({
      type: remembered ? "success" : "warning",
      content: remembered ? "已记录为掌握，可在题库详情查看" : "已加入需复习队列，可在题库详情复习",
      duration: 0.7,
    });
    window.setTimeout(() => {
      setMemoryFeedback(null);
      handleNext();
    }, 520);
  };

  const renderMemoryActions = () => (
    <div className="practice-memory-wrap">
      <Space className={memoryActionClass} size="large">
        <Button
          className="practice-memory-mastered"
          size="large"
          disabled={Boolean(memoryFeedback)}
          onClick={() => handleMemorySelfCheck(true)}
          icon={<CheckCircleOutlined />}
        >
          已掌握
        </Button>
        <Button
          className="practice-memory-review"
          size="large"
          disabled={Boolean(memoryFeedback)}
          onClick={() => handleMemorySelfCheck(false)}
          icon={<CloseCircleOutlined />}
        >
          再看一遍
        </Button>
      </Space>
      {memoryFeedback && (
        <Text className={"practice-memory-feedback is-" + memoryFeedback}>
          {memoryFeedback === "remembered" ? "已记录为掌握，可在题库详情查看" : "已加入需复习队列，可在题库详情复习"}
        </Text>
      )}
    </div>
  );

  return (
    <div
      className="practice-page practice-workbench-page"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="practice-header practice-top-card">
        <Title className="practice-bank-title" level={4} style={{ margin: 0, flex: 1 }}>
          {cloudFlag && <Tag color="blue" style={{ lineHeight: '18px', fontSize: 11 }}>☁️</Tag>}
          {bank.name}
        </Title>
        {currentQuestion?.type !== 'essay' && (
        <Button
          className="practice-flashcard-toggle"
          size="small"
          type={flashcardMode ? 'primary' : 'default'}
          onClick={() => { setFlashcardMode(!flashcardMode); setAnswerRevealed(false); }}
        >
          {flashcardMode ? '背题中' : '背题'}
        </Button>
        )}
      </div>

      <div className="practice-workbench" aria-label="刷题工作台">
        <div className="practice-workbench-glow" aria-hidden="true" />
        <div className="practice-side-card practice-side-doc" aria-hidden="true">
          <span className="practice-side-icon">{isReviewSession ? 'R' : currentQuestion?.type === 'choice' ? 'A' : currentQuestion?.type === 'multi' ? 'M' : 'Q'}</span>
          <span>{isReviewSession ? '需复习' : currentQuestion?.type === 'choice' ? '单选题' : currentQuestion?.type === 'multi' ? '多选题' : '题目卡'}</span>
        </div>
        <div className="practice-side-card practice-side-result" aria-hidden="true">
          <span>第 {currentIndex + 1} 题</span>
          <strong>{Math.round(((currentIndex + 1) / totalQuestions) * 100)}%</strong>
        </div>
        <div className="practice-phone-shell">
          <div className="practice-phone-top" aria-hidden="true" />
          <div className="practice-phone-screen">
      {/* Progress */}
      <Card className="practice-progress-card" size="small">
        <div className="practice-progress-head">
          <Space>
            <Text strong>进度</Text>
            {currentQuestion && (
              <Tag color={isReviewSession ? 'gold' : getQuestionTypeColor(currentQuestion.type)} style={{ fontSize: 11, lineHeight: '18px' }}>
                {isReviewSession ? '需复习' : getQuestionTypeLabel(currentQuestion.type)}
              </Tag>
            )}
          </Space>
          <Text type="secondary">{currentIndex + 1} / {totalQuestions}</Text>
        </div>
        <Progress
          percent={Math.round(((currentIndex + 1) / totalQuestions) * 100)}
          showInfo={false}
          strokeColor="var(--app-primary)"
        />
      </Card>

      {/* Question Card */}
      <Card className="practice-question-card">
        {currentQuestion && (
          <div className="practice-question-meta">
            <Tag color={isReviewSession ? 'gold' : getQuestionTypeColor(currentQuestion.type)}>
              {isReviewSession ? '需复习' : getQuestionTypeLabel(currentQuestion.type)}
            </Tag>
            {isReviewSession && (
              <Tag color={getQuestionTypeColor(currentQuestion.type)}>{getQuestionTypeLabel(currentQuestion.type)}</Tag>
            )}
            {currentQuestion.type === 'multi' && (
              <Tag color="cyan">可多选</Tag>
            )}
          </div>
        )}

        <Title className="practice-question-title" level={5}>
          {currentQuestion?.content}
        </Title>
        <QuestionImage image={currentQuestion?.image} />

        {/* Flashcard Mode */}
        {effectiveFlashcardMode ? (
          <div>
            {!answerRevealed ? (
              <Button
                className="practice-reveal-answer"
                type="primary"
                size="large"
                onClick={() => setAnswerRevealed(true)}
              >
                显示答案
              </Button>
            ) : (
              <div>
                <Card className="practice-answer-card" size="small">
                  <Text strong style={{ fontSize: 15 }}>参考答案：</Text>
                  <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
                    <Text>
                      {currentQuestion?.type === 'judge'
                        ? (currentQuestion?.answer === 'true' || currentQuestion?.answer === '对' ? '✅ 对' : '❌ 错')
                        : currentQuestion?.type === 'fill' && currentQuestion?.answers && currentQuestion.answers.length > 1
                          ? currentQuestion.answers.map((a, i) => `第${i + 1}空：${a}`).join('\n')
                          : (currentQuestion?.type === 'choice' || currentQuestion?.type === 'multi') && currentQuestion?.options
                            ? currentQuestion.answer.split('').map(l => {
                                const idx = l.charCodeAt(0) - 65;
                                const optText = currentQuestion.options![idx];
                                return `${l}. ${optText || '（选项缺失）'}`;
                              }).join('\n')
                            : currentQuestion?.answer}
                    </Text>
                    <QuestionImage image={currentQuestion?.image} caption="题目配图" />
                  </div>
                  {currentQuestion?.explanation && (
                    <div className="practice-explanation-box">
                      <Text type="secondary">
                        <Text strong>解析: </Text>
                        {currentQuestion.explanation}
                      </Text>
                    </div>
                  )}
                </Card>
                {renderMemoryActions()}
              </div>
            )}
          </div>
        ) : (
          <>
        {/* Choice */}
        {currentQuestion?.type === 'choice' && currentQuestion.options && (
          <Radio.Group
            value={userAnswer}
            onChange={(e) => handleAnswer(e.target.value)}
            disabled={isSubmitted}
            className="practice-option-group"
          >
            <div className="practice-option-stack">
              {(() => {
                const order = shuffledOrders?.[currentQuestion?.id ?? -1];
                const opts = currentQuestion.options ?? [];
                const indices = order ?? opts.map((_, i) => i);
                return indices.map((origIdx, displayIdx) => {
                  const displayLabel = String.fromCharCode(65 + displayIdx);
                  const originalLabel = String.fromCharCode(65 + origIdx);
                  const text = opts[origIdx];
                  const isSelected = userAnswer.toLowerCase() === originalLabel.toLowerCase();
                  const isOptCorrect = isSubmitted && currentQuestion.answer.toLowerCase() === originalLabel.toLowerCase();
                  const isOptWrong = isSubmitted && isSelected && !isOptCorrect;
                  const optionClass = [
                    'practice-option-card',
                    isSelected ? 'is-selected' : '',
                    isOptCorrect ? 'is-correct' : '',
                    isOptWrong ? 'is-wrong' : '',
                    isSubmitted ? 'is-disabled' : '',
                  ].filter(Boolean).join(' ');

                  return (
                    <div key={originalLabel} className={optionClass}>
                      <Radio value={originalLabel} className="practice-option-control">
                        <span className="practice-option-content">
                          <span className="practice-option-letter">{displayLabel}</span>
                          <span className="practice-option-text">{text}</span>
                        </span>
                      </Radio>
                    </div>
                  );
                });
              })()}
            </div>
          </Radio.Group>
        )}

        {/* Multi Choice */}
        {currentQuestion?.type === 'multi' && currentQuestion.options && (
          <Checkbox.Group
            value={userAnswer ? userAnswer.split('').filter(Boolean) : []}
            onChange={(checkedValues) => {
              handleAnswer((checkedValues as string[]).sort().join(''));
            }}
            disabled={isSubmitted}
            className="practice-option-group"
          >
            <div className="practice-option-stack">
              {(() => {
                const order = shuffledOrders?.[currentQuestion?.id ?? -1];
                const opts = currentQuestion.options ?? [];
                const indices = order ?? opts.map((_, i) => i);
                return indices.map((origIdx, displayIdx) => {
                  const displayLabel = String.fromCharCode(65 + displayIdx);
                  const originalLabel = String.fromCharCode(65 + origIdx);
                  const text = opts[origIdx];
                  const answerUpper = currentQuestion.answer.toUpperCase();
                  const userAnswerUpper = (userAnswer || '').toUpperCase();
                  const isSelected = userAnswerUpper.includes(originalLabel);
                  const isOptCorrect = isSubmitted && answerUpper.includes(originalLabel);
                  const isOptWrong = isSubmitted && !answerUpper.includes(originalLabel) && isSelected;
                  const optionClass = [
                    'practice-option-card',
                    isSelected ? 'is-selected' : '',
                    isOptCorrect ? 'is-correct' : '',
                    isOptWrong ? 'is-wrong' : '',
                    isSubmitted ? 'is-disabled' : '',
                  ].filter(Boolean).join(' ');

                  return (
                    <div key={originalLabel} className={optionClass}>
                      <Checkbox value={originalLabel} className="practice-option-control">
                        <span className="practice-option-content">
                          <span className="practice-option-letter">{displayLabel}</span>
                          <span className="practice-option-text">{text}</span>
                        </span>
                      </Checkbox>
                    </div>
                  );
                });
              })()}
            </div>
          </Checkbox.Group>
        )}

        {/* Fill */}
        {currentQuestion?.type === 'fill' && (
          <div>
            {currentQuestion.answers && currentQuestion.answers.length > 1 ? (
              <Space orientation="vertical" style={{ width: '100%' }}>
                {currentQuestion.answers.map((_, idx) => {
                  const blankAnswers = userAnswer ? userAnswer.split('||') : [];
                  return (
                    <Input
                      key={idx}
                      placeholder={`第 ${idx + 1} 空`}
                      value={blankAnswers[idx] || ''}
                      onChange={(e) => {
                        const newBlankAnswers = userAnswer ? userAnswer.split('||') : [];
                        newBlankAnswers[idx] = e.target.value;
                        handleAnswer(newBlankAnswers.join('||'));
                      }}
                      disabled={isSubmitted}
                      suffix={<Text type="secondary">{idx + 1}/{currentQuestion.answers!.length}</Text>}
                      style={{ marginBottom: 4 }}
                    />
                  );
                })}
              </Space>
            ) : (
              <TextArea
                rows={3}
                placeholder="请输入你的答案"
                value={userAnswer}
                onChange={(e) => handleAnswer(e.target.value)}
                disabled={isSubmitted}
                style={{ marginBottom: 12 }}
              />
            )}
          </div>
        )}

        {/* Judge */}
        {currentQuestion?.type === 'judge' && (
          <Space size="large" style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <Button
              size="large"
              style={{
                width: 140, height: 80, fontSize: 20,
                border: userAnswer === 'true' ? '2px solid var(--color-success)' : undefined,
                background: isSubmitted && ['true', '对'].includes(currentQuestion.answer) ? 'var(--bg-success)'
                  : userAnswer === 'true' ? 'var(--bg-success)' : undefined,
              }}
              onClick={() => handleAnswer('true')}
              disabled={isSubmitted}
              icon={<CheckCircleOutlined />}
            >
              ✅ 对
            </Button>
            <Button
              size="large"
              style={{
                width: 140, height: 80, fontSize: 20,
                border: userAnswer === 'false' ? '2px solid var(--color-error)' : undefined,
                background: isSubmitted && ['false', '错'].includes(currentQuestion.answer) ? 'var(--bg-error)'
                  : userAnswer === 'false' ? 'var(--bg-error)' : undefined,
              }}
              onClick={() => handleAnswer('false')}
              disabled={isSubmitted}
              icon={<CloseCircleOutlined />}
            >
              ❌ 错
            </Button>
          </Space>
        )}

        {/* Essay */}
        {currentQuestion?.type === 'essay' && (
          <div>
            {!answerRevealed ? (
              <Button
                type="primary"
                size="large"
                onClick={() => setAnswerRevealed(true)}
                style={{ width: '100%', height: 48, fontSize: 16, marginTop: 8 }}
              >
                显示答案
              </Button>
            ) : (
              <div>
                <Card
                  size="small"
                  style={{ marginBottom: 16, background: 'var(--bg-success)', border: '1px solid var(--border-success)' }}
                >
                  <Text strong style={{ fontSize: 15 }}>参考答案：</Text>
                  <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
                    <Text>{currentQuestion.answer}</Text>
                  </div>
                  <QuestionImage image={currentQuestion?.image} caption="题目配图" />
                  {currentQuestion.explanation && (
                    <div style={{ marginTop: 12, padding: 8, background: 'var(--bg-warning)', borderRadius: 4, border: '1px solid var(--border-warning)' }}>
                      <Text type="secondary">
                        <Text strong>解析: </Text>
                        {currentQuestion.explanation}
                      </Text>
                    </div>
                  )}
                </Card>
                {renderMemoryActions()}
              </div>
            )}
          </div>
        )}

        {/* 背记题 */}
        {currentQuestion?.type === 'nofill' && (
          <div>
            {!answerRevealed ? (
              <Button
                type="primary"
                size="large"
                onClick={() => setAnswerRevealed(true)}
                style={{ width: '100%', height: 48, fontSize: 16, marginTop: 8 }}
              >
                显示答案
              </Button>
            ) : (
              <div>
                <Card
                  size="small"
                  style={{ marginBottom: 16, background: 'var(--bg-warning)', border: '1px solid var(--border-warning)' }}
                >
                  <Text strong style={{ fontSize: 15 }}>无填空，熟读即可：</Text>
                  <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
                    <Text>{currentQuestion.content}</Text>
                  </div>
                  <QuestionImage image={currentQuestion?.image} />
                </Card>
                {renderMemoryActions()}
              </div>
            )}
          </div>
        )}

        {/* Submit for fill */}
        {currentQuestion?.type === 'fill' && !isSubmitted && (
          <Button type="primary" onClick={handleSubmitClick} style={{ marginTop: 8 }}>
            确认提交 (Enter)
          </Button>
        )}
        </>
        )}
      </Card>

      {/* Result feedback */}
      {isSubmitted && currentQuestion && checkResult && !flashcardMode && (
        <Card
          className={isCorrect ? 'practice-feedback-card is-correct' : 'practice-feedback-card is-wrong'}
          size="small"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {isCorrect ? (
              <>
                <CheckCircleOutlined style={{ color: 'var(--color-success)', fontSize: 18 }} />
                <Text strong style={{ color: 'var(--color-success)' }}>回答正确!</Text>
                {!flashcardMode && (
                  <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
                    ⋅ 即将跳转
                  </Text>
                )}
              </>
            ) : (
              <>
                <CloseCircleOutlined style={{ color: 'var(--color-error)', fontSize: 18 }} />
                <Text strong style={{ color: 'var(--color-error)' }}>回答错误</Text>
              </>
            )}
          </div>
          {!isCorrect && (
            <div style={{ marginBottom: 4 }}>
              <Text strong>正确答案: </Text>
              <Text style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>
                {currentQuestion.type === 'judge'
                  ? (checkResult.expected === '对' ? '✅ 对' : '❌ 错')
                  : currentQuestion.type === 'multi' || currentQuestion.type === 'choice'
                    ? (() => {
                        const order = shuffledOrders?.[currentQuestion?.id ?? -1];
                        if (!order) return checkResult.expected;
                        // Build reverse map: originalIndex -> displayPosition
                        const reverseMap: Record<number, number> = {};
                        order.forEach((origIdx, displayPos) => { reverseMap[origIdx] = displayPos; });
                        // Convert each answer letter from file-space to display-space
                        const displayAnswer = checkResult.expected
                          .toUpperCase()
                          .split('')
                          .map(c => {
                            const origIdx = c.charCodeAt(0) - 65;
                            if (origIdx < 0 || origIdx >= order.length) return c;
                            const displayPos = reverseMap[origIdx];
                            return displayPos !== undefined ? String.fromCharCode(65 + displayPos) : c;
                          })
                          .sort()
                          .join('');
                        return displayAnswer;
                      })()
                    : checkResult.expected}
              </Text>
            </div>
          )}
          {currentQuestion.explanation && (
            <div className="practice-explanation-box">
              <Text type="secondary">
                <Text strong>解析: </Text>
                {currentQuestion.explanation}
              </Text>
            </div>
          )}
        </Card>
      )}

      {/* Action buttons */}
      <div className="practice-action-row">
        {flashcardMode ? (
          answerRevealed ? null : (
            <Text type="secondary" style={{ textAlign: 'center', width: '100%' }}>
              点击「显示答案」查看参考答案
            </Text>
          )
        ) : isSubmitted ? (
          <Button type="primary" size="large" onClick={wrappedHandleNext} style={{ width: '100%' }}>
            {currentIndex < totalQuestions - 1 ? '下一题' : '查看结果'}
          </Button>
        ) : (
          currentQuestion?.type !== 'fill' && currentQuestion?.type !== 'essay' && currentQuestion?.type !== 'nofill' && (
            <Button type="primary" size="large" onClick={handleSubmitClick} style={{ width: '100%' }}>
              确认提交 (Enter)
            </Button>
          )
        )}
      </div>

          </div>
        </div>
      </div>

      {/* Question grid */}
      {!gridOpen && (
        <Button
          type="primary"
          shape="circle"
          size="large"
          icon={<OrderedListOutlined />}
          onClick={() => openModal('grid')}
          className="practice-grid-button"
          style={{
            position: 'fixed',
            bottom: 'calc(112px + env(safe-area-inset-bottom))',
            right: 16,
            width: 52, height: 52, zIndex: 1200,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        />
      )}

      <Modal
        className="practice-grid-modal"
        title="题目列表"
        open={gridOpen}
        onCancel={() => closeModal('grid')}
        footer={null}
        width={360}
      >
        <div className="practice-grid-list">
          {session && session.questions.map((q, i) => {
            const ans = userAnswers[i];
            const isAnswered = ans !== undefined && ans !== '';
            const isCurrent = i === currentIndex;
            const hasCloudProgress = cloudFlag && !isAnswered && cloudAnsweredSet.has(q.id!);
            return (
              <Button
                key={i}
                size="small"
                type={isCurrent ? 'primary' : undefined}
                onClick={() => { goToQuestion(i); closeModal('grid'); }}
                style={{
                  width: 44, height: 44,
                  fontWeight: isCurrent ? 'bold' : 'normal',
                  background: isCurrent ? undefined
                    : isAnswered ? 'var(--bg-success)'
                    : hasCloudProgress ? 'var(--bg-warning)'
                    : 'var(--bg-fill)',
                  border: isCurrent ? undefined
                    : isAnswered ? '1px solid var(--border-success)'
                    : hasCloudProgress ? '1px solid var(--border-warning)'
                    : '1px solid var(--border)',
                  color: isCurrent ? '#fff'
                    : isAnswered ? 'var(--color-success)'
                    : hasCloudProgress ? '#d48806'
                    : 'var(--color-text-secondary)',
                }}
              >
                {i + 1}
              </Button>
            );
          })}
        </div>
      </Modal>

      {/* Resume modal */}
      <Modal
        className="practice-resume-modal"
        title="发现未完成的练习"
        open={resumeModalOpen}
        onCancel={handleNoResume}
        footer={
          <Space>
            <Button onClick={handleNoResume}>重新开始</Button>
            <Button type="primary" onClick={handleResume}>
              继续上次练习（第 {savedResume ? savedResume.currentIndex + 1 : '?'} 题）
            </Button>
          </Space>
        }
      >
        <Text>
          检测到你上次练习做到第 <Text strong>{savedResume ? savedResume.currentIndex + 1 : '?'}</Text> 题，
          是否继续上次进度？选择「重新开始」将清除历史进度。
        </Text>
      </Modal>
    </div>
  );
}
