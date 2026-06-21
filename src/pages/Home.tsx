import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Button, Modal, Form, Input, Typography, Statistic, Empty, Tooltip, message, Tag, List, Skeleton } from 'antd';
import { PlusOutlined, ImportOutlined, RightCircleOutlined, DeleteOutlined, InfoCircleOutlined, BookOutlined, QuestionCircleOutlined, TrophyOutlined } from '@ant-design/icons';
import { db, type QuestionBank } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import ImportModal from '../components/ImportModal';
import { APP_VERSION, CHANGELOG } from '../utils/changelog';

const { Title, Text } = Typography;

export default function Home() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [importBankId, setImportBankId] = useState<number | undefined>(undefined);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [form] = Form.useForm();

  const banks = useLiveQuery(() => db.banks.toArray());
  const questionCounts = useLiveQuery(
    () =>
      db.questions
        .toArray()
        .then((qs) => {
          const counts: Record<number, number> = {};
          for (const q of qs) {
            counts[q.bankId] = (counts[q.bankId] || 0) + 1;
          }
          return counts;
        }),
  );
  const totalSessions = useLiveQuery(() => db.sessions.count());

  const totalQuestions = useMemo(() => {
    if (!questionCounts) return 0;
    return Object.values(questionCounts).reduce((a, b) => a + b, 0);
  }, [questionCounts]);

  const totalPracticeCount = totalSessions ?? 0;

  const handleCreateBank = async (values: { name: string; description: string }) => {
    await db.banks.add({
      name: values.name,
      description: values.description || '',
      createdAt: new Date(),
    });
    setCreateOpen(false);
    form.resetFields();
  };

  const handleDeleteBank = (bank: QuestionBank) => {
    Modal.confirm({
      title: `确定删除题库「${bank.name}」？`,
      content: '该题库下的所有题目和练习记录也将被永久删除，此操作不可恢复。',
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const id = bank.id!;
        await db.questions.where('bankId').equals(id).delete();
        await db.sessions.where('bankId').equals(id).delete();
        await db.banks.delete(id);
        message.success(`题库「${bank.name}」已删除`);
      },
    });
  };

  const formatDate = (d?: Date) => {
    if (!d) return '未练习';
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d instanceof Date ? d : new Date(d));
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>我的题库</Title>
        <Button type="primary" icon={<PlusOutlined />} size="large" onClick={() => setCreateOpen(true)}>
          创建题库
        </Button>
      </div>

      {/* Loading state — 骨架屏 */}
      {banks === undefined ? (
        <div style={{ padding: '24px 0' }}>
          <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 24 }} />
          <Row gutter={[16, 16]}>
            {[1, 2, 3].map(i => (
              <Col key={i} xs={24} sm={12} md={8} lg={6}>
                <Card><Skeleton active /></Card>
              </Col>
            ))}
          </Row>
        </div>
      ) : (!banks || banks.length === 0) ? (
        <div style={{ marginTop: 80, textAlign: 'center' }}>
          <Empty
            image={<BookOutlined style={{ fontSize: 64, color: '#1677ff40' }} />}
            description={
              <div>
                <Text strong style={{ fontSize: 16 }}>刷题 App</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 14 }}>支持单选题 / 多选题 / 填空题 / 判断题 / 简答题</Text>
                <br />
                <Text type="secondary">离线可用 · PWA 安装到主屏幕</Text>
              </div>
            }
            style={{ marginBottom: 24 }}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              创建第一个题库
            </Button>
          </Empty>
        </div>
      ) : (
        <>
        {/* 首页统计 */}
        {banks && banks.length > 0 && (
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={8}>
              <Card size="small">
                <Statistic title="题库数" value={banks.length} prefix={<BookOutlined />} valueStyle={{ fontSize: 20, color: '#1677ff' }} />
              </Card>
            </Col>
            <Col xs={8}>
              <Card size="small">
                <Statistic title="总题数" value={totalQuestions} prefix={<QuestionCircleOutlined />} valueStyle={{ fontSize: 20, color: '#52c41a' }} />
              </Card>
            </Col>
            <Col xs={8}>
              <Card size="small">
                <Statistic title="练习次数" value={totalPracticeCount} prefix={<TrophyOutlined />} valueStyle={{ fontSize: 20, color: '#faad14' }} />
              </Card>
            </Col>
          </Row>
        )}
        <Row gutter={[16, 16]}>
          {banks.map((bank: QuestionBank) => {
            const count = questionCounts?.[bank.id!] || 0;
            return (
              <Col key={bank.id} xs={24} sm={12} md={8} lg={6}>
                <Card
                  hoverable
                  actions={[
                    <Tooltip title="导入题目" key="import">
                      <ImportOutlined onClick={(e) => { e.stopPropagation(); setImportBankId(bank.id); }} />
                    </Tooltip>,
                    <Tooltip title="开始刷题" key="practice">
                      <RightCircleOutlined onClick={(e) => { e.stopPropagation(); navigate(`/practice/${bank.id}`); }} />
                    </Tooltip>,
                    <Tooltip title="删除" key="delete">
                      <DeleteOutlined onClick={(e) => { e.stopPropagation(); handleDeleteBank(bank); }} />
                    </Tooltip>,
                  ]}
                  onClick={() => navigate(`/bank/${bank.id}`)}
                >
                  <Card.Meta
                    title={<Text strong ellipsis>{bank.name}</Text>}
                    description={
                      <>
                        <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                          {bank.description || '暂无描述'}
                        </Text>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <Statistic
                            title="题目数"
                            value={count}
                            valueStyle={{ fontSize: 18, fontWeight: 600 }}
                          />
                          <Statistic
                            title="上次练习"
                            value={formatDate(bank.lastPracticed)}
                            valueStyle={{ fontSize: 13, fontWeight: 'normal' }}
                          />
                        </div>
                      </>
                    }
                  />
                </Card>
              </Col>
            );
          })}
        </Row>
        </>
      )}

      {/* Create Bank Modal */}
      <Modal
        title="创建新题库"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText="创建"
      >
        <Form form={form} layout="vertical" onFinish={handleCreateBank}>
          <Form.Item name="name" label="题库名称" rules={[{ required: true, message: '请输入题库名称' }]}>
            <Input placeholder="例如: 高中数学" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="题库描述（可选）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Import Modal */}
      <ImportModal
        open={importBankId !== undefined}
        bankId={importBankId}
        onClose={() => setImportBankId(undefined)}
      />

      {/* 版本号 & 更新日志 */}
      <div style={{ textAlign: 'center', padding: '24px 0 8px', opacity: 0.5 }}>
        <Text
          type="secondary"
          style={{ fontSize: 12, cursor: 'pointer' }}
          onClick={() => setChangelogOpen(true)}
        >
          v{APP_VERSION}
        </Text>
      </div>

      <Modal
        title={
          <span>
            <InfoCircleOutlined style={{ marginRight: 8 }} />
            更新日志
          </span>
        }
        open={changelogOpen}
        onCancel={() => setChangelogOpen(false)}
        footer={<Button onClick={() => setChangelogOpen(false)}>关闭</Button>}
        width={560}
      >
        {CHANGELOG.map((entry) => (
          <div key={entry.version} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Tag color="blue">v{entry.version}</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>{entry.date}</Text>
              <Text strong>{entry.title}</Text>
            </div>
            <List
              size="small"
              dataSource={entry.changes}
              renderItem={(item) => (
                <List.Item style={{ padding: '2px 0' }}>
                  <Text style={{ fontSize: 13 }}>• {item}</Text>
                </List.Item>
              )}
            />
          </div>
        ))}
      </Modal>
    </div>
  );
}
