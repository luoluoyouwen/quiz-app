import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Row, Col, Statistic, Table, Button, Tag, Space, Tabs, Typography, message, Modal, Input, Popconfirm, Badge, Tooltip } from 'antd';
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
} from '@ant-design/icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const { Text, Title } = Typography;

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

// ─── Overview Tab ─────────────────────────────────────────────────

function OverviewTab({ onNavigate }: { onNavigate?: (key: string) => void }) {
  const [stats, setStats] = useState({ users: 0, banks: 0, questions: 0, pending: 0 });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const [{ count: users }, { count: banks }, { count: questions }, { count: pending }] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('question_banks').select('*', { count: 'exact', head: true }),
        supabase.from('questions').select('*', { count: 'exact', head: true }),
        supabase.from('question_banks').select('*', { count: 'exact', head: true }).eq('review_status', 'pending'),
      ]);
      setStats({
        users: users ?? 0,
        banks: banks ?? 0,
        questions: questions ?? 0,
        pending: pending ?? 0,
      });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      message.error('获取统计数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={5} style={{ margin: 0 }}>系统概览</Title>
        <Button icon={<ReloadOutlined />} onClick={fetchStats} loading={loading} size="small">刷新</Button>
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card loading={loading} hoverable onClick={() => onNavigate?.('users')} style={{ cursor: 'pointer' }} styles={{ body: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 } }}>
            <Statistic
              title="总用户数"
              value={stats.users}
              prefix={<TeamOutlined style={{ color: '#1677ff' }} />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={loading} hoverable onClick={() => onNavigate?.('review')} style={{ cursor: 'pointer' }} styles={{ body: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 } }}>
            <Statistic
              title="题库总数"
              value={stats.banks}
              prefix={<DatabaseOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={loading} hoverable styles={{ body: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 } }}>
            <Statistic
              title="题目总数"
              value={stats.questions}
              prefix={<QuestionCircleOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={loading} hoverable onClick={() => onNavigate?.('review')} style={{ cursor: 'pointer' }} styles={{ body: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 } }}>
            <Badge count={stats.pending} size="small" offset={[6, -4]}>
              <Statistic
                title="待审核题库"
                value={stats.pending}
                prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
                valueStyle={{ color: stats.pending > 0 ? '#faad14' : undefined }}
              />
            </Badge>
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
  const [activeTab, setActiveTab] = useState('pending');

  const fetchBanks = useCallback(async () => {
    setLoading(true);
    try {
      const { data: banks, error } = await supabase
        .from('question_banks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch creator emails
      const creatorIds = [...new Set((banks || []).map(b => b.created_by))];
      const { data: creators } = creatorIds.length > 0
        ? await supabase.from('profiles').select('id, email').in('id', creatorIds)
        : { data: [] };

      const emailMap: Record<string, string> = {};
      (creators || []).forEach(p => { emailMap[p.id] = p.email; });

      const enriched = (banks || []).map(b => ({
        ...b,
        creator_email: emailMap[b.created_by] || '未知',
      }));

      setPendingBanks(enriched.filter(b => b.review_status === 'pending'));
      setReviewedBanks(enriched.filter(b => b.review_status !== 'pending'));
    } catch (err) {
      console.error('Failed to fetch banks:', err);
      message.error('获取题库列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBanks(); }, [fetchBanks]);

  const updateStatus = async (bankId: string, status: 'approved' | 'rejected') => {
    const label = status === 'approved' ? '批准' : '驳回';
    try {
      const { error } = await supabase
        .from('question_banks')
        .update({ review_status: status })
        .eq('id', bankId);

      if (error) throw error;

      message.success(`题库已${label}`);
      fetchBanks();
    } catch (err) {
      console.error(`Failed to ${status} bank:`, err);
      message.error(`${label}失败`);
    }
  };

  const handleDeleteBank = async (bankId: string, bankName: string) => {
    try {
      const { error } = await supabase
        .from('question_banks')
        .delete()
        .eq('id', bankId);

      if (error) throw error;

      message.success(`题库「${bankName}」已删除`);
      fetchBanks();
    } catch (err) {
      console.error('Failed to delete bank:', err);
      message.error('删除失败');
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
      width: 80,
      render: (_: unknown, record: BankWithCreator) => (
        <Popconfirm
          title={`确认删除题库「${record.name}」？题目也将永久删除，不可恢复。`}
          onConfirm={() => handleDeleteBank(record.id, record.name)}
          okText="确认删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
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
      <div style={{ marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>题库审核</Title>
        <Text type="secondary">审核用户上传的题库，批准后全员可见，驳回后仅上传人和管理员可见</Text>
      </div>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
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

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      message.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    const action = newRole === 'admin' ? '提升为管理员' : '取消管理员';

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      message.success(`${action}成功`);
      fetchUsers();
    } catch (err) {
      console.error(`Failed to toggle role:`, err);
      message.error(`${action}失败`);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      message.warning('密码至少 8 位');
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      message.warning('密码必须包含字母和数字');
      return;
    }

    setResetting(true);
    try {
      const { data, error } = await supabase.rpc('admin_reset_password', {
        target_user_id: resetPwdModal.userId,
        new_password: newPassword,
      });

      if (error) throw error;

      if (data === true) {
        message.success('密码重置成功');
        setResetPwdModal({ open: false, userId: '', email: '' });
        setNewPassword('');
      } else {
        throw new Error('密码重置失败，请稍后重试');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      message.error(`密码重置失败：${msg}`);
    } finally {
      setResetting(false);
    }
  };

  const columns = [
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
      width: 280,
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
              onClick={() => setResetPwdModal({ open: true, userId: record.id, email: record.email })}
            >
              重置密码
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>用户管理</Title>
        <Text type="secondary">管理用户角色和密码。密码重置通过数据库 RPC 直接执行。</Text>
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
        title={`重置密码 - ${resetPwdModal.email.replace('@local.app', '')}`}
        open={resetPwdModal.open}
        onOk={handleResetPassword}
        onCancel={() => {
          setResetPwdModal({ open: false, userId: '', email: '' });
          setNewPassword('');
        }}
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
    </>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  const tabItems = [
    {
      key: 'overview',
      label: (
        <span>
          <DatabaseOutlined /> 系统概览
        </span>
      ),
      children: <OverviewTab onNavigate={setActiveTab} />,
    },
    {
      key: 'review',
      label: (
        <span>
          <QuestionCircleOutlined /> 题库审核
        </span>
      ),
      children: <BankReviewTab />,
    },
    {
      key: 'users',
      label: (
        <span>
          <TeamOutlined /> 用户管理
        </span>
      ),
      children: <UserManagementTab />,
    },
  ];

  return (
    <div style={{ padding: '12px 16px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0, fontSize: 20 }}>
          <SafetyCertificateOutlined style={{ marginRight: 8, color: '#faad14' }} />
          管理后台
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          欢迎回来，{profile?.email?.replace('@local.app', '')} 🛡️
        </Text>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
    </div>
  );
}
