import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Button, Modal, Form, Input, Typography, Statistic, Empty, Tooltip } from 'antd';
import { PlusOutlined, ImportOutlined, RightCircleOutlined } from '@ant-design/icons';
import { db, type QuestionBank } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import ImportModal from '../components/ImportModal';

const { Title, Text } = Typography;

export default function Home() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [importBankId, setImportBankId] = useState<number | undefined>(undefined);
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

  const handleCreateBank = async (values: { name: string; description: string }) => {
    await db.banks.add({
      name: values.name,
      description: values.description || '',
      createdAt: new Date(),
    });
    setCreateOpen(false);
    form.resetFields();
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

      {(!banks || banks.length === 0) ? (
        <Empty description="还没有题库，点击上方按钮创建" style={{ marginTop: 80 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            创建题库
          </Button>
        </Empty>
      ) : (
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
    </div>
  );
}
