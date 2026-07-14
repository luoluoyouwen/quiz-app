import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, Typography, message } from 'antd';
import { BellOutlined, DeleteOutlined, EditOutlined, MessageOutlined, PlusOutlined, ReloadOutlined, RollbackOutlined, SendOutlined } from '@ant-design/icons';
import {
  deleteAdminAnnouncement,
  deleteAdminFeedback,
  fetchAdminAnnouncements,
  fetchAdminFeedback,
  getAnnouncementStatus,
  replyAdminFeedback,
  saveAdminAnnouncement,
  withdrawAdminFeedbackReply,
  type Announcement,
  type AnnouncementDraft,
  type FeedbackStatus,
  type FeedbackTicket,
} from '../lib/messageCenter';

const { Text, Title } = Typography;
const { TextArea } = Input;

const levelOptions = [
  { value: 'info', label: '普通' },
  { value: 'success', label: '成功' },
  { value: 'warning', label: '提醒' },
  { value: 'critical', label: '重要' },
];

const categoryText: Record<string, string> = {
  bug: '问题反馈',
  suggestion: '功能建议',
  content: '题库内容',
  account: '账号权限',
  other: '其他',
};

const statusText: Record<FeedbackStatus, string> = {
  open: '待回复',
  replied: '已回复',
  closed: '已关闭',
};

const statusColor: Record<FeedbackStatus, string> = {
  open: 'orange',
  replied: 'green',
  closed: 'default',
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

const emptyDraft: AnnouncementDraft = {
  title: '',
  content: '',
  level: 'info',
  is_pinned: false,
  is_published: true,
  published_at: '',
  expires_at: '',
};

function AnnouncementAdminPanel() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<AnnouncementDraft>(emptyDraft);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await fetchAdminAnnouncements());
    } catch (err) {
      message.error(err instanceof Error ? err.message : '获取公告失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setDraft({ ...emptyDraft, published_at: new Date().toISOString().slice(0, 16) });
    setModalOpen(true);
  };

  const openEdit = (item: Announcement) => {
    setDraft({
      id: item.id,
      title: item.title,
      content: item.content,
      level: item.level,
      is_pinned: item.is_pinned,
      is_published: Boolean(item.is_published),
      published_at: item.published_at ? item.published_at.slice(0, 16) : '',
      expires_at: item.expires_at ? item.expires_at.slice(0, 16) : '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!draft.title.trim() || !draft.content.trim()) {
      message.warning('请填写标题和内容');
      return;
    }
    setSaving(true);
    try {
      const payload: AnnouncementDraft = {
        ...draft,
        published_at: draft.published_at ? new Date(draft.published_at).toISOString() : null,
        expires_at: draft.expires_at ? new Date(draft.expires_at).toISOString() : null,
      };
      await saveAdminAnnouncement(payload);
      message.success(draft.id ? '公告已更新' : '公告已发布');
      setModalOpen(false);
      load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存公告失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAdminAnnouncement(id);
      message.success('公告已删除');
      load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除公告失败');
    }
  };

  const columns = useMemo(() => [
    {
      title: '公告',
      dataIndex: 'title',
      key: 'title',
      render: (_: string, record: Announcement) => (
        <Space orientation="vertical" size={2}>
          <Space wrap>
            <Text strong>{record.title}</Text>
            {record.is_pinned && <Tag color="purple">置顶</Tag>}
          </Space>
          <Text type="secondary" ellipsis style={{ maxWidth: 420 }}>{record.content}</Text>
        </Space>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 110,
      render: (_: unknown, record: Announcement) => {
        const status = getAnnouncementStatus(record);
        const color = status === 'active' ? 'green' : status === 'draft' ? 'default' : status === 'scheduled' ? 'blue' : 'orange';
        const label = status === 'active' ? '生效中' : status === 'draft' ? '草稿' : status === 'scheduled' ? '定时' : '已过期';
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 90,
      render: (level: string) => <Tag>{levelOptions.find(option => option.value === level)?.label || level}</Tag>,
    },
    {
      title: '发布时间',
      dataIndex: 'published_at',
      key: 'published_at',
      width: 170,
      render: formatDate,
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_: unknown, record: Announcement) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm title="删除这条公告？" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ], []);

  return (
    <>
      <div className="admin-section-header">
        <div>
          <Title level={5} style={{ margin: 0 }}>站内公告</Title>
          <Text type="secondary">发布面向全员的通知，支持置顶、草稿、定时和过期。</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading} size="small">刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建公告</Button>
        </Space>
      </div>
      <Table dataSource={items} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 10, size: 'small', showSizeChanger: false }} scroll={{ x: 'max-content' }} locale={{ emptyText: <Empty description="暂无公告" /> }} />

      <Modal className="admin-form-modal" title={draft.id ? '编辑公告' : '新建公告'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} confirmLoading={saving} okText="保存" cancelText="取消" width={640}>
        <Space orientation="vertical" size="middle" style={{ width: '100%', marginTop: 12 }}>
          <Input value={draft.title} placeholder="公告标题" maxLength={80} onChange={(event) => setDraft(prev => ({ ...prev, title: event.target.value }))} />
          <TextArea value={draft.content} placeholder="公告内容" rows={5} maxLength={1200} showCount onChange={(event) => setDraft(prev => ({ ...prev, content: event.target.value }))} />
          <Space wrap>
            <Select style={{ width: 140 }} value={draft.level} options={levelOptions} onChange={(level) => setDraft(prev => ({ ...prev, level }))} />
            <Space><Text>发布</Text><Switch checked={draft.is_published} onChange={(is_published) => setDraft(prev => ({ ...prev, is_published }))} /></Space>
            <Space><Text>置顶</Text><Switch checked={draft.is_pinned} onChange={(is_pinned) => setDraft(prev => ({ ...prev, is_pinned }))} /></Space>
          </Space>
          <Space wrap>
            <label className="admin-inline-field"><Text type="secondary">发布时间</Text><Input type="datetime-local" value={draft.published_at || ''} onChange={(event) => setDraft(prev => ({ ...prev, published_at: event.target.value }))} /></label>
            <label className="admin-inline-field"><Text type="secondary">过期时间</Text><Input type="datetime-local" value={draft.expires_at || ''} onChange={(event) => setDraft(prev => ({ ...prev, expires_at: event.target.value }))} /></label>
          </Space>
        </Space>
      </Modal>
    </>
  );
}

function FeedbackAdminPanel() {
  const [items, setItems] = useState<FeedbackTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [replying, setReplying] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [active, setActive] = useState<FeedbackTicket | null>(null);
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState<FeedbackStatus>('replied');

  const load = async () => {
    setLoading(true);
    try {
      setItems(await fetchAdminFeedback());
    } catch (err) {
      message.error(err instanceof Error ? err.message : '获取反馈失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openReply = (item: FeedbackTicket) => {
    setActive(item);
    setReply(item.admin_reply || '');
    setStatus(item.status === 'closed' ? 'closed' : 'replied');
  };

  const handleReply = async () => {
    if (!active) return;
    if (!reply.trim() && status !== 'closed') {
      message.warning('请输入回复内容');
      return;
    }
    setReplying(true);
    try {
      await replyAdminFeedback(active.id, reply, status);
      message.success('反馈已处理');
      setActive(null);
      load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '回复失败');
    } finally {
      setReplying(false);
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteAdminFeedback(id);
      setItems(prev => prev.filter(item => item.id !== id));
      if (active?.id === id) setActive(null);
      message.success('反馈已删除');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除反馈失败');
    } finally {
      setDeletingId(null);
    }
  };

  const handleWithdrawReply = async () => {
    if (!active) return;
    setWithdrawing(true);
    try {
      const updated = await withdrawAdminFeedbackReply(active.id);
      setItems(prev => prev.map(item => item.id === updated.id ? { ...item, ...updated } : item));
      setActive(null);
      message.success('回复已撤回');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '撤回回复失败');
    } finally {
      setWithdrawing(false);
    }
  };

  const columns = [
    {
      title: '用户',
      dataIndex: 'user_email',
      key: 'user_email',
      width: 130,
      render: (email: string) => <Text>{email?.replace('@local.app', '') || 'unknown'}</Text>,
    },
    {
      title: '反馈',
      key: 'feedback',
      render: (_: unknown, record: FeedbackTicket) => (
        <Space orientation="vertical" size={2}>
          <Space wrap><Text strong>{record.title}</Text><Tag>{categoryText[record.category] || record.category}</Tag></Space>
          <Text type="secondary" ellipsis style={{ maxWidth: 460 }}>{record.content}</Text>
          {record.admin_reply && <Text type="success" ellipsis style={{ maxWidth: 460 }}>回复：{record.admin_reply}</Text>}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (value: FeedbackStatus) => <Tag color={statusColor[value]}>{statusText[value]}</Tag>,
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: formatDate,
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_: unknown, record: FeedbackTicket) => (
        <Space>
          <Button size="small" icon={<SendOutlined />} onClick={() => openReply(record)}>回复</Button>
          <Popconfirm
            title="删除这条反馈？"
            description="删除后无法恢复。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDeleteFeedback(record.id)}
          >
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              loading={deletingId === record.id}
              aria-label="删除反馈"
              title="删除反馈"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div className="admin-section-header">
        <div>
          <Title level={5} style={{ margin: 0 }}>用户反馈</Title>
          <Text type="secondary">按账号查看反馈并回复，用户可在个人中心看到回复。</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading} size="small">刷新</Button>
      </div>
      <Table dataSource={items} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 12, size: 'small', showSizeChanger: false }} scroll={{ x: 'max-content' }} locale={{ emptyText: <Empty description="暂无反馈" /> }} />

      <Modal
        className="admin-form-modal"
        title={active ? '回复反馈 - ' + active.title : '回复反馈'}
        open={Boolean(active)}
        onCancel={() => setActive(null)}
        width={640}
        footer={(
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              {active?.admin_reply && (
                <Popconfirm
                  title="撤回这条回复？"
                  description="反馈将恢复为待回复状态。"
                  okText="撤回"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={handleWithdrawReply}
                >
                  <Button danger icon={<RollbackOutlined />} loading={withdrawing}>撤回回复</Button>
                </Popconfirm>
              )}
            </div>
            <Space>
              <Button onClick={() => setActive(null)}>取消</Button>
              <Button type="primary" icon={<SendOutlined />} loading={replying} onClick={handleReply}>保存回复</Button>
            </Space>
          </div>
        )}
      >
        {active && (
          <Space orientation="vertical" size="middle" style={{ width: '100%', marginTop: 12 }}>
            <div className="feedback-admin-original">
              <Text type="secondary">{active.user_email?.replace('@local.app', '')} · {categoryText[active.category] || active.category} · {formatDate(active.created_at)}</Text>
              <Text>{active.content}</Text>
            </div>
            <Select value={status} onChange={setStatus} options={[{ value: 'replied', label: '已回复' }, { value: 'closed', label: '已关闭' }, { value: 'open', label: '待回复' }]} />
            <TextArea value={reply} rows={5} maxLength={1000} showCount placeholder="输入给该账号的回复" onChange={(event) => setReply(event.target.value)} />
          </Space>
        )}
      </Modal>
    </>
  );
}

export default function MessageCenterAdmin() {
  return (
    <Tabs
      className="admin-message-tabs"
      items={[
        { key: 'announcements', label: <span><BellOutlined /> 公告发布</span>, children: <AnnouncementAdminPanel /> },
        { key: 'feedback', label: <span><MessageOutlined /> 反馈处理</span>, children: <FeedbackAdminPanel /> },
      ]}
    />
  );
}
