import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Button, Modal, Typography, Statistic, Empty, Tooltip, message, Tag, List, Skeleton, Space } from 'antd';
import { ImportOutlined, RightCircleOutlined, DeleteOutlined, InfoCircleOutlined, BookOutlined, QuestionCircleOutlined, TrophyOutlined, CloudOutlined } from '@ant-design/icons';
import { db, type QuestionBank } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import ImportModal from '../components/ImportModal';
import { useAuth } from '../contexts/AuthContext';
import { APP_VERSION, CHANGELOG } from '../utils/changelog';

const { Title, Text } = Typography;

interface CloudBank {
  id: string;
  name: string;
  description: string;
  question_count: number;
  created_at: string;
  created_by: string;
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [importBankId, setImportBankId] = useState<number | undefined>(undefined);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const [cloudBanks, setCloudBanks] = useState<CloudBank[]>([]);

  const banks = useLiveQuery(() => db.banks.toArray());

  // 本地列表中排除云端缓存的（description 以 ☁️ 开头）
  const localBanks = useMemo(() =>
    (banks || []).filter(b => !b.description?.startsWith('☁️')),
    [banks],
  );

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

  // 从 Supabase 拉取可见的云端题库
  useEffect(() => {
    if (!user) {
      setCloudBanks([]);
      return;
    }
    import('../lib/uploadService').then(({ fetchVisibleBanks }) => {
      fetchVisibleBanks(user.id).then(setCloudBanks).catch(() => {
        // 离线时 Supabase 拉取失败，不置空而是保留上次数据
      });
    });
  }, [user]);

  // 离线时从 Dexie 加载缓存的云题库
  const cachedCloudBanks: QuestionBank[] = useMemo(() =>
    (banks || []).filter(b => b.description?.startsWith('☁️ ')),
    [banks],
  );

  // 检查上传权限
  const handleOpenImportModal = (bankId?: number) => {
    if (!user) {
      message.warning('请先登录后再导入题目');
      return;
    }
    if (bankId !== undefined) {
      setImportBankId(bankId);
      setImportModalOpen(true);
    } else {
      setImportBankId(undefined);
      // 触发全局导入：在 ImportModal 中选择题库
      setImportModalOpen(true);
    }
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

  const handleCloudBankPractice = (bank: CloudBank) => {
    navigate(`/practice/${bank.id}`, { state: { type: 'all', isCloud: true } });
  };

  const handleCloudBankDetail = (bank: CloudBank) => {
    navigate(`/bank/${bank.id}`);
  };

  return (
    <div style={{ padding: 24 }}>
      {/* 迁移横幅已移除 — 新用户无遗留本地题库 */}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>我的题库</Title>
        <Space>
          <Button type="primary" icon={<ImportOutlined />} size="large" onClick={() => handleOpenImportModal()}>
            上传题库
          </Button>
        </Space>
      </div>

      {/* Loading state */}
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
      ) : (!banks || banks.length === 0) && cloudBanks.length === 0 ? (
        <div style={{ marginTop: 80, textAlign: 'center' }}>
          <Empty
            image={<BookOutlined style={{ fontSize: 64, color: '#1677ff40' }} />}
            description={
              <div>
                <Text strong style={{ fontSize: 16 }}>刷题 App</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 14 }}>支持单选题 / 多选题 / 填空题 / 判断题 / 简答题</Text>
                <br />
                <Text type="secondary">离线可用</Text>
              </div>
            }
            style={{ marginBottom: 24 }}
          >
            <Button type="primary" icon={<ImportOutlined />} onClick={() => setImportModalOpen(true)}>
              上传第一个题库
            </Button>
          </Empty>
        </div>
      ) : (
        <>
        {/* 首页统计 */}
        {(localBanks.length > 0) || cloudBanks.length > 0 ? (
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={8}>
              <Card size="small">
                <Statistic title="题库数" value={localBanks.length + cloudBanks.length} prefix={<BookOutlined />} valueStyle={{ fontSize: 20, color: '#1677ff' }} />
              </Card>
            </Col>
            <Col xs={8}>
              <Card size="small">
                <Statistic title="本地题数" value={totalQuestions} prefix={<QuestionCircleOutlined />} valueStyle={{ fontSize: 20, color: '#52c41a' }} />
              </Card>
            </Col>
            <Col xs={8}>
              <Card size="small">
                <Statistic title="练习次数" value={totalPracticeCount} prefix={<TrophyOutlined />} valueStyle={{ fontSize: 20, color: '#faad14' }} />
              </Card>
            </Col>
          </Row>
        ) : null}

        <Row gutter={[16, 16]}>
          {/* 本地题库 */}
          {localBanks.map((bank: QuestionBank) => {
            const count = questionCounts?.[bank.id!] || 0;
            return (
              <Col key={`local-${bank.id}`} xs={24} sm={12} md={8} lg={6}>
                <Card
                  hoverable
                  actions={[
                    <Tooltip title="导入题目" key="import">
                      <ImportOutlined onClick={(e) => { e.stopPropagation(); handleOpenImportModal(bank.id); }} />
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
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ flex: 1, textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 2, lineHeight: '18px' }}>题目数</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: '#1677ff', lineHeight: '28px' }}>{count}</div>
                          </div>
                          <div style={{ flex: 1, textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 2, lineHeight: '18px' }}>上次练习</div>
                            <div style={{ fontSize: 14, fontWeight: 500, lineHeight: '28px' }}>{formatDate(bank.lastPracticed)}</div>
                          </div>
                        </div>
                      </>
                    }
                  />
                </Card>
              </Col>
            );
          })}

          {/* 云端题库 */}
          {cloudBanks.map((bank: CloudBank) => (
            <Col key={`cloud-${bank.id}`} xs={24} sm={12} md={8} lg={6}>
              <Card
                hoverable
                style={{ borderColor: '#69b1ff', borderWidth: 2 }}
                actions={[
                  <Tooltip title="缓存到本地" key="cache">
                    <CloudOutlined onClick={(e) => {
                      e.stopPropagation();
                      handleCacheCloudBank(bank);
                    }} />
                  </Tooltip>,
                  <Tooltip title="开始刷题" key="practice">
                    <RightCircleOutlined onClick={(e) => { e.stopPropagation(); handleCloudBankPractice(bank); }} />
                  </Tooltip>,
                ]}
                onClick={() => handleCloudBankDetail(bank)}
              >
                <Card.Meta
                  title={
                    <Space>
                      <Tag color="blue" style={{ marginRight: 4, lineHeight: '18px', fontSize: 11 }}>☁️</Tag>
                      <Text strong ellipsis>{bank.name}</Text>
                    </Space>
                  }
                  description={
                    <>
                      <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                        {bank.description || '云端题库'}
                      </Text>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 2, lineHeight: '18px' }}>题目数</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: '#1677ff', lineHeight: '28px' }}>{bank.question_count}</div>
                        </div>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 2, lineHeight: '18px' }}>云端</div>
                          <div style={{ fontSize: 14, fontWeight: 500, lineHeight: '28px' }}>
                            {new Date(bank.created_at).toLocaleDateString('zh-CN')}
                          </div>
                        </div>
                      </div>
                    </>
                  }
                />
              </Card>
            </Col>
          ))}

          {/* 离线缓存的云题库（云端不可用时展示） */}
          {cloudBanks.length === 0 && cachedCloudBanks.length > 0 && (
            <>
              <Col span={24}>
                <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8, marginTop: 8 }}>
                  📡 离线缓存（点击刷题将使用本地数据）
                </Text>
              </Col>
              {cachedCloudBanks.map((bank: QuestionBank) => {
                const count = questionCounts?.[bank.id!] || 0;
                const cloudUuid = bank.description?.replace('☁️ ', '') || '';
                return (
                  <Col key={`cached-${bank.id}`} xs={24} sm={12} md={8} lg={6}>
                    <Card
                      hoverable
                      style={{ borderColor: '#95de64', borderWidth: 2 }}
                      actions={[
                        <Tooltip title="开始刷题" key="practice">
                          <RightCircleOutlined onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/practice/${cloudUuid}`, { state: { isCloud: true } });
                          }} />
                        </Tooltip>,
                      ]}
                      onClick={() => navigate(`/bank/${cloudUuid}`)}
                    >
                      <Card.Meta
                        title={
                          <Space>
                            <Tag color="green" style={{ marginRight: 4, lineHeight: '18px', fontSize: 11 }}>📡</Tag>
                            <Text strong ellipsis>{bank.name}</Text>
                          </Space>
                        }
                        description={
                          <>
                            <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                              离线可刷
                            </Text>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <div style={{ flex: 1, textAlign: 'center' }}>
                                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 2, lineHeight: '18px' }}>题目数</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: '#52c41a', lineHeight: '28px' }}>{count}</div>
                              </div>
                            </div>
                          </>
                        }
                      />
                    </Card>
                  </Col>
                );
              })}
            </>
          )}
        </Row>
        </>
      )}

      {/* Import Modal */}
      <ImportModal
        open={importModalOpen || importBankId !== undefined}
        bankId={importBankId}
        onClose={() => { setImportModalOpen(false); setImportBankId(undefined); }}
      />

      {/* 版本号 & 帮助 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '24px 0 8px', opacity: 0.5 }}>
        <Text
          type="secondary"
          style={{ fontSize: 12, cursor: 'pointer' }}
          onClick={() => setChangelogOpen(true)}
        >
          v{APP_VERSION}
        </Text>
        <Text
          type="secondary"
          style={{ fontSize: 12, cursor: 'pointer' }}
          onClick={() => setHelpOpen(true)}
        >
          使用帮助
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

      <Modal
        title={<span><QuestionCircleOutlined style={{ marginRight: 8 }} />使用帮助</span>}
        open={helpOpen}
        onCancel={() => setHelpOpen(false)}
        footer={<Button onClick={() => setHelpOpen(false)}>关闭</Button>}
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <Tag color="blue" style={{ marginBottom: 4 }}>1</Tag>
            <Text strong>题库管理</Text>
            <div style={{ marginTop: 4, paddingLeft: 28 }}>
              <Text type="secondary">首页右上角「上传题库」选择文件导入即可，支持 .txt/.json/.csv/.docx/.md 格式。每个卡片显示题目数和上次练习时间。蓝色边框为云端共享题库。</Text>
            </div>
          </div>
          <div>
            <Tag color="cyan" style={{ marginBottom: 4 }}>2</Tag>
            <Text strong>题库详情</Text>
            <div style={{ marginTop: 4, paddingLeft: 28 }}>
              <Text type="secondary">
                顶部统计区查看各题型数量 + 练习趋势图。
                「开始练习」一键开刷全部题型，齿轮图标⚙选特定题型。
                题目列表可展开查看完整题目与答案、按题型筛选、关键词搜索。
              </Text>
            </div>
          </div>
          <div>
            <Tag color="orange" style={{ marginBottom: 4 }}>3</Tag>
            <Text strong>刷题 &amp; 背题</Text>
            <div style={{ marginTop: 4, paddingLeft: 28 }}>
              <Text type="secondary">
                作答后点「提交答案」自动判对错，正确后 1.5s 自动跳转。
                顶部「📖 背题」切换闪卡模式：显示答案 → 记住了 / 没记住。
                支持左右滑动切换题目。
              </Text>
            </div>
          </div>
          <div>
            <Tag color="gold" style={{ marginBottom: 4 }}>4</Tag>
            <Text strong>云端题库</Text>
            <div style={{ marginTop: 4, paddingLeft: 28 }}>
              <Text type="secondary">上传文件后自动创建题库并同步到云端。点击云端题库的 ☁️ 图标可缓存到本地离线使用。</Text>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// 辅助：缓存云端题库到本地
async function handleCacheCloudBank(bank: CloudBank) {
  try {
    const { syncCloudBankToLocal } = await import('../lib/uploadService');
    const added = await syncCloudBankToLocal(bank.id, bank.name);
    if (added > 0) {
      message.success(`已缓存 ${added} 题到本地`);
    } else {
      message.info('该题库已缓存到本地');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '缓存失败';
    message.error(msg);
  }
}
