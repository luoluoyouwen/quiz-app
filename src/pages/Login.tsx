import { useState } from 'react';
import { Card, Input, Button, Tabs, Typography, Alert, Space } from 'antd';
import { UserOutlined, LockOutlined, CloudSyncOutlined, FileTextOutlined, CheckCircleOutlined, CameraOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import AppLogo from '../components/AppLogo';

const { Text, Title } = Typography;

const USERNAME_REGEX = /^SMYH\d{4}$/;

function validatePassword(password: string): string | null {
  if (password.length < 8) return '密码至少 8 位';
  if (!/[a-zA-Z]/.test(password)) return '密码需包含至少 1 个字母';
  if (!/\d/.test(password)) return '密码需包含至少 1 个数字';
  return null;
}

export default function Login() {
  const { signIn, signUp } = useAuth();
  const { isDark } = useTheme();
  const [tab, setTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 登录表单
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginUsernameError, setLoginUsernameError] = useState('');

  // 注册表单
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regUsernameError, setRegUsernameError] = useState('');
  const [regPasswordError, setRegPasswordError] = useState('');
  const [regConfirmError, setRegConfirmError] = useState('');

  const handleLoginUsernameChange = (val: string) => {
    const upper = val.toUpperCase();
    setLoginUsername(upper);
    if (upper && !USERNAME_REGEX.test(upper)) {
      setLoginUsernameError('工号格式：SMYH + 4位数字，如 SMYH1234');
    } else {
      setLoginUsernameError('');
    }
  };

  const handleRegUsernameChange = (val: string) => {
    const upper = val.toUpperCase();
    setRegUsername(upper);
    if (upper && !USERNAME_REGEX.test(upper)) {
      setRegUsernameError('工号格式：SMYH + 4位数字，如 SMYH1234');
    } else {
      setRegUsernameError('');
    }
  };

  const handleRegPasswordChange = (val: string) => {
    setRegPassword(val);
    if (val) {
      setRegPasswordError(validatePassword(val) || '');
    } else {
      setRegPasswordError('');
    }
  };

  const handleRegConfirmChange = (val: string) => {
    setRegConfirm(val);
    if (val && val !== regPassword) {
      setRegConfirmError('两次密码输入不一致');
    } else {
      setRegConfirmError('');
    }
  };

  const handleLogin = async () => {
    if (!USERNAME_REGEX.test(loginUsername)) {
      setError('请输入正确的工号格式（SMYH + 4位数字）');
      return;
    }
    if (!loginPassword) {
      setError('请输入密码');
      return;
    }
    setError('');
    setLoading(true);
    const result = await signIn(loginUsername, loginPassword);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    }
  };

  const handleRegister = async () => {
    if (!USERNAME_REGEX.test(regUsername)) {
      setError('请输入正确的工号格式（SMYH + 4位数字）');
      return;
    }
    const pwdErr = validatePassword(regPassword);
    if (pwdErr) {
      setError(pwdErr);
      return;
    }
    if (regPassword !== regConfirm) {
      setError('两次密码输入不一致');
      return;
    }
    setError('');
    setLoading(true);
    const result = await signUp(regUsername, regPassword);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      // 注册成功后自动登录
      setTab('login');
      setLoginUsername(regUsername);
      const signInResult = await signIn(regUsername, regPassword);
      if (signInResult.error) {
        setError('注册成功，但自动登录失败：' + signInResult.error);
      }
    }
  };

  return (
    <div className="auth-page" data-theme={isDark ? 'dark' : 'light'}>
      <div className="auth-workbench" aria-hidden="true">
        <div className="auth-workbench-glow" />
        <div className="auth-doc-card auth-float-card">
          <div className="auth-doc-head"><FileTextOutlined /> 岗位标准题库.docx</div>
          <span />
          <span />
          <span />
        </div>
        <div className="auth-phone-shell">
          <div className="auth-phone-top" />
          <div className="auth-phone-card">
            <Text className="auth-kicker">第 18 题</Text>
            <strong>登录后继续同步刷题进度</strong>
            <div className="auth-option-list">
              <span>A. 云端题库</span>
              <span>B. 错题重刷</span>
              <span>C. 离线缓存</span>
            </div>
          </div>
          <div className="auth-status-pill"><CheckCircleOutlined /> 已就绪</div>
        </div>
        <div className="auth-sync-card auth-float-card">
          <CloudSyncOutlined /> 进度同步
        </div>
        <div className="auth-camera-card auth-float-card">
          <CameraOutlined /> 拍照搜题
        </div>
      </div>

      <Card className="auth-card" styles={{ body: { padding: 0 } }}>
        <div className="auth-card-head">
          <AppLogo className="auth-logo" markClassName="auth-logo-mark" />
          <Title level={3}>刷题 App</Title>
          <Text type="secondary">登录以同步您的刷题进度</Text>
        </div>

        <Tabs
          activeKey={tab}
          onChange={(key) => {
            setTab(key);
            setError('');
          }}
          centered
          items={[
            {
              key: 'login',
              label: '登录',
              children: (
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  <div>
                    <Input
                      prefix={<UserOutlined />}
                      placeholder="工号（如 SMYH1234）"
                      size="large"
                      value={loginUsername}
                      onChange={(e) => handleLoginUsernameChange(e.target.value)}
                      status={loginUsernameError ? 'error' : undefined}
                      onPressEnter={handleLogin}
                    />
                    {loginUsernameError && (
                      <Text type="danger" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                        {loginUsernameError}
                      </Text>
                    )}
                  </div>
                  <Input.Password
                    prefix={<LockOutlined />}
                    placeholder="密码"
                    size="large"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    onPressEnter={handleLogin}
                  />
                  {error && tab === 'login' && (
                    <Alert message={error} type="error" showIcon closable onClose={() => setError('')} />
                  )}
                  <Button
                    type="primary"
                    size="large"
                    block
                    loading={loading}
                    onClick={handleLogin}
                  >
                    登 录
                  </Button>
                </Space>
              ),
            },
            {
              key: 'register',
              label: '注册',
              children: (
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  <div>
                    <Input
                      prefix={<UserOutlined />}
                      placeholder="工号（如 SMYH1234）"
                      size="large"
                      value={regUsername}
                      onChange={(e) => handleRegUsernameChange(e.target.value)}
                      status={regUsernameError ? 'error' : undefined}
                    />
                    {regUsernameError && (
                      <Text type="danger" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                        {regUsernameError}
                      </Text>
                    )}
                  </div>
                  <div>
                    <Input.Password
                      prefix={<LockOutlined />}
                      placeholder="密码（至少8位，含字母+数字）"
                      size="large"
                      value={regPassword}
                      onChange={(e) => handleRegPasswordChange(e.target.value)}
                      status={regPasswordError ? 'error' : undefined}
                    />
                    {regPasswordError && (
                      <Text type="danger" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                        {regPasswordError}
                      </Text>
                    )}
                  </div>
                  <div>
                    <Input.Password
                      prefix={<LockOutlined />}
                      placeholder="确认密码"
                      size="large"
                      value={regConfirm}
                      onChange={(e) => handleRegConfirmChange(e.target.value)}
                      status={regConfirmError ? 'error' : undefined}
                    />
                    {regConfirmError && (
                      <Text type="danger" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                        {regConfirmError}
                      </Text>
                    )}
                  </div>
                  {error && tab === 'register' && (
                    <Alert message={error} type="error" showIcon closable onClose={() => setError('')} />
                  )}
                  <Button
                    type="primary"
                    size="large"
                    block
                    loading={loading}
                    onClick={handleRegister}
                  >
                    注 册
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
