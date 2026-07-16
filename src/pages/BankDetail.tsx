import { lazy, Suspense, useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button, Card, Col, Row, Typography, Space, Tag, Table, Input, InputNumber,
  Modal, Statistic, Radio, message, Empty, Tabs, Skeleton,
} from 'antd';
import {
  PlayCircleOutlined, SettingOutlined,
  InboxOutlined, WarningFilled, SearchOutlined,
  CameraOutlined, CloudOutlined,
} from '@ant-design/icons';
import { db, type Question, type QuestionType } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import QuestionCard from '../components/QuestionCard';
import { pickRandomQuestions } from '../utils/quiz/engine';
import {
  getCachedCloudBankData, loadCloudBankData,
  type CloudBankInfo, type CloudQuestionData,
} from '../lib/cloudBankData';
import { supabase } from '../lib/supabase';
import { isCloudId } from '../lib/uploadService';
import { fetchCloudSessions, type CloudSession } from '../lib/syncService';
import { useAuth } from '../contexts/AuthContext';
import { debug } from '../utils/debug';
import { preloadPracticeRoute } from '../utils/routePreload';

const { Title, Text } = Typography;

const ImportModal = lazy(() => import('../components/ImportModal'));
const PhotoSearch = lazy(() => import('../components/PhotoSearch'));
const StatsChart = lazy(() => import('../components/StatsChart'));

/** Extract friendly bank name from long DOCX-import names. Short admin-set names are kept as-is. */
function friendlyBankName(raw: string): string {
  // Only transform names matching the known long-form pattern
  if (!/粉煤热解装置|标准题库\d|2026\.\d/.test(raw)) return raw;
  let name = raw
    .replace(/粉煤热解装置/g, '')
    .replace(/标准题库[\d.]+/g, '')
    .replace(/2026\.\d+/g, '')
    .replace(/\.docx?$/i, '')
    .trim();
  if (!name.endsWith('题库')) name += '题库';
  return name;
}

const typeLabels: Record<string, { label: string; color: string }> = {
  choice: { label: '选择题', color: 'blue' },
  multi: { label: '多选题', color: 'cyan' },
  fill: { label: '填空题', color: 'orange' },
  judge: { label: '判断题', color: 'purple' },
  essay: { label: '简答题', color: 'green' },
};

type FilterType = 'all' | QuestionType;

type CloudQuestion = CloudQuestionData;

export default function BankDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isCloud = id ? isCloudId(id) : false;
  const bankId = isCloud ? id! : String(Number(id));
  const { user } = useAuth();

  useEffect(() => {
    preloadPracticeRoute();
  }, []);

  const [filterType, setFilterType] = useState<FilterType>('all');
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [practiceMode, setPracticeMode] = useState<FilterType>('all');
  const [randomCount, setRandomCount] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [photoSearchOpen, setPhotoSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const openModal = (modal: 'practice' | 'photo' | 'import') => {
    if (modal === 'practice') setPracticeOpen(true);
    if (modal === 'photo') setPhotoSearchOpen(true);
    if (modal === 'import') setImportOpen(true);
    const next = new URLSearchParams(searchParams);
    next.set('modal', modal);
    setSearchParams(next);
  };

  const closeModal = (modal?: 'practice' | 'photo' | 'import') => {
    if (!modal || modal === 'practice') setPracticeOpen(false);
    if (!modal || modal === 'photo') setPhotoSearchOpen(false);
    if (!modal || modal === 'import') setImportOpen(false);
    if (!modal || searchParams.get('modal') === modal) {
      const next = new URLSearchParams(searchParams);
      next.delete('modal');
      setSearchParams(next, { replace: true });
    }
  };

  useEffect(() => {
    const modal = searchParams.get('modal');
    setPracticeOpen(modal === 'practice');
    setPhotoSearchOpen(modal === 'photo');
    setImportOpen(modal === 'import');
  }, [searchParams]);

  // 云端数据
  const initialCloudData = isCloud && id ? getCachedCloudBankData(id, user?.id) : undefined;
  const [cloudBank, setCloudBank] = useState<CloudBankInfo | null>(() => initialCloudData?.bank || null);
  const [cloudQuestions, setCloudQuestions] = useState<CloudQuestion[]>(() => initialCloudData?.questions || []);
  const [cloudLoading, setCloudLoading] = useState(() => isCloud && !initialCloudData);

  // 本地数据
  const localBank = useLiveQuery(
    () => isCloud ? undefined : db.banks.get(Number(bankId)),
    [isCloud, bankId],
  );
  const sessions = useLiveQuery(
    () => (isCloud ? Promise.resolve([] as any[]) : user ? db.sessions.where({ bankId: Number(bankId), userId: user.id }).reverse().toArray() : Promise.resolve([])) as Promise<any[]>,
    [isCloud, bankId, user?.id],
  ) as any[];
  // ── sessionAnswers for real-time stats — always load, cloud banks save locally too ──
  const sessionAnswers = useLiveQuery(
    async () => {
      if (isCloud || !user) return [];
      const bankSessions = await db.sessions
        .where({ bankId: Number(bankId), userId: user.id })
        .toArray();
      const sessionIds = bankSessions
        .map(session => session.id)
        .filter((value): value is number => typeof value === 'number');
      if (sessionIds.length === 0) return [];
      return db.sessionAnswers.where('sessionId').anyOf(sessionIds).toArray();
    },
    [isCloud, bankId, user?.id],
  ) as any[] | undefined;
  const localQuestions = useLiveQuery(
    () => isCloud ? ([] as Question[]) : db.questions.where('bankId').equals(Number(bankId)).toArray(),
    [isCloud, bankId],
  );

  const bank = isCloud ? cloudBank : localBank;
  const questions: Question[] = useMemo(() => {
    if (isCloud) {
      return (cloudQuestions || []).map((q, i) => ({
        id: -(i + 1),
        bankId: 0,
        type: q.type as QuestionType,
        content: q.content,
        options: q.options || undefined,
        answer: q.answer,
        answers: q.answers || undefined,
        explanation: q.explanation,
        image: q.image_url || undefined,
      }));
    }
    return localQuestions || [];
  }, [isCloud, cloudQuestions, localQuestions]);

  const loading = isCloud ? cloudLoading : (localBank === undefined);

  // 拉取云端数据
  useEffect(() => {
    if (!isCloud || !id) return;
    let cancelled = false;
    setCloudLoading(true);

    const applyData = ({ bank: nextBank, questions: nextQuestions }: { bank: CloudBankInfo; questions: CloudQuestion[] }) => {
      if (cancelled) return;
      setCloudBank(nextBank);
      setCloudQuestions(nextQuestions);
    };

    const cached = getCachedCloudBankData(id, user?.id);
    if (cached) {
      applyData(cached);
      setCloudLoading(false);
      return;
    }

    setCloudBank(null);
    setCloudQuestions([]);
    loadCloudBankData(id, {
      userId: user?.id,
      onRevalidated: applyData,
    }).then((data) => {
      applyData(data);
      if (!cancelled) setCloudLoading(false);
    }).catch(() => {
      if (!cancelled) setCloudLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isCloud, id, user?.id]);

  // 云端题库：拉取练习记录用于统计
  const [cloudSessions, setCloudSessions] = useState<CloudSession[]>([]);
  useEffect(() => {
    if (!isCloud || !id || !user) return;
    if (cloudQuestions.length === 0 && cloudBank === null) return;
    fetchCloudSessions(user.id, id).then(setCloudSessions).catch(() => {
      // 静默失败 — 统计非关键路径
    });
  }, [isCloud, id, user, cloudQuestions, cloudBank]);

  const displayQuestions = questions;

  const filteredQuestions = useMemo(() => {
    if (!displayQuestions) return [];
    let result = displayQuestions;
    if (filterType !== 'all') {
      result = result.filter((q) => q.type === filterType);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter((q) =>
        q.content.toLowerCase().includes(term) ||
        q.answer.toLowerCase().includes(term) ||
        q.options?.some(o => o.toLowerCase().includes(term))
      );
    }
    return result;
  }, [displayQuestions, filterType, searchTerm]);

  // ── Stats from sessionAnswers (real-time, even mid-session) ──
  // sessionAnswers are saved to local Dexie for BOTH local and cloud banks
  const stats = useMemo(() => {
    if (!sessionAnswers || questions.length === 0) return null;
    const qIdSet = new Set(questions.map(q => q.id!));
    const relevant = sessionAnswers.filter((sa: any) => {
      if (!qIdSet.has(sa.questionId)) return false;
      if (user?.id && sa.userId && sa.userId !== user.id) return false;
      return true;
    });
    if (relevant.length === 0) return null;
    const correct = relevant.filter((sa: any) => sa.isCorrect).length;
    const total = relevant.length;
    const wrong = total - correct;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const sessionIds = new Set(relevant.map((sa: any) => sa.sessionId).filter(Boolean));
    return { total, correct, wrong, accuracy, practiceCount: sessionIds.size };
  }, [sessionAnswers, questions, user?.id]);

  const learningState = useMemo(() => {
    if (!sessionAnswers || questions.length === 0) return { mastered: 0, review: 0, answered: 0 };
    const qIdSet = new Set(questions.map(q => q.id!));
    const latestByQuestion = new Map<number, any>();
    for (const answer of sessionAnswers) {
      if (!qIdSet.has(answer.questionId)) continue;
      if (user?.id && answer.userId && answer.userId !== user.id) continue;
      const previous = latestByQuestion.get(answer.questionId);
      if (!previous || (answer.id ?? 0) > (previous.id ?? 0)) latestByQuestion.set(answer.questionId, answer);
    }
    let mastered = 0;
    let review = 0;
    for (const answer of latestByQuestion.values()) {
      if (answer.isCorrect) mastered += 1;
      else review += 1;
    }
    return { mastered, review, answered: latestByQuestion.size };
  }, [sessionAnswers, questions, user?.id]);

  // ── Chart data from sessionAnswers per session (real-time) ──
  const chartData = useMemo(() => {
    if (isCloud) {
      // Cloud sessions already have correct data from Supabase
      return (cloudSessions || []).slice(0, 20).map((s: any) => ({
        label: new Date(s.date || s.created_at).toLocaleDateString('zh-CN'),
        score: s.score ?? (s.totalQuestions > 0 ? Math.round((s.correctAnswers / s.totalQuestions) * 100) : 0),
        correct: s.correctAnswers ?? 0,
        total: s.totalQuestions ?? 0,
        date: new Date(s.date || s.created_at),
      }));
    }
    // Local: compute per session from sessionAnswers
    if (!sessionAnswers || !sessions) return [];
    const saBySession = new Map<number, { correct: number; total: number }>();
    for (const sa of sessionAnswers) {
      if (sa.sessionId == null) continue;
      const cur = saBySession.get(sa.sessionId) || { correct: 0, total: 0 };
      cur.total++;
      if (sa.isCorrect) cur.correct++;
      saBySession.set(sa.sessionId, cur);
    }
    return sessions.slice(0, 20).map((s: any) => {
      const agg = saBySession.get(s.id!) || { correct: 0, total: 0 };
      const d = new Date(s.startedAt);
      return {
        label: `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`,
        score: agg.total > 0 ? Math.round((agg.correct / agg.total) * 100) : 0,
        correct: agg.correct,
        total: agg.total,
        date: d,
      };
    }).filter(d => d.total > 0).reverse();
  }, [isCloud, sessionAnswers, sessions, cloudSessions]);

  // 云端题库的错误题目 ID（本地才有）
  const wrongQuestionIds = useLiveQuery(
    async () => {
      if (isCloud || !user) return [];
      const bankSessions = await db.sessions
        .where({ bankId: Number(bankId), userId: user.id })
        .toArray();
      const sessionIds = bankSessions
        .map(session => session.id)
        .filter((value): value is number => typeof value === 'number');
      if (sessionIds.length === 0) return [];
      const myAnswers = await db.sessionAnswers.where('sessionId').anyOf(sessionIds).toArray();
      const latestByQuestion = new Map<number, typeof myAnswers[number]>();
      for (const answer of myAnswers) {
        const previous = latestByQuestion.get(answer.questionId);
        if (!previous || (answer.id ?? 0) > (previous.id ?? 0)) {
          latestByQuestion.set(answer.questionId, answer);
        }
      }
      return [...latestByQuestion.values()]
        .filter(answer => !answer.isCorrect)
        .map(answer => answer.questionId);
    }, [isCloud, bankId, user?.id]
  );

  // ── 云端错题本（带 localStorage 缓存）──
  const [cloudWrongQuestions, setCloudWrongQuestions] = useState<any[]>([]);
  const [cloudWrongCount, setCloudWrongCount] = useState(0);
  const [cloudWrongLoading, setCloudWrongLoading] = useState(false);
  const [cloudWrongReady, setCloudWrongReady] = useState(false);
  const CACHE_KEY = id ? `cloudWrong_${id}` : '';

  // 先读缓存，再异步刷新
  useEffect(() => {
    if (!isCloud || !id || !CACHE_KEY) {
      setCloudWrongReady(!isCloud);
      return;
    }
    if (cloudQuestions.length === 0) {
      setCloudWrongReady(false);
      return;
    }
    setCloudWrongReady(false);

    // ① 读缓存
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = Date.now() - (parsed.ts || 0);
        if (age < 5 * 60 * 1000 && Array.isArray(parsed.data)) {
          setCloudWrongQuestions(parsed.data);
          setCloudWrongCount(parsed.data.length);
        }
      }
    } catch { /* 缓存损坏忽略 */ }

    // ② 异步刷新
    setCloudWrongLoading(true);
    supabase.rpc('get_my_wrong_questions', { p_bank_id: id }).then(({ data, error }) => {
        if (error) {
          debug.warn('拉取云端错题失败:', error.message);
          if (cloudWrongCount === 0) setCloudWrongCount(0);
        } else {
          const list = data || [];
          setCloudWrongQuestions(list);
          setCloudWrongCount(list.length);
          // 写缓存
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: list, ts: Date.now() })); }
          catch { /* 存储满忽略 */ }
        }
        setCloudWrongLoading(false);
        setCloudWrongReady(true);
      });
  }, [isCloud, id, cloudQuestions]);

  const handleCardClick = (type: FilterType) => {
    preloadPracticeRoute();
    navigate(`/practice/${bankId}?type=${type}`, { state: { type, isCloud } });
  };

  const handleStartPractice = () => {
    preloadPracticeRoute();
    closeModal('practice');
    setRandomCount(0);

    const filtered = practiceMode === 'all'
      ? (displayQuestions || [])
      : (displayQuestions || []).filter((q) => q.type === practiceMode);

    if (randomCount > 0 && randomCount < filtered.length) {
      const picked = pickRandomQuestions(filtered, randomCount);
      const ids = picked.map((q) => q.id).filter(Boolean) as number[];
      navigate(`/practice/${bankId}?type=${practiceMode}`, { state: { type: practiceMode, questionIds: ids, isCloud } });
    } else {
      navigate(`/practice/${bankId}?type=${practiceMode}`, { state: { type: practiceMode, isCloud } });
    }
  };

  const handleQuickStart = () => {
    preloadPracticeRoute();
    navigate(`/practice/${bankId}?type=all`, { state: { type: 'all', isCloud } });
  };

  const storeReviewQueue = (ids: number[], cloud: boolean) => {
    try {
      sessionStorage.setItem(
        `review_queue_${bankId}`,
        JSON.stringify({ questionIds: ids, isCloud: cloud, ts: Date.now() }),
      );
    } catch {
      // Session storage is only a reload fallback; navigation state is primary.
    }
  };

  // 错题重刷
  const handleWrongPractice = () => {
    preloadPracticeRoute();
    if (isCloud) {
      // 将云端错题的 sort_order 转为合成负 ID
      const synthIds = cloudWrongQuestions
        .map((q: any) => -(q.sort_order))
        .filter(Boolean) as number[];
      if (synthIds.length === 0) {
        message.info('暂无需复习题目');
        return;
      }
      storeReviewQueue(synthIds, true);
      navigate(`/practice/${bankId}?type=all&review=1`, {
        state: { type: 'all', questionIds: synthIds, isCloud: true }
      });
      return;
    }
    if (!wrongQuestionIds || wrongQuestionIds.length === 0) {
      message.info('暂无需复习题目');
      return;
    }
    storeReviewQueue(wrongQuestionIds, false);
    navigate(`/practice/${bankId}?type=all&review=1`, {
      state: { type: 'all', questionIds: wrongQuestionIds }
    });
  };

  useEffect(() => {
    if (searchParams.get('photo') !== '1') return;
    const next = new URLSearchParams(searchParams);
    next.delete('photo');
    next.set('modal', 'photo');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (searchParams.get('wrong') !== '1') return;
    if (loading || (isCloud && (!cloudWrongReady || cloudWrongLoading))) return;
    const next = new URLSearchParams(searchParams);
    next.delete('wrong');
    setSearchParams(next, { replace: true });
    handleWrongPractice();
  }, [searchParams, setSearchParams, loading, isCloud, cloudWrongReady, cloudWrongLoading, cloudWrongCount, wrongQuestionIds]);

  const tableColumns = [
    {
      title: '#',
      key: 'index',
      width: 50,
      render: (_: unknown, __: unknown, i: number) => i + 1,
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 90,
      render: (v: string) => {
        const info = typeLabels[v] || { label: v, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
      filters: [
        { text: '单选题', value: 'choice' },
        { text: '多选题', value: 'multi' },
        { text: '填空题', value: 'fill' },
        { text: '判断题', value: 'judge' },
        { text: '简答题', value: 'essay' },
      ],
      onFilter: (val: React.Key | boolean, record: Question) => record.type === val,
    },
    {
      title: '题目',
      dataIndex: 'content',
      width: 420,
      render: (value: string) => (
        <div className="question-table-cell question-table-content">{value}</div>
      ),
    },
    {
      title: '答案',
      dataIndex: 'answer',
      width: 280,
      render: (_: string, record: Question) => {
        const value = record.answers && record.answers.length > 1
          ? record.answers.map((answer, index) => `${index + 1}. ${answer}`).join('  ')
          : record.answer;
        return <div className="question-table-cell question-table-answer">{value}</div>;
      },
    },
  ];

  if (loading) {
    return (
      <div className="bank-detail-loading subpage-loading-card">
        <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 16 }} />
        <Row gutter={[16, 16]}>
          {[1, 2, 3].map(i => (
            <Col key={i} xs={12} sm={6}>
              <Card><Skeleton active /></Card>
            </Col>
          ))}
        </Row>
      </div>
    );
  }

  if (!bank) {
    return (
      <div className="bank-detail-empty subpage-loading-card">
        <Empty description="题库不存在" />
      </div>
    );
  }

  return (
    <div className="quiz-app-page bank-detail-page bank-detail-workbench">
      {/* Header */}
      <div className="bank-detail-header">
        <div className="bank-detail-title-block">
          <Title className="bank-detail-title" level={3} style={{ margin: 0 }}>
            {isCloud && <Tag color="blue" style={{ marginRight: 6 }}>☁️ 云端</Tag>}
            {friendlyBankName(bank.name)}
          </Title>
          {isCloud ? (
            <Text type="secondary">
              {(bank as CloudBankInfo).description || '云端共享题库'} · {(bank as CloudBankInfo).question_count} 题
            </Text>
          ) : (
            bank.description && <Text type="secondary">{bank.description}</Text>
          )}
        </div>
        <div className="bank-detail-actions">
          <Button type="primary" icon={<PlayCircleOutlined />} size="large" onClick={handleQuickStart}>
            开始刷题
          </Button>
          <Button className="bank-detail-icon-action" size="large" icon={<SettingOutlined />} onClick={() => openModal('practice')} aria-label="练习设置" />
          <Button className="bank-detail-icon-action" size="large" icon={<CameraOutlined />} onClick={() => openModal('photo')} aria-label="拍照搜题" />
        </div>
      </div>

      {/* Stats Overview */}
      <Row className="bank-detail-type-grid bank-detail-card-grid" gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card size="small" hoverable style={{ cursor: 'pointer' }} onClick={() => handleCardClick('all')}>
            <Statistic title="题目总数" value={displayQuestions?.length || 0} valueStyle={{ color: 'var(--app-primary)' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" hoverable style={{ cursor: 'pointer' }} onClick={() => handleCardClick('choice')}>
            <Statistic title="选择题" value={displayQuestions?.filter((q) => q.type === 'choice').length || 0} valueStyle={{ color: 'var(--app-primary)' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" hoverable style={{ cursor: 'pointer' }} onClick={() => handleCardClick('multi')}>
            <Statistic title="多选题" value={displayQuestions?.filter((q) => q.type === 'multi').length || 0} valueStyle={{ color: 'var(--app-primary-hover)' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" hoverable style={{ cursor: 'pointer' }} onClick={() => handleCardClick('fill')}>
            <Statistic title="填空题" value={displayQuestions?.filter((q) => q.type === 'fill').length || 0} valueStyle={{ color: 'var(--app-review)' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" hoverable style={{ cursor: 'pointer' }} onClick={() => handleCardClick('judge')}>
            <Statistic title="判断题" value={displayQuestions?.filter((q) => q.type === 'judge').length || 0} valueStyle={{ color: 'var(--app-primary-hover)' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" hoverable style={{ cursor: 'pointer' }} onClick={() => handleCardClick('essay')}>
            <Statistic title="简答题" value={displayQuestions?.filter((q) => q.type === 'essay').length || 0} valueStyle={{ color: 'var(--app-success)' }} />
          </Card>
        </Col>
        {(displayQuestions?.filter((q) => q.type === 'nofill').length || 0) > 0 && (
        <Col xs={12} sm={6}>
          <Card size="small" hoverable style={{ cursor: 'pointer' }} onClick={() => handleCardClick('nofill')}>
            <Statistic title="背记题" value={displayQuestions?.filter((q) => q.type === 'nofill').length || 0} valueStyle={{ color: '#8c8c8c' }} />
          </Card>
        </Col>
        )}
      </Row>

      {/* Practice Stats — always visible, real-time from sessionAnswers */}
      <Row className="bank-detail-practice-grid bank-detail-card-grid" gutter={[16, 16]}>
        <Col xs={12} sm={4}>
          <Card size="small">
            <Statistic title="练习次数" value={stats?.practiceCount || 0} />
          </Card>
        </Col>
        <Col xs={12} sm={5}>
          <Card size="small">
            <Statistic title="总答题数" value={stats?.total || 0} />
          </Card>
        </Col>
        <Col xs={12} sm={5}>
          <Card size="small">
            <Statistic title="正确数" value={stats?.correct || 0} valueStyle={{ color: 'var(--app-success)' }} />
          </Card>
        </Col>
        <Col xs={12} sm={5}>
          <Card size="small">
            <Statistic title="错误数" value={stats?.wrong || 0} valueStyle={{ color: 'var(--app-error)' }} />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small" className="bank-detail-learning-stat is-mastered">
            <Statistic title="已掌握" value={learningState.mastered} valueStyle={{ color: 'var(--app-success)' }} />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small" className="bank-detail-learning-stat is-review">
            <Statistic title="需复习" value={isCloud ? cloudWrongCount : learningState.review} valueStyle={{ color: '#d97706' }} />
          </Card>
        </Col>
        <Col xs={12} sm={5}>
          <Card size="small">
            <Statistic title="正确率" value={stats?.accuracy || 0} suffix="%" valueStyle={{ color: (stats?.accuracy || 0) >= 80 ? 'var(--app-success)' : (stats?.accuracy || 0) >= 50 ? 'var(--app-review)' : 'var(--app-error)' }} />
          </Card>
        </Col>
      </Row>
      <Card className="bank-detail-chart-card" size="small" title="成绩趋势">
        <Suspense fallback={<Skeleton active paragraph={{ rows: 3 }} title={false} />}>
          <StatsChart data={chartData} />
        </Suspense>
      </Card>

      {/* 复习队列 */}
      {((!isCloud && wrongQuestionIds && wrongQuestionIds.length > 0) || (isCloud && cloudWrongCount > 0)) && (
        <div className="bank-detail-wrong-banner">
          <div>
            <Text className="bank-detail-wrong-title" strong>
              <WarningFilled style={{ marginRight: 8 }} />
              你有 {isCloud ? cloudWrongCount : wrongQuestionIds!.length} 道题需要再看一遍
            </Text>
            <Text className="bank-detail-wrong-hint" type="secondary">
              这些题来自最近一次“再看一遍”或答错记录
            </Text>
          </div>
          <Button
            type="primary"
            size="large"
            icon={<PlayCircleOutlined />}
            onClick={handleWrongPractice}
            className="bank-detail-wrong-button"
            loading={isCloud && cloudWrongLoading}
          >
            开始复习 ({isCloud ? cloudWrongCount : wrongQuestionIds!.length})
          </Button>
        </div>
      )}

      {/* Question List */}
      <Card
        className="bank-detail-question-list-card"
        title={`题目列表 (${filteredQuestions.length})`}
        extra={
          <Space>
            {isCloud && (
              <Button icon={<CloudOutlined />} onClick={async () => {
                try {
                  const { syncCloudBankToLocal } = await import('../lib/uploadService');
                  const added = await syncCloudBankToLocal(id!, bank.name, user!.id);
                  if (added > 0) {
                    message.success(`已缓存 ${added} 题到本地`);
                  } else {
                    message.info('该题库已缓存到本地');
                  }
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : '缓存失败';
                  message.error(msg);
                }
              }}>
                缓存到本地
              </Button>
            )}
            {!isCloud && (
              <Button icon={<InboxOutlined />} onClick={() => openModal('import')}>
                导入题目
              </Button>
            )}
          </Space>
        }
      >
        <Tabs
          className="bank-detail-filter-tabs"
          activeKey={filterType}
          onChange={(key) => setFilterType(key as FilterType)}
          items={[
            { key: 'all', label: `全部 (${displayQuestions?.length || 0})` },
            { key: 'choice', label: `单选题 (${displayQuestions?.filter((q) => q.type === 'choice').length || 0})` },
            { key: 'multi', label: `多选题 (${displayQuestions?.filter((q) => q.type === 'multi').length || 0})` },
            { key: 'fill', label: `填空题 (${displayQuestions?.filter((q) => q.type === 'fill').length || 0})` },
            { key: 'judge', label: `判断题 (${displayQuestions?.filter((q) => q.type === 'judge').length || 0})` },
            { key: 'essay', label: `简答题 (${displayQuestions?.filter((q) => q.type === 'essay').length || 0})` },
            { key: 'nofill', label: `背记题 (${displayQuestions?.filter((q) => q.type === 'nofill').length || 0})` },
          ]}
        />
        <div className="bank-detail-list-toolbar">
        <Input.Search
          placeholder="搜索题目内容、答案、选项..."
          allowClear
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onSearch={(v) => setSearchTerm(v)}
          className="bank-detail-search"
          prefix={<SearchOutlined />}
        />
        </div>
        {filteredQuestions.length > 0 ? (
          <Table
            className="question-list-table"
            dataSource={filteredQuestions}
            columns={tableColumns}
            rowKey={(record) => String(record.id)}
            size="small"
            scroll={{ x: 860 }}
            pagination={{ pageSize: 15, showSizeChanger: false, position: ['bottomCenter'] }}
            expandable={{
              expandedRowRender: (record: Question) => (
                <div style={{ padding: '8px 0' }}>
                  <QuestionCard question={record} showAnswer />
                </div>
              ),
              rowExpandable: () => true,
            }}
          />
        ) : (
          <Empty description="暂无题目" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>

      {/* Practice Mode Selector */}
      <Modal
        title="选择练习模式"
        open={practiceOpen}
        onCancel={() => closeModal('practice')}
        onOk={handleStartPractice}
        okText="开始练习"
      >
        <div className="bank-detail-practice-modal-body">
          <Text strong>选择题目类型:</Text>
          <Radio.Group
            value={practiceMode}
            onChange={(e) => setPracticeMode(e.target.value)}
            className="bank-detail-practice-mode-list"
          >
            <Radio value="all">
              <Space>
                <Tag>全部</Tag>
                <Text type="secondary">{displayQuestions?.length || 0} 题</Text>
              </Space>
            </Radio>
            <Radio value="choice">
              <Space>
                <Tag color="blue">单选题</Tag>
                <Text type="secondary">{displayQuestions?.filter((q) => q.type === 'choice').length || 0} 题</Text>
              </Space>
            </Radio>
            <Radio value="multi">
              <Space>
                <Tag color="cyan">多选题</Tag>
                <Text type="secondary">{displayQuestions?.filter((q) => q.type === 'multi').length || 0} 题</Text>
              </Space>
            </Radio>
            <Radio value="fill">
              <Space>
                <Tag color="orange">填空题</Tag>
                <Text type="secondary">{displayQuestions?.filter((q) => q.type === 'fill').length || 0} 题</Text>
              </Space>
            </Radio>
            <Radio value="judge">
              <Space>
                <Tag color="purple">判断题</Tag>
                <Text type="secondary">{displayQuestions?.filter((q) => q.type === 'judge').length || 0} 题</Text>
              </Space>
            </Radio>
            <Radio value="essay">
              <Space>
                <Tag color="green">简答题</Tag>
                <Text type="secondary">{displayQuestions?.filter((q) => q.type === 'essay').length || 0} 题</Text>
              </Space>
            </Radio>
            <Radio value="nofill">
              <Space>
                <Tag color="gold">背记题</Tag>
                <Text type="secondary">{displayQuestions?.filter((q) => q.type === 'nofill').length || 0} 题</Text>
              </Space>
            </Radio>
          </Radio.Group>

          {/* 随机抽题 */}
          <div className="bank-detail-random-block">
            <Text strong>随机抽题（可选）:</Text>
            <div className="bank-detail-random-input-row">
              <InputNumber
                min={0}
                max={displayQuestions?.length || 0}
                value={randomCount}
                onChange={(v) => setRandomCount(v || 0)}
                style={{ flex: 1 }}
                placeholder="留空或填 0 则练习全部题目"
              />
              <Text>题</Text>
            </div>
          </div>
        </div>
      </Modal>

      {/* Photo Search */}
      {photoSearchOpen && (
        <Suspense fallback={null}>
          <PhotoSearch
            open={photoSearchOpen}
            onClose={() => closeModal('photo')}
            questions={displayQuestions}
          />
        </Suspense>
      )}

      {/* Import Modal - only for local banks */}
      {!isCloud && importOpen && (
        <Suspense fallback={null}>
          <ImportModal open={importOpen} bankId={Number(bankId)} onClose={() => closeModal('import')} />
        </Suspense>
      )}
    </div>
  );
}
