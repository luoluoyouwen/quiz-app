import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Card, Button, Progress, Typography, Radio, Checkbox, Input, Space, Tag, Result, message, Modal,
  Skeleton,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, ArrowLeftOutlined, ReloadOutlined,
  OrderedListOutlined, FastForwardOutlined, CloudOutlined,
} from '@ant-design/icons';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuizSession } from '../hooks/useQuizSession';
import { checkAnswer } from '../utils/quiz/engine';
import QuestionCard from '../components/QuestionCard';
import QuestionImage from '../components/QuestionImage';
import type { Question, QuestionType } from '../db';
import { supabase } from '../lib/supabase';
import { isCloudId, syncCloudBankToLocal } from '../lib/uploadService';
import { submitPracticeProgress, fetchBankProgress, submitProgressBeacon } from '../lib/syncService';
import type { ProgressRecord } from '../lib/syncService';
import { useAuth } from '../contexts/AuthContext';

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

/** Supabase 题目格式 */
interface CloudQuestion {
  id: string;
  bank_id: string;
  type: string;
  content: string;
  options: string[] | null;
  answer: string;
  answers: string[] | null;
  explanation: string;
  image_url: string;
  sort_order: number;
}

interface CloudBankInfo {
  id: string;
  name: string;
  description: string;
  question_count: number;
}

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
    };
  });
}

export default function Practice() {
  const { bankId } = useParams<{ bankId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isCloud = bankId ? isCloudId(bankId) : false;
  const typeParam = (location.state as { type?: string })?.type || 'all';
  const questionIds = (location.state as { questionIds?: number[] })?.questionIds;
  const cloudFlag = (location.state as { isCloud?: boolean })?.isCloud || isCloud;

  // ── 云端数据 ──
  const [cloudBank, setCloudBank] = useState<CloudBankInfo | null>(null);
  const [cloudQuestions, setCloudQuestions] = useState<CloudQuestion[]>([]);
  const [cloudDataLoading, setCloudDataLoading] = useState(false);

  // 本地数据
  const localBank = useLiveQuery(
    () => cloudFlag ? undefined : db.banks.get(Number(bankId)),
    [cloudFlag, bankId],
  );
  const localQuestions = useLiveQuery(
    () => cloudFlag ? ([] as Question[]) : db.questions.where('bankId').equals(Number(bankId)).toArray(),
    [cloudFlag, bankId],
  );

  const { user } = useAuth();

  // 云端题目 ID 映射（合成 ID → 真实 Supabase UUID）
  const cloudQuestionIdMap = useRef<Map<number, string>>(new Map());

  // 云端：拉取题库信息和题目（在线走 Supabase，离线走 Dexie 缓存）
  useEffect(() => {
    if (!cloudFlag || !bankId) return;
    setCloudDataLoading(true);

    Promise.all([
      supabase.from('question_banks').select('id, name, description, question_count').eq('id', bankId).single(),
      supabase.from('questions').select('*').eq('bank_id', bankId).order('sort_order', { ascending: true }),
    ]).then(([bankResult, questionsResult]) => {
      if (!bankResult.error && bankResult.data) {
        setCloudBank(bankResult.data as CloudBankInfo);
      }
      if (!questionsResult.error && questionsResult.data) {
        setCloudQuestions(questionsResult.data as CloudQuestion[]);
      }
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
            image_url: '',
            sort_order: i + 1,
          }));
          setCloudQuestions(mapped);
        }
      } catch { /* 兜底失败，无网络也无缓存 */ }
      setCloudDataLoading(false);
    });
  }, [cloudFlag, bankId]);

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
  } = useQuizSession(String(syntheticBankId), allQuestions, typeParam, questionIds, resumeState);

  // Question grid
  const [gridOpen, setGridOpen] = useState(false);

  // Check for saved progress on mount
  useEffect(() => {
    if (bankId) {
      try {
        const raw = localStorage.getItem(getStorageKey(bankId, typeParam, questionIds));
        if (raw) {
          const data: ResumeData = JSON.parse(raw);
          if (data.timestamp && Date.now() - data.timestamp < 86400000) {
            setSavedResume(data);
            setResumeModalOpen(true);
          } else {
            localStorage.removeItem(getStorageKey(bankId, typeParam, questionIds));
          }
        }
      } catch { /* ignore corrupt data */ }
    }
  }, [bankId]);

  const handleResume = () => {
    if (savedResume) {
      setResumeState(savedResume);
      setResumeModalOpen(false);
    }
  };

  const handleNoResume = () => {
    localStorage.removeItem(getStorageKey(bankId!, typeParam, questionIds));
    setSavedResume(null);
    setResumeModalOpen(false);
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
      } catch {}
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
      console.warn('拉取云端进度失败:', err.message);
    });
  }, [cloudFlag, user, bankId, cloudQuestions]);

  // ── P4: 练习完成时提交进度 ──
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
        // 使用 sendBeacon 确保页面关闭前发出请求
        const ok = submitProgressBeacon(records, d.user.id);
        if (!ok) {
          // fallback: 异步提交（可能在页面关闭时被截断，但有总比没有好）
          submitPracticeProgress(records, d.user.id);
        }
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

  // Essay flashcard state
  const [answerRevealed, setAnswerRevealed] = useState(false);
  useEffect(() => { setAnswerRevealed(false); }, [currentIndex]);

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
  const isSubmitted = submitted[currentIndex];
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
              <Space>
                <Button icon={<ReloadOutlined />} onClick={handleRestart}>重新刷题（全部）</Button>
                <Button icon={<FastForwardOutlined />} onClick={() => {
                  const t = location.state as { type?: string } || {};
                  navigate(`/practice/${bankId}`, { state: { type: t.type || 'all', isCloud: cloudFlag } });
                }}>再来一局</Button>
                <Button onClick={() => navigate(`/bank/${bankId}`)}>返回题库</Button>
              </Space>
              {!cancelReturn && (
                <Button type="link" size="small" onClick={() => setCancelReturn(true)} style={{ opacity: 0.6 }}>
                  即将自动返回题库… 点击取消
                </Button>
              )}
            </div>
          }
        />
        {wrongQuestions.length > 0 && (
          <Card title={`错题回顾 (${wrongQuestions.length} 题)`} style={{ marginTop: 16 }}>
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
                  const added = await syncCloudBankToLocal(bankId, bank.name);
                  if (added > 0) message.success(`已缓存 ${added} 题到本地`);
                  else message.info('已缓存到本地');
                }
              }}
            >
              缓存该题库到本地（离线可用）
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── Loading / Empty ──

  if (dataLoading) {
    return (
      <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
        <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 16 }} />
        <Card><Skeleton active paragraph={{ rows: 4 }} /></Card>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>加载中… 请稍候</Text>
        </div>
      </div>
    );
  }

  if (!bank || !allQuestions || !session) {
    return (
      <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
        <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 16 }} />
        <Card><Skeleton active paragraph={{ rows: 4 }} /></Card>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>加载中… 请稍候</Text>
        </div>
      </div>
    );
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

  const handleSubmitClick = () => {
    if (!userAnswers[currentIndex] && userAnswers[currentIndex] !== '') {
      message.warning('请先作答');
      return;
    }
    handleSubmit();
  };

  return (
    <div
      style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/bank/${bankId}`)} />
        <Title level={4} style={{ margin: 0, flex: 1 }}>
          {cloudFlag && <Tag color="blue" style={{ lineHeight: '18px', fontSize: 11 }}>☁️</Tag>}
          {bank.name}
        </Title>
        <Button
          size="small"
          type={flashcardMode ? 'primary' : 'default'}
          onClick={() => { setFlashcardMode(!flashcardMode); setAnswerRevealed(false); }}
        >
          {flashcardMode ? '📖 背题中' : '📖 背题'}
        </Button>
      </div>

      {/* Progress */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text strong>进度</Text>
          <Text type="secondary">{currentIndex + 1} / {totalQuestions}</Text>
        </div>
        <Progress
          percent={Math.round(((currentIndex + 1) / totalQuestions) * 100)}
          showInfo={false}
          strokeColor="#1677ff"
        />
      </Card>

      {/* Question Card */}
      <Card style={{ marginBottom: 16 }}>
        {currentQuestion && (
          <div style={{ marginBottom: 12 }}>
            <Tag color={
              currentQuestion.type === 'choice' ? 'blue' :
              currentQuestion.type === 'multi' ? 'cyan' :
              currentQuestion.type === 'fill' ? 'orange' :
              currentQuestion.type === 'judge' ? 'purple' :
              currentQuestion.type === 'nofill' ? 'gold' :
              'green'
            }>
              {currentQuestion.type === 'choice' ? '选择题' :
               currentQuestion.type === 'multi' ? '多选题' :
               currentQuestion.type === 'fill' ? '填空题' :
               currentQuestion.type === 'judge' ? '判断题' :
               currentQuestion.type === 'nofill' ? '无空填空题' : '问答题'}
            </Tag>
            {currentQuestion.type === 'multi' && (
              <Tag color="cyan">可多选</Tag>
            )}
          </div>
        )}

        <Title level={5} style={{ whiteSpace: 'pre-wrap', marginBottom: 20 }}>
          {currentQuestion?.content}
        </Title>
        <QuestionImage image={currentQuestion?.image} />

        {/* Flashcard Mode */}
        {flashcardMode ? (
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
                    <div style={{ marginTop: 12, padding: 8, background: 'var(--bg-warning)', borderRadius: 4, border: '1px solid var(--border-warning)' }}>
                      <Text type="secondary">
                        <Text strong>解析: </Text>
                        {currentQuestion.explanation}
                      </Text>
                    </div>
                  )}
                </Card>
                <Space size="large" style={{ display: 'flex', justifyContent: 'center' }}>
                  <Button
                    size="large"
                    style={{
                      width: 160, height: 60, fontSize: 18,
                      background: 'var(--bg-success)', border: '2px solid var(--color-success)',
                      color: 'var(--color-success)',
                    }}
                    onClick={() => {
                      handleAnswer('__remembered__');
                      handleSubmit();
                      handleNext();
                    }}
                    icon={<CheckCircleOutlined />}
                  >
                    记住了
                  </Button>
                  <Button
                    size="large"
                    style={{
                      width: 160, height: 60, fontSize: 18,
                      background: 'var(--bg-error)', border: '2px solid var(--color-error)',
                      color: 'var(--color-error)',
                    }}
                    onClick={() => {
                      handleAnswer('__forgot__');
                      handleSubmit();
                      handleNext();
                    }}
                    icon={<CloseCircleOutlined />}
                  >
                    没记住
                  </Button>
                </Space>
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
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {(() => {
                const order = shuffledOrders?.[currentQuestion?.id ?? -1];
                const opts = currentQuestion.options ?? [];
                const indices = order ?? opts.map((_, i) => i);
                return indices.map((origIdx, displayIdx) => {
                  const displayLabel = String.fromCharCode(65 + displayIdx);
                  const originalLabel = String.fromCharCode(65 + origIdx);
                  const text = opts[origIdx];
                  const isOptCorrect = isSubmitted && currentQuestion.answer.toLowerCase() === originalLabel.toLowerCase();
                  const isOptWrong = isSubmitted && userAnswer.toLowerCase() === originalLabel.toLowerCase() && !isOptCorrect;
                  return (
                    <div
                      key={originalLabel}
                      style={{
                        padding: '10px 12px',
                        border: `1px solid ${
                          isOptCorrect ? 'var(--color-success)' : isOptWrong ? 'var(--color-error)' : 'var(--border)'
                        }`,
                        borderRadius: 8,
                        background: isOptCorrect ? 'var(--bg-success)' : isOptWrong ? 'var(--bg-error)' : 'var(--bg-container)',
                        cursor: isSubmitted ? 'default' : 'pointer',
                      }}
                    >
                      <Radio value={originalLabel}>
                        <Text strong>{displayLabel}.</Text> {text}
                      </Radio>
                    </div>
                  );
                });
              })()}
            </Space>
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
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {(() => {
                const order = shuffledOrders?.[currentQuestion?.id ?? -1];
                const opts = currentQuestion.options ?? [];
                const indices = order ?? opts.map((_, i) => i);
                return indices.map((origIdx, displayIdx) => {
                  const displayLabel = String.fromCharCode(65 + displayIdx);
                  const originalLabel = String.fromCharCode(65 + origIdx);
                  const text = opts[origIdx];
                  const isOptCorrect = isSubmitted && currentQuestion.answer.toUpperCase().includes(originalLabel);
                  const isOptWrong = isSubmitted && !currentQuestion.answer.toUpperCase().includes(originalLabel) && (userAnswer || '').toUpperCase().includes(originalLabel);
                  return (
                    <div
                      key={originalLabel}
                      style={{
                        padding: '10px 12px',
                        border: `1px solid ${
                          isOptCorrect ? 'var(--color-success)' : isOptWrong ? 'var(--color-error)' : 'var(--border)'
                        }`,
                        borderRadius: 8,
                        background: isOptCorrect ? 'var(--bg-success)' : isOptWrong ? 'var(--bg-error)' : 'var(--bg-container)',
                        cursor: isSubmitted ? 'default' : 'pointer',
                      }}
                    >
                      <Checkbox value={originalLabel}>
                        <Text strong>{displayLabel}.</Text> {text}
                      </Checkbox>
                    </div>
                  );
                });
              })()}
            </Space>
          </Checkbox.Group>
        )}

        {/* Fill */}
        {currentQuestion?.type === 'fill' && (
          <div>
            {currentQuestion.answers && currentQuestion.answers.length > 1 ? (
              <Space direction="vertical" style={{ width: '100%' }}>
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
                <Space size="large" style={{ display: 'flex', justifyContent: 'center' }}>
                  <Button
                    size="large"
                    style={{
                      width: 160, height: 60, fontSize: 18,
                      background: 'var(--bg-success)', border: '2px solid var(--color-success)',
                      color: 'var(--color-success)',
                    }}
                    onClick={() => {
                      handleAnswer('__remembered__');
                      handleSubmit();
                      handleNext();
                    }}
                    icon={<CheckCircleOutlined />}
                  >
                    记住了
                  </Button>
                  <Button
                    size="large"
                    style={{
                      width: 160, height: 60, fontSize: 18,
                      background: 'var(--bg-error)', border: '2px solid var(--color-error)',
                      color: 'var(--color-error)',
                    }}
                    onClick={() => {
                      handleAnswer('__forgot__');
                      handleSubmit();
                      handleNext();
                    }}
                    icon={<CloseCircleOutlined />}
                  >
                    没记住
                  </Button>
                </Space>
              </div>
            )}
          </div>
        )}

        {/* 无空填空题 */}
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
                <Space size="large" style={{ display: 'flex', justifyContent: 'center' }}>
                  <Button
                    size="large"
                    style={{
                      width: 160, height: 60, fontSize: 18,
                      background: 'var(--bg-success)', border: '2px solid var(--color-success)',
                      color: 'var(--color-success)',
                    }}
                    onClick={() => {
                      handleAnswer('__remembered__');
                      handleSubmit();
                      handleNext();
                    }}
                    icon={<CheckCircleOutlined />}
                  >
                    记住了
                  </Button>
                  <Button
                    size="large"
                    style={{
                      width: 160, height: 60, fontSize: 18,
                      background: 'var(--bg-error)', border: '2px solid var(--color-error)',
                      color: 'var(--color-error)',
                    }}
                    onClick={() => {
                      handleAnswer('__forgot__');
                      handleSubmit();
                      handleNext();
                    }}
                    icon={<CloseCircleOutlined />}
                  >
                    没记住
                  </Button>
                </Space>
              </div>
            )}
          </div>
        )}

        {/* Submit for fill */}
        {currentQuestion?.type === 'fill' && !isSubmitted && (
          <Button type="primary" onClick={handleSubmitClick} style={{ marginTop: 8 }}>
            提交答案
          </Button>
        )}
        </>
        )}
      </Card>

      {/* Result feedback */}
      {isSubmitted && currentQuestion && checkResult && !flashcardMode && (
        <Card
          size="small"
          style={{
            marginBottom: 16,
            borderLeft: `3px solid ${isCorrect ? 'var(--color-success)' : 'var(--color-error)'}`,
          }}
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
                  : checkResult.expected}
              </Text>
            </div>
          )}
          {currentQuestion.explanation && (
            <div style={{ marginTop: 4, padding: 8, background: 'var(--bg-warning)', borderRadius: 4, border: '1px solid var(--border-warning)' }}>
              <Text type="secondary">
                <Text strong>解析: </Text>
                {currentQuestion.explanation}
              </Text>
            </div>
          )}
        </Card>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
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
              提交答案
            </Button>
          )
        )}
      </div>

      {/* Question grid */}
      <Button
        type="primary"
        shape="circle"
        size="large"
        icon={<OrderedListOutlined />}
        onClick={() => setGridOpen(true)}
        style={{
          position: 'fixed', bottom: 24, right: 24,
          width: 48, height: 48, zIndex: 100,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      />

      <Modal
        title="题目列表"
        open={gridOpen}
        onCancel={() => setGridOpen(false)}
        footer={null}
        width={360}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
                onClick={() => { goToQuestion(i); setGridOpen(false); }}
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
