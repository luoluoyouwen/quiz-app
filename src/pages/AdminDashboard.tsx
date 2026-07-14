import { useState, useEffect, useCallback, useMemo, Component, type ReactNode, type ErrorInfo } from 'react';
import { Card, Row, Col, Select, Statistic, Table, Button, Tag, Space, Tabs, Typography, message, Modal, Input, Popconfirm, Badge, Tooltip, Result } from 'antd';
import {
  TeamOutlined,
  DatabaseOutlined,
  QuestionCircleOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  UserSwitchOutlined,
  KeyOutlined,
  ExclamationCircleOutlined,
  BarChartOutlined,
  FileTextOutlined,
  DownloadOutlined,
  EyeOutlined,
  HddOutlined,
  EditOutlined,
  NotificationOutlined,
} from '@ant-design/icons';
import { supabase } from '../lib/supabase';
import { debug } from "../utils/debug";
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import MessageCenterAdmin from '../components/MessageCenterAdmin';

const { Text, Title } = Typography;

// ─── Helpers ──────────────────────────────────────────────────────

/** Supabase NUMERIC 类型通过 REST API 返回时是字符串，安全转为 number */
function toNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
  return fallback;
}

/** 安全格式化百分比（0-100），Supabase RPC 已返回百分比值 */
function fmtPct(v: unknown): string {
  return toNum(v).toFixed(1);
}

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('请先登录');

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string; detail?: string } | null;
    throw new Error(payload?.error || payload?.detail || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// ─── Tab Error Boundary ───────────────────────────────────────────

interface TabErrorBoundaryState { hasError: boolean; error: Error | null; }

class TabErrorBoundary extends Component<{ children: ReactNode }, TabErrorBoundaryState> {
  state: TabErrorBoundaryState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    debug.error('[TabErrorBoundary] Tab render error:', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title="此模块加载失败"
          subTitle={this.state.error?.message || '未知错误'}
          extra={<Button type="primary" onClick={() => this.setState({ hasError: false, error: null })}>重试</Button>}
        />
      );
    }
    return this.props.children;
  }
}

// ─── Types ────────────────────────────────────────────────────────

interface BankWithCreator {
  id: string;
  name: string;
  description: string;
  question_count: number;
  review_status: string;
  created_by: string;
  created_at: string;
  creator_email?: string;
}

interface UserProfile {
  id: string;
  email: string;
  role: 'user' | 'admin';
  created_at: string;
}

interface DashboardStats {
  total_answers: number;
  avg_accuracy: number;
  active_7d: number;
  active_30d: number;
  storage_size_mb: number;
}

interface UserActivity {
  user_email: string;
  answer_count: number;
  correct_count: number;
  accuracy: number;
}

interface WrongQuestionStat {
  question_id: string;
  question_title: string;
  wrong_count: number;
  total_attempts: number;
  wrong_rate: number;
}

interface AuditLog {
  id: string;
  action: string;
  actor_email: string;
  target_type: string;
  target_id: string;
  details: string;
  created_at: string;
}

// ─── Overview Tab ─────────────────────────────────────────────────

function OverviewTab({ onNavigate }: { onNavigate?: (key: string) => void }) {
  const [stats, setStats] = useState({ users: 0, banks: 0, questions: 0, pending: 0, storageSize: 0 });
  const [pageViews, setPageViews] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const [{ users }, { banks }, storageResult, viewsResult] = await Promise.all([
        adminRequest<{ users: UserProfile[] }>('/api/admin/users'),
        adminRequest<{ banks: BankWithCreator[] }>('/api/admin/banks'),
        supabase.rpc('admin_get_dashboard_stats'),
        supabase.rpc('admin_get_page_views', { days: 1 }),
      ]);
      const questionCount = banks.reduce((sum, bank) => sum + toNum(bank.question_count), 0);
      const storageData = Array.isArray(storageResult.data)
        ? storageResult.data[0] as DashboardStats | undefined
        : undefined;
      const viewsData = Array.isArray(viewsResult.data)
        ? viewsResult.data[0] as { total_views?: number } | undefined
        : undefined;
      const storageSize = storageData?.storage_size_mb
        ?? Math.round((questionCount * 0.5 + banks.length * 0.2) * 100) / 100;
      setPageViews(viewsData?.total_views ?? null);

      setStats({
        users: users.length,
        banks: banks.length,
        questions: questionCount,
        pending: banks.filter((bank) => bank.review_status === 'pending').length,
        storageSize,
      });
    } catch (err) {
      debug.error('Failed to fetch stats:', err);
      message.error('获取统计数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return (
    <>
      <div className="admin-section-header">
        <Title level={5} style={{ margin: 0 }}>系统概览</Title>
        <Button icon={<ReloadOutlined />} onClick={fetchStats} loading={loading} size="small">刷新</Button>
      </div>
      <Row className="admin-stat-grid" gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card loading={loading} hoverable onClick={() => onNavigate?.('users')} style={{ cursor: 'pointer' }} styles={{ body: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 } }}>
            <Statistic
              title="总用户数"
              value={stats.users}
              prefix={<TeamOutlined style={{ color: 'var(--app-primary)' }} />}
              valueStyle={{ color: 'var(--app-primary)' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={loading} hoverable onClick={() => onNavigate?.('review')} style={{ cursor: 'pointer' }} styles={{ body: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 } }}>
            <Statistic
              title="题库总数"
              value={stats.banks}
              prefix={<DatabaseOutlined style={{ color: 'var(--app-success)' }} />}
              valueStyle={{ color: 'var(--app-success)' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={loading} hoverable styles={{ body: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 } }}>
            <Statistic
              title="题目总数"
              value={stats.questions}
              prefix={<QuestionCircleOutlined style={{ color: 'var(--app-primary-hover)' }} />}
              valueStyle={{ color: 'var(--app-primary-hover)' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={loading} hoverable onClick={() => onNavigate?.('review')} style={{ cursor: 'pointer' }} styles={{ body: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 } }}>
            <Badge count={stats.pending} size="small" offset={[6, -4]}>
              <Statistic
                title="待审核题库"
                value={stats.pending}
                prefix={<ClockCircleOutlined style={{ color: 'var(--app-review)' }} />}
                valueStyle={{ color: stats.pending > 0 ? 'var(--app-review)' : undefined }}
              />
            </Badge>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={loading} styles={{ body: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 } }}>
            <Statistic
              title="存储大小"
              value={stats.storageSize}
              suffix="MB"
              precision={2}
              prefix={<HddOutlined style={{ color: 'var(--app-primary-hover)' }} />}
              valueStyle={{ color: 'var(--app-primary-hover)' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={loading} styles={{ body: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 } }}>
            <Statistic
              title="今日访问量"
              value={pageViews ?? '-'}
              prefix={<EyeOutlined style={{ color: '#eb2f96' }} />}
              valueStyle={{ color: '#eb2f96' }}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}

// ─── Bank Review Tab ──────────────────────────────────────────────

function BankReviewTab() {
  const [pendingBanks, setPendingBanks] = useState<BankWithCreator[]>([]);
  const [reviewedBanks, setReviewedBanks] = useState<BankWithCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  // Rename state
  const [renameModal, setRenameModal] = useState<{ open: boolean; bankId: string; name: string }>({ open: false, bankId: '', name: '' });
  const [renaming, setRenaming] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const openRenameModal = (record: BankWithCreator) => {
    setRenameModal({ open: true, bankId: record.id, name: record.name });
    const next = new URLSearchParams(searchParams);
    next.set('modal', 'rename-bank');
    setSearchParams(next);
  };

  const closeRenameModal = () => {
    setRenameModal({ open: false, bankId: '', name: '' });
    if (searchParams.get('modal') === 'rename-bank') {
      const next = new URLSearchParams(searchParams);
      next.delete('modal');
      setSearchParams(next, { replace: true });
    }
  };

  useEffect(() => {
    if (searchParams.get('modal') !== 'rename-bank' && renameModal.open) {
      closeRenameModal();
    }
  }, [searchParams, renameModal.open]);

  const fetchBanks = useCallback(async () => {
    setLoading(true);
    try {
      const { banks: adminBanks } = await adminRequest<{ banks: BankWithCreator[] }>('/api/admin/banks');
      setPendingBanks(adminBanks.filter(b => b.review_status === 'pending'));
      setReviewedBanks(adminBanks.filter(b => b.review_status !== 'pending'));
    } catch (err) {
      debug.error('Failed to fetch banks:', err);
      message.error('获取题库列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBanks(); }, [fetchBanks]);

  const updateStatus = async (bankId: string, status: 'approved' | 'rejected') => {
    const label = status === 'approved' ? '批准' : '驳回';
    try {
      await adminRequest<{ ok: boolean }>('/api/admin/banks', {
        method: 'PATCH',
        body: JSON.stringify({ bankId, review_status: status }),
      });
      message.success(`题库已${label}`);
      fetchBanks();
    } catch (err) {
      debug.error(`Failed to ${status} bank:`, err);
      message.error(`${label}失败`);
    }
  };

  const handleDeleteBank = async (bankId: string, bankName: string) => {
    try {
      await adminRequest<{ ok: boolean }>(`/api/admin/banks?bankId=${encodeURIComponent(bankId)}`, {
        method: 'DELETE',
      });
      message.success(`题库「${bankName}」已删除`);
      fetchBanks();
    } catch (err: any) {
      debug.error('Failed to delete bank:', err);
      message.error(`删除失败: ${err?.message || '未知错误'}`);
    }
  };

  const handleRenameBank = async () => {
    if (!renameModal.name.trim()) { message.warning('请输入题库名称'); return; }
    setRenaming(true);
    try {
      await adminRequest<{ ok: boolean }>('/api/admin/banks', {
        method: 'PATCH',
        body: JSON.stringify({ bankId: renameModal.bankId, name: renameModal.name.trim() }),
      });
      message.success('题库名称已更新');
      closeRenameModal();
      fetchBanks();
    } catch (err) {
      debug.error('Failed to rename bank:', err);
      message.error('改名失败');
    } finally {
      setRenaming(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase
        .from('question_banks')
        .select('*, questions(*)');

      if (error) throw error;

      if (!data || data.length === 0) {
        message.info('暂无数据可导出');
        return;
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `question_banks_export_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      message.success(`成功导出 ${data.length} 个题库`);
    } catch (err) {
      debug.error('Failed to export:', err);
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  const pendingColumns = useMemo(() => [
    {
      title: '题库名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string, record: BankWithCreator) => (
        <Tooltip title={record.description || name}>
          <Text strong>{name}</Text>
        </Tooltip>
      ),
    },
    {
      title: '上传人',
      dataIndex: 'creator_email',
      key: 'creator_email',
      width: 180,
      render: (email: string) => {
        const username = email.replace('@local.app', '');
        return <Text>{username}</Text>;
      },
    },
    {
      title: '题目数',
      dataIndex: 'question_count',
      key: 'question_count',
      width: 100,
      align: 'center' as const,
    },
    {
      title: '上传时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: unknown, record: BankWithCreator) => (
        <Space>
          <Popconfirm
            title="批准该题库？批准后全员可见。"
            onConfirm={() => updateStatus(record.id, 'approved')}
            okText="批准"
            cancelText="取消"
          >
            <Button type="primary" size="small" icon={<CheckCircleOutlined />}>
              批准
            </Button>
          </Popconfirm>
          <Popconfirm
            title="驳回该题库？驳回后仅上传人和管理员可见。"
            onConfirm={() => updateStatus(record.id, 'rejected')}
            okText="驳回"
            cancelText="取消"
          >
            <Button danger size="small" icon={<CloseCircleOutlined />}>
              驳回
            </Button>
          </Popconfirm>
          <Popconfirm
            title={`确认删除题库「${record.name}」？题目也将永久删除，不可恢复。`}
            onConfirm={() => handleDeleteBank(record.id, record.name)}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ], [updateStatus, handleDeleteBank]);

  const reviewedColumns = useMemo(() => [
    {
      title: '题库名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: '上传人',
      dataIndex: 'creator_email',
      key: 'creator_email',
      width: 180,
      render: (email: string) => email.replace('@local.app', ''),
    },
    {
      title: '题目数',
      dataIndex: 'question_count',
      key: 'question_count',
      width: 100,
      align: 'center' as const,
    },
    {
      title: '状态',
      dataIndex: 'review_status',
      key: 'review_status',
      width: 120,
      render: (status: string) => (
        <Tag color={status === 'approved' ? 'success' : 'error'}>
          {status === 'approved' ? '已批准' : '已驳回'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: BankWithCreator) => (
        <Space size={0}>
          <Tooltip title="改名">
            <Button type="text" size="small" icon={<EditOutlined />}
              onClick={() => openRenameModal(record)} />
          </Tooltip>
          <Popconfirm
            title={`确认删除题库「${record.name}」？题目也将永久删除，不可恢复。`}
            onConfirm={() => handleDeleteBank(record.id, record.name)}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ], [handleDeleteBank]);

  const tabItems = useMemo(() => [
    {
      key: 'pending',
      label: (
        <span>
          待审核 <Badge count={pendingBanks.length} size="small" style={{ marginLeft: 4 }} />
        </span>
      ),
      children: (
        <Table
          dataSource={pendingBanks}
          columns={pendingColumns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: false, size: 'small' }}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: '暂无待审核题库' }}
        />
      ),
    },
    {
      key: 'reviewed',
      label: '已审核',
      children: (
        <Table
          dataSource={reviewedBanks}
          columns={reviewedColumns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: false, size: 'small' }}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: '暂无已审核题库' }}
        />
      ),
    },
  ], [pendingBanks, reviewedBanks, loading, pendingColumns, reviewedColumns]);

  return (
    <>
      <div className="admin-section-header">
        <div>
          <Title level={5} style={{ margin: 0 }}>题库审核</Title>
          <Text type="secondary">审核用户上传的题库，批准后全员可见，驳回后仅上传人和管理员可见</Text>
        </div>
        <Button icon={<DownloadOutlined />} onClick={handleExport} loading={exporting}>
          导出
        </Button>
      </div>
      <Tabs className="admin-tabs" activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      <Modal
        className="admin-form-modal"
        title="修改题库名称"
        open={renameModal.open}
        onOk={handleRenameBank}
        onCancel={closeRenameModal}
        confirmLoading={renaming}
        okText="保存"
        cancelText="取消"
      >
        <Input
          value={renameModal.name}
          onChange={e => setRenameModal(prev => ({ ...prev, name: e.target.value }))}
          onPressEnter={handleRenameBank}
          placeholder="输入新的题库名称"
          style={{ marginTop: 8 }}
        />
      </Modal>
    </>
  );
}

// ─── User Management Tab ──────────────────────────────────────────

function UserManagementTab() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetPwdModal, setResetPwdModal] = useState<{ open: boolean; userId: string; email: string }>({ open: false, userId: '', email: '' });
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [createUserModal, setCreateUserModal] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({ employeeId: '', password: '', role: 'user' as 'user' | 'admin' });
  const [creatingUser, setCreatingUser] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const openResetModal = (record: UserProfile) => {
    setResetPwdModal({ open: true, userId: record.id, email: record.email });
    const next = new URLSearchParams(searchParams);
    next.set('modal', 'reset-password');
    setSearchParams(next);
  };

  const openCreateUserModal = () => {
    setCreateUserModal(true);
    const next = new URLSearchParams(searchParams);
    next.set('modal', 'create-user');
    setSearchParams(next);
  };

  const closeUserModal = (modal?: 'reset-password' | 'create-user') => {
    if (!modal || modal === 'reset-password') {
      setResetPwdModal({ open: false, userId: '', email: '' });
      setNewPassword('');
    }
    if (!modal || modal === 'create-user') {
      setCreateUserModal(false);
      setCreateUserForm({ employeeId: '', password: '', role: 'user' });
    }
    if (!modal || searchParams.get('modal') === modal) {
      const next = new URLSearchParams(searchParams);
      next.delete('modal');
      setSearchParams(next, { replace: true });
    }
  };

  useEffect(() => {
    const modal = searchParams.get('modal');
    if (modal === 'create-user' && !createUserModal) {
      setCreateUserModal(true);
    }
    if (modal !== 'reset-password' && resetPwdModal.open) {
      setResetPwdModal({ open: false, userId: '', email: '' });
      setNewPassword('');
    }
    if (modal !== 'create-user' && createUserModal) {
      setCreateUserModal(false);
      setCreateUserForm({ employeeId: '', password: '', role: 'user' });
    }
  }, [searchParams, resetPwdModal.open, createUserModal]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { users } = await adminRequest<{ users: UserProfile[] }>('/api/admin/users');
      setUsers(users || []);
    } catch (err) {
      debug.error('Failed to fetch users:', err);
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    const action = newRole === 'admin' ? '提升为管理员' : '取消管理员';

    try {
      await adminRequest<{ ok: boolean }>('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({ userId, role: newRole }),
      });
      message.success(`${action}成功`);
      fetchUsers();
    } catch (err) {
      debug.error(`Failed to toggle role:`, err);
      message.error(`${action}失败`);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    try {
      await adminRequest<{ ok: boolean }>(`/api/admin/users?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
      message.success(`用户「${email.replace('@local.app', '')}」已删除`);
      fetchUsers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      debug.error('Failed to delete user:', err);
      message.error(`删除用户失败：${msg}`);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      message.warning('密码至少 8 位，且需包含字母和数字');
      return;
    }
    if (!resetPwdModal.userId) {
      message.error('未选择用户');
      return;
    }

    setResetting(true);
    try {
      await adminRequest<{ ok: boolean }>('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({ userId: resetPwdModal.userId, new_password: newPassword }),
      });
      message.success('密码重置成功');
      closeUserModal('reset-password');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      debug.error('Failed to reset password:', err);
      message.error(`密码重置失败：${msg}`);
    } finally {
      setResetting(false);
    }
  };

  const handleCreateUser = async () => {
    const { employeeId, password, role } = createUserForm;

    if (!employeeId.trim()) {
      message.warning('请输入工号');
      return;
    }
    if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      message.warning('密码至少 8 位，且需包含字母和数字');
      return;
    }

    setCreatingUser(true);
    try {
      await adminRequest<{ ok: boolean; userId: string }>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ employeeId: employeeId.trim(), password, role }),
      });
      message.success(`用户「${employeeId.trim()}」创建成功`);
      closeUserModal('create-user');
      fetchUsers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      debug.error('Failed to create user:', err);
      message.error(`创建用户失败：${msg}`);
    } finally {
      setCreatingUser(false);
    }
  };

  const columns = useMemo(() => [
    {
      title: '工号',
      dataIndex: 'email',
      key: 'email',
      render: (email: string) => {
        const username = email.replace('@local.app', '');
        return <Text strong>{username}</Text>;
      },
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 120,
      render: (role: string) => (
        <Tag icon={role === 'admin' ? <SafetyCertificateOutlined /> : <TeamOutlined />} color={role === 'admin' ? 'gold' : 'default'}>
          {role === 'admin' ? '管理员' : '普通用户'}
        </Tag>
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 360,
      render: (_: unknown, record: UserProfile) => (
        <Space>
          <Tooltip title={record.role === 'admin' ? '取消管理员权限' : '提升为管理员'}>
            <Popconfirm
              title={`确认${record.role === 'admin' ? '取消该用户的管理员权限' : '将该用户提升为管理员'}？`}
              onConfirm={() => toggleRole(record.id, record.role)}
              okText="确认"
              cancelText="取消"
            >
              <Button
                size="small"
                icon={<UserSwitchOutlined />}
                type={record.role === 'admin' ? 'default' : 'primary'}
              >
                {record.role === 'admin' ? '取消管理员' : '设为管理员'}
              </Button>
            </Popconfirm>
          </Tooltip>
          <Tooltip title="重置该用户密码">
            <Button
              size="small"
              icon={<KeyOutlined />}
              onClick={() => openResetModal(record)}
            >
              重置密码
            </Button>
          </Tooltip>
          <Popconfirm
            title={`确认删除用户「${record.email.replace('@local.app', '')}」？该操作不可恢复！`}
            onConfirm={() => handleDeleteUser(record.id, record.email)}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="删除该用户">
              <Button size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ], [toggleRole, handleDeleteUser]);

  return (
    <>
      <div className="admin-section-header">
        <div>
          <Title level={5} style={{ margin: 0 }}>用户管理</Title>
          <Text type="secondary">
            管理用户角色、密码和帐号。
            <span className="admin-description-clause">密码重置通过数据库 RPC 直接执行。</span>
          </Text>
        </div>
        <Button type="primary" icon={<TeamOutlined />} onClick={openCreateUserModal}>
          创建用户
        </Button>
      </div>

      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: false, size: 'small' }}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: '暂无用户' }}
      />

      <Modal
        className="admin-form-modal"
        title={`重置密码 - ${resetPwdModal.email.replace('@local.app', '')}`}
        open={resetPwdModal.open}
        onOk={handleResetPassword}
        onCancel={() => closeUserModal('reset-password')}
        confirmLoading={resetting}
        okText="确认重置"
        cancelText="取消"
      >
        <div style={{ marginTop: 16 }}>
          <Text>输入新密码（至少 8 位，需包含字母和数字）：</Text>
          <Input.Password
            style={{ marginTop: 8 }}
            placeholder="输入新密码"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            onPressEnter={handleResetPassword}
            autoFocus
          />
          <div style={{ marginTop: 8 }}>
            <Text type="warning">
              <ExclamationCircleOutlined style={{ marginRight: 4 }} />
              重置后用户将无法用旧密码登录。
            </Text>
          </div>
        </div>
      </Modal>

      <Modal
        className="admin-form-modal"
        title="创建用户"
        open={createUserModal}
        onOk={handleCreateUser}
        onCancel={() => closeUserModal('create-user')}
        confirmLoading={creatingUser}
        okText="创建"
        cancelText="取消"
      >
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <Text>工号：</Text>
            <Input
              style={{ marginTop: 4 }}
              placeholder="输入工号"
              value={createUserForm.employeeId}
              onChange={e => setCreateUserForm(prev => ({ ...prev, employeeId: e.target.value }))}
              addonAfter="@local.app"
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <Text>密码（至少 8 位，需包含字母和数字）：</Text>
            <Input.Password
              style={{ marginTop: 4 }}
              placeholder="输入密码"
              value={createUserForm.password}
              onChange={e => setCreateUserForm(prev => ({ ...prev, password: e.target.value }))}
            />
          </div>
          <div>
            <Text>角色：</Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={createUserForm.role}
              onChange={role => setCreateUserForm(prev => ({ ...prev, role }))}
              options={[
                { value: 'user', label: '普通用户' },
                { value: 'admin', label: '管理员' },
              ]}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}

// ─── Stats Tab (刷题统计) ─────────────────────────────────────────

function StatsTab() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activityList, setActivityList] = useState<UserActivity[]>([]);
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestionStat[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Dashboard stats
      try {
        const { data, error: rpcErr } = await supabase.rpc('admin_get_dashboard_stats');
        if (rpcErr) { debug.error('[StatsTab] admin_get_dashboard_stats RPC error:', rpcErr); throw rpcErr; }
        if (data && Array.isArray(data) && data.length > 0) {
          const raw = data[0] as Record<string, unknown>;
          debug.log('[StatsTab] dashboard stats raw:', raw);
          setStats({
            total_answers: toNum(raw.total_answers),
            avg_accuracy: toNum(raw.avg_accuracy),
            active_7d: toNum(raw.active_7d),
            active_30d: toNum(raw.active_30d),
            storage_size_mb: toNum(raw.storage_size_mb),
          });
        }
      } catch (err) {
        debug.warn('[StatsTab] admin_get_dashboard_stats RPC failed:', err);
        setStats({ total_answers: 0, avg_accuracy: 0, active_7d: 0, active_30d: 0, storage_size_mb: 0 });
      }

      // 2. User activity ranking
      try {
        const { data, error: rpcErr2 } = await supabase.rpc('admin_get_user_activity');
        if (rpcErr2) { debug.error('[StatsTab] admin_get_user_activity RPC error:', rpcErr2); throw rpcErr2; }
        if (data && Array.isArray(data)) {
          debug.log('[StatsTab] user activity raw:', data.slice(0, 2));
          setActivityList((data as Array<Record<string, unknown>>).map(row => ({
            user_email: String(row.user_email || ''),
            answer_count: toNum(row.answer_count),
            correct_count: toNum(row.correct_count),
            accuracy: toNum(row.accuracy),
          })) as UserActivity[]);
        }
      } catch (err) {
        debug.warn('[StatsTab] admin_get_user_activity RPC failed:', err);
        setActivityList([]);
      }

      // 3. Wrong question TOP10
      try {
        const { data, error: rpcErr3 } = await supabase.rpc('admin_get_wrong_question_stats');
        if (rpcErr3) { debug.error('[StatsTab] admin_get_wrong_question_stats RPC error:', rpcErr3); throw rpcErr3; }
        if (data && Array.isArray(data)) {
          debug.log('[StatsTab] wrong question stats raw:', data.slice(0, 2));
          setWrongQuestions((data as Array<Record<string, unknown>>).map(row => ({
            question_id: String(row.question_id || ''),
            question_title: String(row.question_title || ''),
            wrong_count: toNum(row.wrong_count),
            total_attempts: toNum(row.total_attempts),
            wrong_rate: toNum(row.wrong_rate),
          })) as WrongQuestionStat[]);
        }
      } catch (err) {
        debug.warn('[StatsTab] admin_get_wrong_question_stats RPC failed:', err);
        setWrongQuestions([]);
      }
    } catch (err) {
      debug.error('Failed to fetch stats:', err);
      message.error('获取统计数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const activityColumns = useMemo(() => [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: unknown, __: unknown, index: number) => <Text strong>{index + 1}</Text>,
    },
    {
      title: '用户',
      dataIndex: 'user_email',
      key: 'user_email',
      render: (email: string) => {
        const username = email?.replace('@local.app', '') || '未知';
        return <Text>{username}</Text>;
      },
    },
    {
      title: '答题数',
      dataIndex: 'answer_count',
      key: 'answer_count',
      width: 100,
      align: 'center' as const,
    },
    {
      title: '正确数',
      dataIndex: 'correct_count',
      key: 'correct_count',
      width: 100,
      align: 'center' as const,
    },
    {
      title: '正确率',
      dataIndex: 'accuracy',
      key: 'accuracy',
      width: 100,
      align: 'center' as const,
      render: (accuracy: unknown) => {
        const num = toNum(accuracy);
        const pct = num.toFixed(1);
        const color = num >= 80 ? 'var(--app-success)' : num >= 50 ? 'var(--app-review)' : 'var(--app-error)';
        return <Text style={{ color, fontWeight: 500 }}>{pct}%</Text>;
      },
    },
  ], []);

  const wrongColumns = useMemo(() => [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: unknown, __: unknown, index: number) => {
        const colors = ['var(--app-error)', 'var(--app-review)', 'var(--app-review)', 'var(--app-primary-hover)', 'var(--app-primary)'];
        return <Text strong style={{ color: colors[index % colors.length] }}>#{index + 1}</Text>;
      },
    },
    {
      title: '题目',
      dataIndex: 'question_title',
      key: 'question_title',
      ellipsis: true,
    },
    {
      title: '错误次数',
      dataIndex: 'wrong_count',
      key: 'wrong_count',
      width: 100,
      align: 'center' as const,
      render: (count: number) => <Text type="danger">{count}</Text>,
    },
    {
      title: '总尝试',
      dataIndex: 'total_attempts',
      key: 'total_attempts',
      width: 100,
      align: 'center' as const,
    },
    {
      title: '错误率',
      dataIndex: 'wrong_rate',
      key: 'wrong_rate',
      width: 100,
      align: 'center' as const,
      render: (rate: unknown) => {
        const num = toNum(rate);
        const pct = num.toFixed(1);
        return <Text style={{ color: num > 50 ? 'var(--app-error)' : 'var(--app-review)', fontWeight: 500 }}>{pct}%</Text>;
      },
    },
  ], []);

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>刷题统计</Title>
        <Text type="secondary">查看全站刷题数据和用户活跃情况</Text>
      </div>

      {/* Statistics Cards */}
      <Row className="admin-stat-grid" gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card loading={loading} styles={{ body: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 } }}>
            <Statistic
              title="总刷题数"
              value={stats?.total_answers ?? '-'}
              prefix={<QuestionCircleOutlined style={{ color: 'var(--app-primary)' }} />}
              valueStyle={{ color: 'var(--app-primary)' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={loading} styles={{ body: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 } }}>
            <Statistic
              title="正确率"
              value={stats?.avg_accuracy != null ? fmtPct(stats.avg_accuracy) : '-'}
              suffix="%"
              prefix={<CheckCircleOutlined style={{ color: 'var(--app-success)' }} />}
              valueStyle={{ color: 'var(--app-success)' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={loading} styles={{ body: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 } }}>
            <Statistic
              title="7日活跃"
              value={stats?.active_7d ?? '-'}
              prefix={<TeamOutlined style={{ color: 'var(--app-primary-hover)' }} />}
              valueStyle={{ color: 'var(--app-primary-hover)' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={loading} styles={{ body: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 } }}>
            <Statistic
              title="30日活跃"
              value={stats?.active_30d ?? '-'}
              prefix={<TeamOutlined style={{ color: 'var(--app-primary-hover)' }} />}
              valueStyle={{ color: 'var(--app-primary-hover)' }}
            />
          </Card>
        </Col>
      </Row>

      {/* User Activity Ranking */}
      <Card
        className="admin-table-card"
        title="用户活跃排行"
        styles={{ body: { padding: 0 } }}
      >
        <Table
          dataSource={activityList}
          columns={activityColumns}
          rowKey={(_, index) => String(index ?? 0)}
          loading={loading}
          pagination={activityList.length > 20 ? { pageSize: 20, size: 'small', showSizeChanger: false } : false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: '暂无活跃数据' }}
          size="small"
        />
      </Card>

      {/* Wrong Question TOP10 */}
      <Card
        className="admin-table-card"
        title="错题排行榜 TOP 10"
        styles={{ body: { padding: 0 } }}
      >
        <Table
          dataSource={wrongQuestions}
          columns={wrongColumns}
          rowKey={(_, index) => String(index ?? 0)}
          loading={loading}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: '暂无错题数据' }}
          size="small"
        />
      </Card>
    </>
  );
}

// ─── Audit Log Tab (操作日志) ─────────────────────────────────────

function AuditLogTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { logs } = await adminRequest<{ logs: AuditLog[] }>('/api/admin/logs');
      setLogs((logs || []).map((log) => ({
        ...log,
        actor_email: log.actor_email || 'system',
        details: typeof log.details === 'string' ? log.details : JSON.stringify(log.details ?? {}),
      })));
    } catch (err) {
      debug.warn('Admin logs API failed, trying RPC fallback:', err);
      try {
        const { data, error } = await supabase.rpc('admin_get_audit_logs');
        if (error) throw error;
        setLogs(((data || []) as AuditLog[]).map((log) => ({
          ...log,
          actor_email: log.actor_email || 'system',
          details: typeof log.details === 'string' ? log.details : JSON.stringify(log.details ?? {}),
        })));
      } catch (fallbackErr) {
        debug.error('Failed to fetch audit logs:', fallbackErr);
        message.error('获取操作日志失败');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const actionColors: Record<string, string> = {
    delete: 'red',
    create: 'green',
    update: 'blue',
    approve: 'cyan',
    reject: 'orange',
    reset_password: 'purple',
    delete_user: 'red',
    login: 'default',
  };

  const columns = useMemo(() => [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date: string) => <Text>{new Date(date).toLocaleString('zh-CN')}</Text>,
    },
    {
      title: '操作人',
      dataIndex: 'actor_email',
      key: 'actor_email',
      width: 140,
      render: (email: string) => {
        const username = email?.replace('@local.app', '') || '系统';
        return <Text>{username}</Text>;
      },
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 120,
      render: (action: string) => (
        <Tag color={actionColors[action] || 'default'}>{action}</Tag>
      ),
    },
    {
      title: '操作对象',
      dataIndex: 'target_type',
      key: 'target_type',
      width: 120,
    },
    {
      title: '详情',
      dataIndex: 'details',
      key: 'details',
      ellipsis: true,
      render: (details: string) => <Text>{details || '-'}</Text>,
    },
  ], []);

  return (
    <>
      <div className="admin-section-header">
        <div>
          <Title level={5} style={{ margin: 0 }}>操作日志</Title>
          <Text type="secondary">查看管理员在后台的所有操作记录</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading} size="small">刷新</Button>
      </div>

      <Table
        dataSource={logs}
        columns={columns}
        rowKey={(record) => record.id || Math.random().toString()}
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条日志`, size: 'small' }}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: '暂无操作日志' }}
      />
    </>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  const wrap = (children: ReactNode, tabKey: string) => <TabErrorBoundary key={tabKey}>{children}</TabErrorBoundary>;

  const tabItems = [
    {
      key: 'overview',
      label: (
        <span>
          <DatabaseOutlined /> 系统概览
        </span>
      ),
      children: wrap(<OverviewTab onNavigate={setActiveTab} />, 'overview'),
    },
    {
      key: 'review',
      label: (
        <span>
          <QuestionCircleOutlined /> 题库审核
        </span>
      ),
      children: wrap(<BankReviewTab />, 'review'),
    },
    {
      key: 'users',
      label: (
        <span>
          <TeamOutlined /> 用户管理
        </span>
      ),
      children: wrap(<UserManagementTab />, 'users'),
    },
    {
      key: 'stats',
      label: (
        <span>
          <BarChartOutlined /> 刷题统计
        </span>
      ),
      children: wrap(<StatsTab />, 'stats'),
    },
    {
      key: 'messages',
      label: (
        <span>
          <NotificationOutlined /> 公告反馈
        </span>
      ),
      children: wrap(<MessageCenterAdmin />, 'messages'),
    },
    {
      key: 'logs',
      label: (
        <span>
          <FileTextOutlined /> 操作日志
        </span>
      ),
      children: wrap(<AuditLogTab />, 'logs'),
    },
  ];

  return (
    <div className="admin-dashboard-page admin-workbench">
      <div className="subpage-hero admin-page-hero">
        <div>
          <Text className="subpage-eyebrow">系统管理</Text>
          <Title className="admin-page-title" level={3}>
            <SafetyCertificateOutlined />
            管理后台
          </Title>
        </div>
        <Text className="subpage-hero-copy">欢迎回来，{profile?.email?.replace('@local.app', '')}</Text>
      </div>

      <Tabs className="admin-tabs" activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
    </div>
  );
}
