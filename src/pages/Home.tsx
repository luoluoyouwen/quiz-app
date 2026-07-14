import { lazy, Suspense, useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Row, Col, Button, Modal, Typography, Statistic, Empty, message, Tag, Skeleton, Space } from 'antd';
import {
  ImportOutlined,
  RightCircleOutlined,
  DeleteOutlined,
  BookOutlined,
  QuestionCircleOutlined,
  TrophyOutlined,
  CloudOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { db, type QuestionBank } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import LandingHero from '../components/LandingHero';
import { useAuth } from '../contexts/AuthContext';
import { EMPTY_LEARNING_STATUS, summarizeLatestLearningStatus, type LearningAnswerRecord, type LearningStatus } from '../utils/learningStatus';

const { Title, Text } = Typography;

const ImportModal = lazy(() => import('../components/ImportModal'));

const C = {
  untitled: '未命名题库', uploadFirst: '上传第一个题库', uploadBank: '上传题库',
  bankWorkbench: '题库工作台', myBanks: '我的题库', questionCount: '题目数', bankCount: '题库数', totalQuestions: '总题数', practiceCount: '练习次数',
  localBank: '本地题库', cloudBank: '云端共享题库', cached: '缓存', cloud: '云端', pending: '待审核', rejected: '已驳回',
  importQuestions: '导入题目', startPractice: '开始刷题', delete: '删除', cacheLocal: '缓存到本地', deleteCache: '删除缓存', retry: '重试',
  noBanks: '还没有题库', supports: '支持单选、多选、填空、判断和简答题', emptyHint: '上传后可离线刷题，也可同步到云端审核',
  loginFirst: '请先登录后再上传题库', confirmDelete: '确定删除题库', deleteContent: '该题库下的所有题目和练习记录也会被删除，此操作不可恢复。', confirm: '确认删除', cancel: '取消', deleted: '已删除',
  neverPracticed: '未练习', lastPractice: '上次练习', loadingCloud: '正在加载云端题库...', loadCloudFailed: '云端题库加载失败', uploadTime: '上传时间',
  offlineNote: '离线缓存：当前云端不可用时，可继续使用已缓存题库刷题。', offlineUsable: '离线可刷', status: '状态', cachedDone: '已缓存', cachedToLocal: '已缓存到本地', cacheFailed: '缓存失败'
};

function friendlyBankName(raw: string): string {
  if (!raw) return C.untitled;
  const name = raw.replace(/^\d+[.、-]\s*/, '').replace(/粉煤热解装置/g, '').replace(/岗位标准题库[\d.]+/g, '').replace(/2026\.\d+/g, '').replace(/\.docx?$/i, '').trim();
  return name || raw.replace(/\.docx?$/i, '').trim() || C.untitled;
}

function documentBankName(raw: string): string {
  const name = raw
    .replace(/\.docx?$/i, '')
    .replace(/^\d+[.、-]\s*/, '')
    .replace(/粉煤热解装置/g, '')
    .replace(/岗位标准题库[\d.]*$/g, '岗位题库')
    .replace(/2026\.\d+$/g, '')
    .trim();
  const base = name || friendlyBankName(raw);
  return /\.docx?$/i.test(base) ? base : base + '.docx';
}

interface CloudBank { id: string; name: string; description: string; question_count: number; created_at: string; created_by: string; review_status?: 'pending' | 'approved' | 'rejected'; }
type BankLearningStatus = LearningStatus;
type BankCardVariant = 'local' | 'cloud' | 'cached';

const LAST_BANK_KEY = 'quiz-app-last-bank-path';
const EMPTY_STATUS: BankLearningStatus = EMPTY_LEARNING_STATUS;

export default function Home() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [importBankId, setImportBankId] = useState<number | undefined>(undefined);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [cloudBanks, setCloudBanks] = useState<CloudBank[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState(false);
  const [cloudLearningStats, setCloudLearningStats] = useState<Record<string, BankLearningStatus>>({});
  const [cloudLearningLoading, setCloudLearningLoading] = useState(false);

  const banks = useLiveQuery(() => { if (!user) return []; return db.banks.where('userId').equals(user.id).toArray(); }, [user?.id]);
  const localBanks = useMemo(() => (banks || []).filter(b => !b.description?.startsWith('☁️')), [banks]);
  const cachedCloudBanks: QuestionBank[] = useMemo(() => (banks || []).filter(b => b.description?.startsWith('☁️ ')), [banks]);
  const questionCounts = useLiveQuery(() => db.questions.toArray().then((qs) => { const counts: Record<number, number> = {}; for (const q of qs) counts[q.bankId] = (counts[q.bankId] || 0) + 1; return counts; }));
  const totalSessions = useLiveQuery(() => user ? db.sessions.where('userId').equals(user.id).count() : Promise.resolve(0), [user?.id]);
  const localQuestionTotal = useMemo(
    () => localBanks.reduce((sum, bank) => sum + (bank.id ? (questionCounts?.[bank.id] || 0) : 0), 0),
    [localBanks, questionCounts],
  );
  const cloudQuestionTotal = useMemo(
    () => cloudBanks.reduce((sum, bank) => sum + (bank.question_count || 0), 0),
    [cloudBanks],
  );
  const cachedQuestionTotal = useMemo(
    () => cachedCloudBanks.reduce((sum, bank) => sum + (bank.id ? (questionCounts?.[bank.id] || 0) : 0), 0),
    [cachedCloudBanks, questionCounts],
  );
  const totalQuestions = localQuestionTotal + (cloudBanks.length > 0 ? cloudQuestionTotal : cachedQuestionTotal);

  const bankLearningStats = useLiveQuery(async () => {
    if (!user || !banks?.length) return {} as Record<number, BankLearningStatus>;
    const bankIds = new Set((banks || []).map(bank => bank.id).filter(Boolean) as number[]);
    const result: Record<number, BankLearningStatus> = {};
    const questionBankMap = new Map<number, number>();

    for (const bankId of bankIds) {
      result[bankId] = { ...EMPTY_STATUS };
    }

    const questions = await db.questions.toArray();
    for (const question of questions) {
      if (!bankIds.has(question.bankId)) continue;
      if (question.id != null) questionBankMap.set(question.id, question.bankId);
    }

    const answers = await db.sessionAnswers.where('userId').equals(user.id).toArray();
    const recordsByBank = new Map<number, LearningAnswerRecord[]>();
    for (const answer of answers) {
      const bankId = questionBankMap.get(answer.questionId);
      if (bankId == null) continue;
      const records = recordsByBank.get(bankId) || [];
      records.push({
        id: answer.id,
        questionId: answer.questionId,
        isCorrect: answer.isCorrect,
      });
      recordsByBank.set(bankId, records);
    }

    for (const [bankId, records] of recordsByBank) {
      result[bankId] = summarizeLatestLearningStatus(records);
    }

    return result;
  }, [user?.id, banks]);

  const wrongBankPath = useLiveQuery(async () => {
    if (!user || !banks?.length) return '';
    const questions = await db.questions.toArray();
    const questionBankMap = new Map<number, number>();
    for (const q of questions) {
      if (q.id != null) questionBankMap.set(q.id, q.bankId);
    }

    const answers = await db.sessionAnswers.where('userId').equals(user.id).toArray();
    const latestByQuestion = new Map<number, typeof answers[number]>();
    for (const answer of answers) {
      const previous = latestByQuestion.get(answer.questionId);
      if (!previous || (answer.id ?? 0) > (previous.id ?? 0)) {
        latestByQuestion.set(answer.questionId, answer);
      }
    }

    const wrongBankIds = new Set<number>();
    for (const answer of latestByQuestion.values()) {
      if (answer.isCorrect) continue;
      const answerBankId = questionBankMap.get(answer.questionId);
      if (answerBankId != null) wrongBankIds.add(answerBankId);
    }
    if (wrongBankIds.size === 0) return '';

    const orderedBanks = [...banks].sort((a, b) => {
      const aTime = new Date(a.lastPracticed || a.createdAt).getTime();
      const bTime = new Date(b.lastPracticed || b.createdAt).getTime();
      return bTime - aTime;
    });
    const target = orderedBanks.find(bank => bank.id != null && wrongBankIds.has(bank.id));
    return target?.id ? '/bank/' + target.id : '';
  }, [user?.id, banks]);

  const fetchCloudBanks = useCallback(async (uid: string) => {
    setCloudLoading(true); setCloudError(false);
    try {
      const { fetchVisibleBanks } = await import('../lib/uploadService');
      const result = await Promise.race([fetchVisibleBanks(uid), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))]);
      setCloudBanks(result);
    } catch { setCloudError(true); }
    finally { setCloudLoading(false); }
  }, []);

  useEffect(() => { if (!user) { setCloudBanks([]); return; } fetchCloudBanks(user.id); }, [user, fetchCloudBanks]);

  useEffect(() => {
    if (!user || cloudBanks.length === 0) {
      setCloudLearningStats({});
      setCloudLearningLoading(false);
      return;
    }

    let cancelled = false;
    setCloudLearningLoading(true);

    import('../lib/syncService')
      .then(({ fetchBankProgress }) => Promise.all(cloudBanks.map(async (bank) => {
        try {
          const progress = await fetchBankProgress(user.id, bank.id);
          const status = summarizeLatestLearningStatus(
            Array.from(progress.entries()).map(([questionId, record]) => ({
              questionId,
              isCorrect: record.isCorrect,
            })),
          );
          return [bank.id, status] as const;
        } catch {
          return [bank.id, { ...EMPTY_STATUS }] as const;
        }
      })))
      .then((entries) => {
        if (!cancelled) setCloudLearningStats(Object.fromEntries(entries));
      })
      .finally(() => {
        if (!cancelled) setCloudLearningLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, cloudBanks]);

  const handleOpenImportModal = (bankId?: number) => {
    if (!user) { message.warning(C.loginFirst); return; }
    setImportBankId(bankId);
    setImportModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.set('modal', 'import');
    setSearchParams(next);
  };

  const closeImportModal = () => {
    setImportModalOpen(false);
    setImportBankId(undefined);
    if (searchParams.get('modal') === 'import') {
      const next = new URLSearchParams(searchParams);
      next.delete('modal');
      setSearchParams(next, { replace: true });
    }
  };

  useEffect(() => {
    if (searchParams.get('modal') === 'import') {
      setImportModalOpen(true);
      return;
    }
    if (importModalOpen || importBankId !== undefined) {
      setImportModalOpen(false);
      setImportBankId(undefined);
    }
  }, [searchParams, importModalOpen, importBankId]);

  const handleDeleteBank = (bank: QuestionBank) => {
    Modal.confirm({
      title: C.confirmDelete + '：' + friendlyBankName(bank.name),
      content: C.deleteContent,
      okText: C.confirm,
      okButtonProps: { danger: true },
      cancelText: C.cancel,
      onOk: async () => {
        const id = bank.id!;
        await db.questions.where('bankId').equals(id).delete();
        await db.sessions.where('bankId').equals(id).delete();
        await db.banks.delete(id);
        message.success(friendlyBankName(bank.name) + ' ' + C.deleted);
      }
    });
  };

  const formatDate = (d?: Date) => !d ? C.neverPracticed : new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d instanceof Date ? d : new Date(d));

  const getRecentBankPath = () => {
    try {
      const stored = localStorage.getItem(LAST_BANK_KEY);
      if (stored?.startsWith('/bank/')) return stored;
    } catch { /* ignore */ }
    const firstLocal = localBanks[0]?.id ? '/bank/' + localBanks[0].id : '';
    const firstCloud = cloudBanks[0]?.id ? '/bank/' + cloudBanks[0].id : '';
    const firstCached = cachedCloudBanks[0]?.description?.startsWith('☁️ ') ? '/bank/' + cachedCloudBanks[0].description.replace('☁️ ', '') : '';
    return firstLocal || firstCloud || firstCached || '';
  };

  const openRecentBank = () => {
    const path = getRecentBankPath();
    if (path) navigate(path);
    else document.getElementById('bank-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openRecentFeature = (feature: 'photo' | 'wrong') => {
    if (feature === 'wrong') {
      if (wrongBankPath === undefined) {
        message.loading('正在检查错题', 0.8);
        return;
      }
      if (wrongBankPath) {
        navigate(wrongBankPath + '?wrong=1');
        return;
      }
      const recentPath = getRecentBankPath();
      const recentBankId = recentPath.replace('/bank/', '');
      const isCloudRecent = recentPath ? Number.isNaN(Number(recentBankId)) : false;
      if (isCloudRecent) {
        navigate(recentPath + '?wrong=1');
        return;
      }
      message.info('暂无需复习题目');
      return;
    }

    const path = getRecentBankPath();
    if (!path) {
      message.info('请先上传或选择一个题库');
      return;
    }
    navigate(path + '?' + feature + '=1');
  };

  const getLearningStatus = (bankId?: number) => bankId ? (bankLearningStats?.[bankId] || EMPTY_STATUS) : EMPTY_STATUS;

  const renderDocumentPreview = (args: {
    variant: BankCardVariant;
    progress: number;
    documentName: string;
    source: string;
    count: number;
    status: BankLearningStatus;
    statusLoading?: boolean;
  }) => {
    const statusLabel = args.statusLoading
      ? '...'
      : args.status.review > 0
        ? '需复习 ' + args.status.review
        : '已掌握 ' + args.status.mastered;
    const progressWidth = args.progress > 0 ? Math.max(6, args.progress) : 0;

    return (
      <div className={'home-bank-document-body is-' + args.variant} aria-hidden="true">
        <div className="home-bank-doc-head">
          <span className="home-bank-doc-icon"><FileTextOutlined /></span>
          <span className="home-bank-doc-name">{args.documentName}</span>
        </div>
        <div className="home-bank-doc-tags">
          <span>{args.source}</span>
          <span>{args.count} 题</span>
          <span className={args.status.review > 0 ? 'has-review' : ''}>{statusLabel}</span>
        </div>
        <div className="home-bank-preview-progress"><span style={{ width: progressWidth + '%' }} /></div>
      </div>
    );
  };

  const renderBankCard = (args: {
    key: string;
    variant: BankCardVariant;
    title: string;
    description: string;
    source: string;
    count: number;
    status: BankLearningStatus;
    statusLoading?: boolean;
    rawName?: string;
    metaLabel: string;
    metaValue: string;
    extraTags?: React.ReactNode;
    onOpen: () => void;
    onPractice: () => void;
    onSecondary?: () => void;
    secondaryLabel?: string;
    secondaryIcon?: React.ReactNode;
    onDelete?: () => void;
  }) => {
    const status = args.statusLoading ? EMPTY_STATUS : args.status;
    const progress = args.count > 0 ? Math.round((status.mastered / args.count) * 100) : 0;
    const masteredText = args.statusLoading ? '...' : status.mastered;
    const reviewText = args.statusLoading ? '...' : status.review;
    return (
      <Col key={args.key} xs={24} sm={12} md={8} lg={6}>
        <Card hoverable className={'home-bank-card is-' + args.variant} onClick={args.onOpen}>
          <div className="home-bank-card-inner">
            {renderDocumentPreview({
              variant: args.variant,
              progress,
              documentName: documentBankName(args.rawName || args.title),
              source: args.source,
              count: args.count,
              status,
              statusLoading: args.statusLoading,
            })}
            <div className="home-bank-title-wrap">
              <Title level={4} className="home-bank-card-title">{args.title}</Title>
              <Text className="home-bank-card-desc" type="secondary">{args.description}</Text>
              {args.extraTags && <div className="home-bank-extra-tags">{args.extraTags}</div>}
            </div>
            <div className="home-bank-learning-row">
              <span className="is-mastered"><CheckCircleOutlined /> 已掌握 {masteredText}</span>
              <span className={!args.statusLoading && status.review > 0 ? 'is-review has-items' : 'is-review'}><ExclamationCircleOutlined /> 需复习 {reviewText}</span>
            </div>
            <div className="home-bank-meta-row">
              <span>{args.metaLabel}</span>
              <strong>{args.metaValue}</strong>
            </div>
            <div className="home-bank-card-actions">
              <button type="button" className="home-bank-card-action is-primary" onClick={(event) => { event.stopPropagation(); args.onOpen(); }}>
                进入
              </button>
              <button type="button" className="home-bank-card-action" onClick={(event) => { event.stopPropagation(); args.onPractice(); }}>
                <RightCircleOutlined /> 刷题
              </button>
              {args.onSecondary && (
                <button type="button" className="home-bank-card-action" onClick={(event) => { event.stopPropagation(); args.onSecondary?.(); }}>
                  {args.secondaryIcon} {args.secondaryLabel}
                </button>
              )}
              {args.onDelete && (
                <button type="button" className="home-bank-card-icon-action" aria-label={C.delete} onClick={(event) => { event.stopPropagation(); args.onDelete?.(); }}>
                  <DeleteOutlined />
                </button>
              )}
            </div>
          </div>
        </Card>
      </Col>
    );
  };

  return (
    <div className="home-landing-page">
      <LandingHero onUploadBank={() => handleOpenImportModal()} onEnterBank={openRecentBank} onPhotoSearch={() => openRecentFeature('photo')} onWrongPractice={() => openRecentFeature('wrong')} />
      <section id="bank-section" className="home-bank-section">
        <div className="home-bank-header">
          <div>
            <Text type="secondary" className="home-bank-eyebrow">{C.bankWorkbench}</Text>
            <Title level={3} className="home-bank-title">{C.myBanks}</Title>
          </div>
          <Button type="primary" icon={<ImportOutlined />} size="large" onClick={() => handleOpenImportModal()}>{C.uploadBank}</Button>
        </div>
      </section>
      <div className="home-bank-content">
        {banks === undefined ? (
          <div style={{ padding: '24px 0' }}>
            <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 24 }} />
            <Row gutter={[16, 16]}>{[1, 2, 3].map(i => <Col key={i} xs={24} sm={12} md={8} lg={6}><Card><Skeleton active /></Card></Col>)}</Row>
          </div>
        ) : (!banks || banks.length === 0) && cloudBanks.length === 0 ? (
          <div className="home-empty-state">
            <Empty image={<BookOutlined style={{ fontSize: 64, color: 'var(--app-primary-soft)' }} />} description={<div><Text strong style={{ fontSize: 16 }}>{C.noBanks}</Text><br /><Text type="secondary" style={{ fontSize: 14 }}>{C.supports}</Text><br /><Text type="secondary">{C.emptyHint}</Text></div>}>
              <Button type="primary" icon={<ImportOutlined />} onClick={() => handleOpenImportModal()}>{C.uploadFirst}</Button>
            </Empty>
          </div>
        ) : (
          <>
            {(localBanks.length > 0 || cloudBanks.length > 0) && (
              <Row gutter={[16, 16]} className="home-stat-row">
                <Col xs={8}><Card size="small"><Statistic title={C.bankCount} value={localBanks.length + cloudBanks.length} prefix={<BookOutlined />} valueStyle={{ fontSize: 20 }} /></Card></Col>
                <Col xs={8}><Card size="small"><Statistic title={C.totalQuestions} value={totalQuestions} prefix={<QuestionCircleOutlined />} valueStyle={{ fontSize: 20 }} /></Card></Col>
                <Col xs={8}><Card size="small"><Statistic title={C.practiceCount} value={totalSessions ?? 0} prefix={<TrophyOutlined />} valueStyle={{ fontSize: 20 }} /></Card></Col>
              </Row>
            )}
            <Row gutter={[16, 16]}>
              {localBanks.map((bank: QuestionBank) => {
                const count = questionCounts?.[bank.id!] || 0;
                return renderBankCard({
                  key: 'local-' + bank.id,
                  variant: 'local',
                  title: friendlyBankName(bank.name),
                  rawName: bank.name,
                  description: bank.description || C.localBank,
                  source: C.localBank,
                  count,
                  status: getLearningStatus(bank.id),
                  metaLabel: C.lastPractice,
                  metaValue: formatDate(bank.lastPracticed),
                  onOpen: () => navigate('/bank/' + bank.id),
                  onPractice: () => navigate('/practice/' + bank.id),
                  onSecondary: () => handleOpenImportModal(bank.id),
                  secondaryLabel: '导入',
                  secondaryIcon: <ImportOutlined />,
                  onDelete: () => handleDeleteBank(bank),
                });
              })}
              {cloudLoading && <Col span={24}><div className="home-cloud-status"><CloudOutlined /> {C.loadingCloud}</div></Col>}
              {cloudError && !cloudLoading && <Col span={24}><div className="home-cloud-status home-cloud-error"><Text type="secondary" style={{ fontSize: 13 }}>{C.loadCloudFailed}</Text><Button size="small" onClick={() => user && fetchCloudBanks(user.id)}>{C.retry}</Button></div></Col>}
              {cloudBanks.map((bank: CloudBank) => renderBankCard({
                key: 'cloud-' + bank.id,
                variant: 'cloud',
                title: friendlyBankName(bank.name),
                rawName: bank.name,
                description: bank.description || C.cloudBank,
                source: C.cloud,
                count: bank.question_count,
                status: cloudLearningStats[bank.id] || EMPTY_STATUS,
                statusLoading: cloudLearningLoading && !cloudLearningStats[bank.id],
                metaLabel: C.uploadTime,
                metaValue: new Date(bank.created_at).toLocaleDateString('zh-CN'),
                extraTags: <Space size={4}>{bank.review_status === 'pending' && <Tag color="orange">{C.pending}</Tag>}{bank.review_status === 'rejected' && <Tag color="red">{C.rejected}</Tag>}</Space>,
                onOpen: () => navigate('/bank/' + bank.id),
                onPractice: () => navigate('/practice/' + bank.id, { state: { type: 'all', isCloud: true } }),
                onSecondary: () => handleCacheCloudBank(bank, user!.id),
                secondaryLabel: '缓存',
                secondaryIcon: <CloudOutlined />,
              }))}
              {cloudBanks.length === 0 && cachedCloudBanks.length > 0 && (
                <>
                  <Col span={24}><Text type="secondary" className="home-offline-note">{C.offlineNote}</Text></Col>
                  {cachedCloudBanks.map((bank: QuestionBank) => {
                    const count = questionCounts?.[bank.id!] || 0;
                    const cloudUuid = bank.description?.replace('☁️ ', '') || '';
                    return renderBankCard({
                      key: 'cached-' + bank.id,
                      variant: 'cached',
                      title: friendlyBankName(bank.name),
                      rawName: bank.name,
                      description: C.offlineUsable,
                      source: C.cached,
                      count,
                      status: getLearningStatus(bank.id),
                      metaLabel: C.status,
                      metaValue: C.cachedDone,
                      onOpen: () => navigate('/bank/' + cloudUuid),
                      onPractice: () => navigate('/practice/' + cloudUuid, { state: { isCloud: true } }),
                      onDelete: () => handleDeleteBank(bank),
                    });
                  })}
                </>
              )}
            </Row>
          </>
        )}
      </div>
      {(importModalOpen || importBankId !== undefined) && (
        <Suspense fallback={null}>
          <ImportModal open={importModalOpen || importBankId !== undefined} bankId={importBankId} onClose={closeImportModal} />
        </Suspense>
      )}
    </div>
  );
}

async function handleCacheCloudBank(bank: CloudBank, userId: string) {
  try {
    const { syncCloudBankToLocal } = await import('../lib/uploadService');
    const added = await syncCloudBankToLocal(bank.id, bank.name, userId);
    if (added > 0) message.success('已缓存 ' + added + ' 题到本地');
    else message.info(C.cachedToLocal);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : C.cacheFailed;
    message.error(msg);
  }
}