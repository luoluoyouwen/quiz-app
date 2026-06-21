import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Row, Col, Table, Button, Modal, Typography, Tag, Space, Statistic,
  Radio, message, Empty, Popconfirm, Tabs,
} from 'antd';
import {
  DeleteOutlined, PlayCircleOutlined, InboxOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import { db, type Question, type QuestionType } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import ImportModal from '../components/ImportModal';
import QuestionCard from '../components/QuestionCard';

const { Title, Text } = Typography;

const typeLabels: Record<string, { label: string; color: string }> = {
  choice: { label: '选择题', color: 'blue' },
  multi: { label: '多选题', color: 'cyan' },
  fill: { label: '填空题', color: 'orange' },
  judge: { label: '判断题', color: 'purple' },
  essay: { label: '简答题', color: 'green' },
};

type FilterType = 'all' | QuestionType;

export default function BankDetail() {
  const { id } = useParams<{ id: string }>();
  const bankId = Number(id);
  const navigate = useNavigate();

  const [filterType, setFilterType] = useState<FilterType>('all');
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [practiceMode, setPracticeMode] = useState<FilterType>('all');
  const [importOpen, setImportOpen] = useState(false);

  const bank = useLiveQuery(() => db.banks.get(bankId));
  const questions = useLiveQuery(() => db.questions.where('bankId').equals(bankId).toArray(), [bankId]);

  const sessions = useLiveQuery(() =>
    db.sessions.where('bankId').equals(bankId).reverse().toArray(), [bankId]
  );

  const filteredQuestions = useMemo(() => {
    if (!questions) return [];
    if (filterType === 'all') return questions;
    return questions.filter((q) => q.type === filterType);
  }, [questions, filterType]);

  const stats = useMemo(() => {
    if (!sessions || sessions.length === 0) return null;
    const total = sessions.reduce((s, sess) => s + sess.totalQuestions, 0);
    const correct = sessions.reduce((s, sess) => s + sess.correctAnswers, 0);
    const wrong = sessions.reduce((s, sess) => s + sess.wrongAnswers, 0);
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { total, correct, wrong, accuracy };
  }, [sessions]);

  const handleDelete = async () => {
    await db.questions.where('bankId').equals(bankId).delete();
    await db.sessions.where('bankId').equals(bankId).delete();
    await db.banks.delete(bankId);
    message.success('题库已删除');
    navigate('/');
  };

  const handleStartPractice = () => {
    setPracticeOpen(false);
    navigate(`/practice/${bankId}`, { state: { type: practiceMode } });
  };

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
      ellipsis: true,
    },
    {
      title: '答案',
      dataIndex: 'answer',
      width: 100,
      ellipsis: true,
    },
  ];

  if (!bank) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description="题库不存在" />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} style={{ padding: 0, marginBottom: 8 }}>
            返回
          </Button>
          <Title level={3} style={{ margin: 0 }}>{bank.name}</Title>
          {bank.description && <Text type="secondary">{bank.description}</Text>}
        </div>
        <Space>
          <Button type="primary" icon={<PlayCircleOutlined />} size="large" onClick={() => setPracticeOpen(true)}>
            开始刷题
          </Button>
          <Popconfirm
            title="确定删除此题库？"
            description="所有题目和练习记录也将被删除"
            onConfirm={handleDelete}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      </div>

      {/* Stats Overview */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="题目总数" value={questions?.length || 0} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="选择题" value={questions?.filter((q) => q.type === 'choice').length || 0} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="多选题" value={questions?.filter((q) => q.type === 'multi').length || 0} valueStyle={{ color: '#13c2c2' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="填空题" value={questions?.filter((q) => q.type === 'fill').length || 0} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="判断题" value={questions?.filter((q) => q.type === 'judge').length || 0} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="简答题" value={questions?.filter((q) => q.type === 'essay').length || 0} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="无空填空题" value={questions?.filter((q) => q.type === 'nofill').length || 0} valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
      </Row>

      {/* Practice Stats */}
      {stats && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="练习次数" value={sessions?.length || 0} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="总答题数" value={stats.total} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="正确数" value={stats.correct} valueStyle={{ color: '#52c41a' }} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="正确率" value={stats.accuracy} suffix="%" valueStyle={{ color: stats.accuracy >= 80 ? '#52c41a' : stats.accuracy >= 50 ? '#faad14' : '#ff4d4f' }} />
            </Card>
          </Col>
        </Row>
      )}

      {/* Question List */}
      <Card
        title={`题目列表 (${filteredQuestions.length})`}
        extra={
          <Button icon={<InboxOutlined />} onClick={() => setImportOpen(true)}>
            导入题目
          </Button>
        }
        style={{ marginBottom: 24 }}
      >
        <Tabs
          activeKey={filterType}
          onChange={(key) => setFilterType(key as FilterType)}
          items={[
            { key: 'all', label: `全部 (${questions?.length || 0})` },
            { key: 'choice', label: `单选题 (${questions?.filter((q) => q.type === 'choice').length || 0})` },
            { key: 'multi', label: `多选题 (${questions?.filter((q) => q.type === 'multi').length || 0})` },
            { key: 'fill', label: `填空题 (${questions?.filter((q) => q.type === 'fill').length || 0})` },
            { key: 'judge', label: `判断题 (${questions?.filter((q) => q.type === 'judge').length || 0})` },
            { key: 'essay', label: `简答题 (${questions?.filter((q) => q.type === 'essay').length || 0})` },
            { key: 'nofill', label: `无空填空题 (${questions?.filter((q) => q.type === 'nofill').length || 0})` },
          ]}
          style={{ marginBottom: 16 }}
        />
        {filteredQuestions.length > 0 ? (
          <Table
            dataSource={filteredQuestions}
            columns={tableColumns}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 15, showSizeChanger: false }}
            expandable={{
              expandedRowRender: (record: Question) => (
                <div style={{ padding: '8px 0' }}>
                  <QuestionCard question={record} />
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
        onCancel={() => setPracticeOpen(false)}
        onOk={handleStartPractice}
        okText="开始练习"
      >
        <div style={{ padding: '16px 0' }}>
          <Text strong>选择题目类型:</Text>
          <Radio.Group
            value={practiceMode}
            onChange={(e) => setPracticeMode(e.target.value)}
            style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}
          >
            <Radio value="all">
              <Space>
                <Tag>全部</Tag>
                <Text type="secondary">{questions?.length || 0} 题</Text>
              </Space>
            </Radio>
            <Radio value="choice">
              <Space>
                <Tag color="blue">单选题</Tag>
                <Text type="secondary">{questions?.filter((q) => q.type === 'choice').length || 0} 题</Text>
              </Space>
            </Radio>
            <Radio value="multi">
              <Space>
                <Tag color="cyan">多选题</Tag>
                <Text type="secondary">{questions?.filter((q) => q.type === 'multi').length || 0} 题</Text>
              </Space>
            </Radio>
            <Radio value="fill">
              <Space>
                <Tag color="orange">填空题</Tag>
                <Text type="secondary">{questions?.filter((q) => q.type === 'fill').length || 0} 题</Text>
              </Space>
            </Radio>
            <Radio value="judge">
              <Space>
                <Tag color="purple">判断题</Tag>
                <Text type="secondary">{questions?.filter((q) => q.type === 'judge').length || 0} 题</Text>
              </Space>
            </Radio>
            <Radio value="essay">
              <Space>
                <Tag color="green">简答题</Tag>
                <Text type="secondary">{questions?.filter((q) => q.type === 'essay').length || 0} 题</Text>
              </Space>
            </Radio>
            <Radio value="nofill">
              <Space>
                <Tag color="gold">无空填空题</Tag>
                <Text type="secondary">{questions?.filter((q) => q.type === 'nofill').length || 0} 题</Text>
              </Space>
            </Radio>
          </Radio.Group>
        </div>
      </Modal>

      {/* Import Modal */}
      <ImportModal open={importOpen} bankId={bankId} onClose={() => setImportOpen(false)} />
    </div>
  );
}
