import { useState } from 'react';
import { Card, Input, Button, Tabs, Typography, Alert, Space } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

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
      setLoginUsernameError('工号格式：SMYH + 4位数字，如 SMYH0001');
    } else {
      setLoginUsernameError('');
    }
  };

  const handleRegUsernameChange = (val: string) => {
    const upper = val.toUpperCase();
    setRegUsername(upper);
    if (upper && !USERNAME_REGEX.test(upper)) {
      setRegUsernameError('工号格式：SMYH + 4位数字，如 SMYH0001');
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

  const bgColor = isDark ? '#141414' : '#f0f2f5';
  const cardBg = isDark ? '#1f1f1f' : '#fff';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bgColor,
        padding: 16,
      }}
    >
      <Card
        style={{
          width: 400,
          maxWidth: '100%',
          background: cardBg,
          borderRadius: 12,
        }}
        styles={{ body: { padding: '32px 24px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Title level={3} style={{ margin: 0, color: isDark ? '#e8e8e8' : undefined }}>
            刷题 App
          </Title>
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
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <div>
                    <Input
                      prefix={<UserOutlined />}
                      placeholder="工号（如 SMYH0001）"
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
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <div>
                    <Input
                      prefix={<UserOutlined />}
                      placeholder="工号（如 SMYH0001）"
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
