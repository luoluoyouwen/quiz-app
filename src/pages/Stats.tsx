import { useMemo } from 'react';
import { Card, Row, Col, Statistic, Typography, Skeleton, Empty, Table } from 'antd';
import {
  QuestionCircleOutlined,
  CheckCircleOutlined,
  TrophyOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SessionAnswer } from '../db';
import { useAuth } from '../contexts/AuthContext';
import { calculateStats } from '../utils/quiz/stats';

const { Title, Text } = Typography;

function friendlyBankName(raw: string): string {
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

interface SessionRow {
  bankName: string;
  correct: number;
  total: number;
  date: string;
  accuracy: number;
}

export default function Stats() {
  const { user } = useAuth();

  const banks = useLiveQuery(() => {
    if (!user) return [];
    return db.banks.where('userId').equals(user.id).toArray();
  }, [user]);

  const questions = useLiveQuery(() => db.questions.toArray());
  const sessionAnswers = useLiveQuery(
    () => user
      ? db.sessionAnswers.where('userId').equals(user.id).toArray()
      : Promise.resolve<SessionAnswer[]>([]),
    [user?.id],
  );
  const sessions = useLiveQuery(
    async () => {
      if (!user) return [];
      const rows = await db.sessions.where('userId').equals(user.id).toArray();
      return rows.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    },
    [user?.id],
  );

  const stats = questions && sessionAnswers
    ? calculateStats(sessionAnswers, questions)
    : null;

  // ── Build a map: sessionId → bankId + date (for display) ──
  const sessionMeta = useMemo(() => {
    const map = new Map<number, { bankId: number; date: string }>();
    for (const s of (sessions || [])) {
      const bankId = s.bankId as number;
      const dateStr = new Date(s.endedAt || s.startedAt).toLocaleDateString('zh-CN');
      map.set(s.id!, { bankId, date: dateStr });
    }
    return map;
  }, [sessions]);

  // ── Aggregate sessionAnswers per session for real correct/total ──
  const sessionAgg = useMemo(() => {
    const agg = new Map<number, { correct: number; total: number }>();
    if (!sessionAnswers) return agg;
    for (const a of sessionAnswers) {
      if (a.sessionId == null) continue;
      const cur = agg.get(a.sessionId) || { correct: 0, total: 0 };
      cur.total++;
      if (a.isCorrect) cur.correct++;
      agg.set(a.sessionId, cur);
    }
    return agg;
  }, [sessionAnswers]);

  // Format session rows — use real data from sessionAnswers, not stale session fields
  const sessionRows: SessionRow[] = useMemo(() => {
    const rows: SessionRow[] = [];
    for (const [sessionId, meta] of sessionMeta) {
      const agg = sessionAgg.get(sessionId);
      const correct = agg?.correct ?? 0;
      const total = agg?.total ?? 0;
      // Try session.bankName first (cached at creation time), then local bank lookup
      const session = sessions?.find(s => s.id === sessionId);
      const rawName = session?.bankName
        || banks?.find(b => b.id === meta.bankId)?.name;
      const bankName = rawName ? friendlyBankName(rawName) : `题库 #${String(meta.bankId).slice(0, 6)}`;
      rows.push({
        bankName,
        correct,
        total,
        date: meta.date,
        accuracy: total > 0 ? (correct / total) * 100 : 0,
      });
    }
    // Sort by date descending, take top 20
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows.slice(0, 20);
  }, [sessionMeta, sessionAgg, banks, sessions]);

  const sessionColumns = [
    { title: '题库', dataIndex: 'bankName', key: 'bankName', ellipsis: true },
    { title: '正确/总题', dataIndex: 'total', key: 'total', width: 100, align: 'center' as const,
      render: (_: unknown, r: SessionRow) => <Text>{r.correct}/{r.total}</Text> },
    { title: '正确率', dataIndex: 'accuracy', key: 'accuracy', width: 100, align: 'center' as const,
      render: (v: number) => <Text style={{ color: v >= 80 ? 'var(--app-success)' : v >= 50 ? 'var(--app-review)' : 'var(--app-error)' }}>{v.toFixed(0)}%</Text> },
    { title: '日期', dataIndex: 'date', key: 'date', width: 120, align: 'center' as const },
  ];

  const loading = banks === undefined
    || questions === undefined
    || sessionAnswers === undefined
    || sessions === undefined;

  if (loading) {
    return (
      <div className="stats-page stats-workbench stats-loading">
        <Skeleton active paragraph={{ rows: 4 }} />
      </div>
    );
  }

  return (
    <div className="stats-page stats-workbench">
      <div className="subpage-hero stats-hero">
        <div>
          <Text className="subpage-eyebrow">练习概览</Text>
          <Title className="stats-page-title" level={3}>统计</Title>
        </div>
        <Text className="subpage-hero-copy">最近答题表现、正确率和题库覆盖情况</Text>
      </div>

      <Row className="stats-overview-grid subpage-card-grid" gutter={[12, 12]}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="总刷题数"
              value={stats?.total ?? 0}
              prefix={<QuestionCircleOutlined style={{ color: 'var(--app-primary)' }} />}
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="正确率"
              value={stats && stats.total > 0 ? Number((stats.accuracy * 100).toFixed(1)) : 0}
              suffix="%"
              prefix={<CheckCircleOutlined style={{ color: 'var(--app-success)' }} />}
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="练习次数"
              value={sessionAgg?.size ?? 0}
              prefix={<TrophyOutlined style={{ color: 'var(--app-review)' }} />}
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="题库数"
              value={banks?.length ?? 0}
              prefix={<CalendarOutlined style={{ color: 'var(--app-primary-hover)' }} />}
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
      </Row>

      <Card className="stats-history-card" title="最近练习记录" styles={{ body: { padding: 0 } }}>
        {sessionRows.length === 0 ? (
          <Empty description="去题库选一组开始刷题吧" style={{ padding: 24 }} />
        ) : (
          <Table
            dataSource={sessionRows}
            columns={sessionColumns}
            rowKey={(_, i) => String(i)}
            pagination={false}
            size="small"
            scroll={{ x: 'max-content' }}
          />
        )}
      </Card>
    </div>
  );
}
