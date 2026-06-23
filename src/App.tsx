import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ConfigProvider, Layout, Menu, Typography, theme, Button, Spin, Space } from 'antd';
import {
  HomeOutlined,
  BookOutlined,
  MoonOutlined,
  SunOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useTheme, ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Home from './pages/Home';
import AdminDashboard from './pages/AdminDashboard';
import BankDetail from './pages/BankDetail';
import Practice from './pages/Practice';
import Login from './pages/Login';
import PwaUpdatePrompt from './components/PwaUpdatePrompt';
import ErrorBoundary from './components/ErrorBoundary';
import AdminRoute from './components/AdminRoute';
import { registerAutoSync } from './lib/syncService';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const { username, profile, signOut, user } = useAuth();

  const menuItems = [
    {
      key: '/',
      icon: <HomeOutlined />,
      label: '题库列表',
    },
    ...(profile?.role === 'admin' ? [{
      key: '/admin',
      icon: <SettingOutlined />,
      label: '后台管理',
    }] : []),
  ];

  const selectedKey = location.pathname === '/' ? '/' : '';

  const headerBg = isDark ? '#1f1f1f' : '#fff';
  const contentBg = isDark ? '#141414' : '#f5f5f5';
  const borderColor = isDark ? '#303030' : '#f0f0f0';

  // ── P4: 注册自动同步（登录时注册，退出时清理） ──
  const unregisterSync = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (user) {
      unregisterSync.current = registerAutoSync(user.id);
    }
    return () => {
      unregisterSync.current?.();
    };
  }, [user]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        breakpoint="lg"
        collapsedWidth={0}
        trigger={null}
        style={{ borderRight: `1px solid ${borderColor}` }}
      >
        <div style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: `1px solid ${borderColor}`,
        }}>
          <BookOutlined style={{ fontSize: 20, color: '#1677ff', marginRight: 8 }} />
          <Text strong style={{ color: '#fff', fontSize: 16 }}>刷题 App</Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: headerBg,
            padding: '0 24px',
            borderBottom: `1px solid ${borderColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 48,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: 500, color: isDark ? '#e8e8e8' : undefined }}>
            {location.pathname === '/' && '题库列表'}
            {location.pathname.startsWith('/bank/') && '题库详情'}
            {location.pathname.startsWith('/practice/') && '刷题练习'}
          </Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {profile?.role === 'admin' ? (
              <Button type="link" size="small" onClick={() => navigate('/admin')} style={{ padding: 0, height: 'auto', fontSize: 13, lineHeight: '24px' }}>
                {username} 🛡️
              </Button>
            ) : (
              <div style={{ lineHeight: '24px', fontSize: 13, color: isDark ? '#8c8c8c' : '#999' }}>
                {username}
              </div>
            )}
            <Button type="text" size="small" onClick={signOut} style={{ lineHeight: '24px' }}>
              退出
            </Button>
            <Button
            type="text"
            size="small"
            icon={isDark ? <SunOutlined style={{ fontSize: 16, color: '#faad14' }} /> : <MoonOutlined style={{ fontSize: 16 }} />}
            onClick={toggleTheme}
            style={{ color: isDark ? '#e8e8e8' : undefined }}
          />
          </div>
        </Header>
        <Content style={{ background: contentBg, minHeight: 'calc(100vh - 48px)' }}>
          <ErrorBoundary>
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <Routes location={location}>
                  <Route path="/" element={<Home />} />
                  <Route path="/admin" element={
                    <AdminRoute>
                      <AdminDashboard />
                    </AdminRoute>
                  } />
                  <Route path="/bank/:id" element={<BankDetail />} />
                  <Route path="/practice/:bankId" element={<Practice />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </ErrorBoundary>
        </Content>
        <PwaUpdatePrompt />
      </Layout>
    </Layout>
  );
}

function GlobalStyles() {
  const { isDark } = useTheme();
  return (
    <style>{`
      :root {
        --bg-container: ${isDark ? '#1f1f1f' : '#fff'};
        --bg-layout: ${isDark ? '#141414' : '#f5f5f5'};
        --bg-success: ${isDark ? '#162312' : '#f6ffed'};
        --bg-error: ${isDark ? '#2a1215' : '#fff1f0'};
        --bg-warning: ${isDark ? '#2b1d0f' : '#fffbe6'};
        --bg-fill: ${isDark ? '#262626' : '#fafafa'};
        --border: ${isDark ? '#434343' : '#d9d9d9'};
        --border-success: ${isDark ? '#305f1a' : '#b7eb8f'};
        --border-error: ${isDark ? '#a8071a' : '#ff4d4f'};
        --border-warning: ${isDark ? '#612500' : '#ffe58f'};
        --color-success: ${isDark ? '#73d13d' : '#52c41a'};
        --color-error: ${isDark ? '#ff7875' : '#ff4d4f'};
        --color-text-secondary: ${isDark ? '#8c8c8c' : '#999'};
        --primary: #1677ff;
      }
    `}</style>
  );
}

function ThemedApp() {
  const { isDark } = useTheme();
  const { user, loading } = useAuth();

  // 加载中显示 splash
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isDark ? '#141414' : '#f0f2f5',
      }}>
        <Spin size="large" />
      </div>
    );
  }

  // 未登录显示登录页
  if (!user) {
    return <Login />;
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
    >
      <GlobalStyles />
      <AppLayout />
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ThemedApp />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
