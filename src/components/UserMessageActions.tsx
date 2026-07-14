import { useEffect, useState } from 'react';
import { Badge, Button, Empty, Input, List, Modal, Popconfirm, Select, Space, Tag, Typography, message } from 'antd';
import { BellOutlined, CheckCircleOutlined, DeleteOutlined, MessageOutlined, SendOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import {
  canDeleteOwnFeedback,
  createFeedback,
  deleteOwnFeedback,
  fetchAnnouncements,
  fetchMyFeedback,
  getAnnouncementStatus,
  markAnnouncementRead,
  validateFeedbackDraft,
  type Announcement,
  type FeedbackDraft,
  type FeedbackTicket,
} from '../lib/messageCenter';

const { Text } = Typography;
const { TextArea } = Input;

const levelColor: Record<string, string> = {
  info: 'blue',
  success: 'green',
  warning: 'orange',
  critical: 'red',
};

const feedbackCategoryOptions = [
  { value: 'bug', label: '问题反馈' },
  { value: 'suggestion', label: '功能建议' },
  { value: 'content', label: '题库内容' },
  { value: 'account', label: '账号权限' },
  { value: 'other', label: '其他' },
];

const statusText: Record<string, string> = {
  open: '待回复',
  replied: '已回复',
  closed: '已关闭',
};

const statusColor: Record<string, string> = {
  open: 'orange',
  replied: 'green',
  closed: 'default',
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

export default function UserMessageActions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [feedback, setFeedback] = useState<FeedbackTicket[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [deletingFeedbackId, setDeletingFeedbackId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState<FeedbackDraft>({ category: 'bug', title: '', content: '' });

  const unreadCount = announcements.filter(item => !item.read_at).length;

  const updateModalParam = (modal: 'announcements' | 'feedback' | null) => {
    const next = new URLSearchParams(searchParams);
    if (modal) next.set('modal', modal);
    else if (['announcements', 'feedback'].includes(next.get('modal') || '')) next.delete('modal');
    setSearchParams(next, { replace: !modal });
  };

  const loadAnnouncements = async () => {
    setLoadingAnnouncements(true);
    try {
      setAnnouncements(await fetchAnnouncements());
    } catch (err) {
      message.error(err instanceof Error ? err.message : '获取公告失败');
    } finally {
      setLoadingAnnouncements(false);
    }
  };

  const loadFeedback = async () => {
    setLoadingFeedback(true);
    try {
      setFeedback(await fetchMyFeedback());
    } catch (err) {
      message.error(err instanceof Error ? err.message : '获取反馈失败');
    } finally {
      setLoadingFeedback(false);
    }
  };

  const openAnnouncements = () => {
    setAnnouncementOpen(true);
    setFeedbackOpen(false);
    updateModalParam('announcements');
    loadAnnouncements();
  };

  const openFeedback = () => {
    setFeedbackOpen(true);
    setAnnouncementOpen(false);
    updateModalParam('feedback');
    loadFeedback();
  };

  const closeModals = () => {
    setAnnouncementOpen(false);
    setFeedbackOpen(false);
    updateModalParam(null);
  };

  useEffect(() => {
    const modal = searchParams.get('modal');
    if (modal === 'announcements' && !announcementOpen) {
      setAnnouncementOpen(true);
      setFeedbackOpen(false);
      loadAnnouncements();
    } else if (modal === 'feedback' && !feedbackOpen) {
      setFeedbackOpen(true);
      setAnnouncementOpen(false);
      loadFeedback();
    } else if (!modal || !['announcements', 'feedback'].includes(modal)) {
      setAnnouncementOpen(false);
      setFeedbackOpen(false);
    }
  }, [searchParams]);

  const handleRead = async (id: string) => {
    try {
      await markAnnouncementRead(id);
      setAnnouncements(prev => prev.map(item => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '标记已读失败');
    }
  };

  const handleSubmit = async () => {
    const errors = validateFeedbackDraft(draft);
    if (Object.keys(errors).length > 0) {
      message.warning(Object.values(errors)[0]);
      return;
    }

    setSubmitting(true);
    try {
      const item = await createFeedback(draft);
      setFeedback(prev => [item, ...prev]);
      setDraft({ category: 'bug', title: '', content: '' });
      message.success('反馈已提交');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '提交反馈失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    setDeletingFeedbackId(id);
    try {
      await deleteOwnFeedback(id);
      setFeedback(prev => prev.filter(item => item.id !== id));
      message.success('反馈已删除');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除反馈失败');
    } finally {
      setDeletingFeedbackId(null);
    }
  };

  return (
    <>
      <div className="profile-message-actions">
        <Badge className="profile-message-badge" count={unreadCount} size="small" offset={[-8, 4]}>
          <Button className="profile-action-button" block icon={<BellOutlined />} onClick={openAnnouncements}>
            站内公告
          </Button>
        </Badge>
        <Button className="profile-action-button" block icon={<MessageOutlined />} onClick={openFeedback}>
          意见反馈
        </Button>
      </div>

      <Modal
        className="message-center-modal"
        title={<span><BellOutlined style={{ marginRight: 8 }} />站内公告</span>}
        open={announcementOpen}
        onCancel={closeModals}
        footer={<Button onClick={closeModals}>关闭</Button>}
        width={640}
      >
        <List
          loading={loadingAnnouncements}
          dataSource={announcements}
          locale={{ emptyText: <Empty description="暂无公告" /> }}
          renderItem={(item) => {
            const status = getAnnouncementStatus(item);
            return (
              <List.Item
                actions={!item.read_at ? [<Button key="read" size="small" icon={<CheckCircleOutlined />} onClick={() => handleRead(item.id)}>已读</Button>] : []}
              >
                <List.Item.Meta
                  title={
                    <Space wrap>
                      <Text strong>{item.title}</Text>
                      <Tag color={levelColor[item.level] || 'blue'}>{item.level}</Tag>
                      {item.is_pinned && <Tag color="purple">置顶</Tag>}
                      {!item.read_at && <Tag color="gold">未读</Tag>}
                      <Tag>{status === 'active' ? '生效中' : status}</Tag>
                    </Space>
                  }
                  description={
                    <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                      <Text>{item.content}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>发布：{formatDate(item.published_at || item.created_at)}</Text>
                    </Space>
                  }
                />
              </List.Item>
            );
          }}
        />
      </Modal>

      <Modal
        className="message-center-modal"
        title={<span><MessageOutlined style={{ marginRight: 8 }} />意见反馈</span>}
        open={feedbackOpen}
        onCancel={closeModals}
        footer={<Button onClick={closeModals}>关闭</Button>}
        width={680}
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div className="feedback-compose-panel">
            <Space orientation="vertical" size={8} style={{ width: '100%' }}>
              <Select value={draft.category} options={feedbackCategoryOptions} onChange={(category) => setDraft(prev => ({ ...prev, category }))} />
              <Input value={draft.title} placeholder="反馈标题" maxLength={60} onChange={(event) => setDraft(prev => ({ ...prev, title: event.target.value }))} />
              <TextArea value={draft.content} placeholder="描述你遇到的问题或建议" maxLength={800} showCount rows={4} onChange={(event) => setDraft(prev => ({ ...prev, content: event.target.value }))} />
              <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>提交反馈</Button>
            </Space>
          </div>

          <List
            loading={loadingFeedback}
            dataSource={feedback}
            locale={{ emptyText: <Empty description="暂无反馈记录" /> }}
            renderItem={(item) => (
              <List.Item
                actions={canDeleteOwnFeedback(item) ? [
                  <Popconfirm
                    key="delete"
                    title="删除这条反馈？"
                    description="删除后无法恢复。"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => handleDeleteFeedback(item.id)}
                  >
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      loading={deletingFeedbackId === item.id}
                      aria-label="删除反馈"
                      title="删除反馈"
                    />
                  </Popconfirm>,
                ] : []}
              >
                <List.Item.Meta
                  title={
                    <Space wrap>
                      <Text strong>{item.title}</Text>
                      <Tag>{feedbackCategoryOptions.find(option => option.value === item.category)?.label || item.category}</Tag>
                      <Tag color={statusColor[item.status]}>{statusText[item.status] || item.status}</Tag>
                    </Space>
                  }
                  description={
                    <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                      <Text>{item.content}</Text>
                      {item.admin_reply && (
                        <div className="feedback-reply-box">
                          <Text strong>管理员回复</Text>
                          <Text>{item.admin_reply}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(item.replied_at)}</Text>
                        </div>
                      )}
                      <Text type="secondary" style={{ fontSize: 12 }}>提交：{formatDate(item.created_at)}</Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </Space>
      </Modal>
    </>
  );
}
