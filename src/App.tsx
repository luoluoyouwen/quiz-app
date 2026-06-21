import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { ConfigProvider, Layout, Menu, Typography, theme, Button } from 'antd';
import {
  HomeOutlined,
  BookOutlined,
  MoonOutlined,
  SunOutlined,
} from '@ant-design/icons';
import { useTheme, ThemeProvider } from './contexts/ThemeContext';
import Home from './pages/Home';
import BankDetail from './pages/BankDetail';
import Practice from './pages/Practice';
import PwaUpdatePrompt from './components/PwaUpdatePrompt';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();

  const menuItems = [
    {
      key: '/',
      icon: <HomeOutlined />,
      label: '题库列表',
    },
  ];

  const selectedKey = location.pathname === '/' ? '/' : '';

  const headerBg = isDark ? '#1f1f1f' : '#fff';
  const contentBg = isDark ? '#141414' : '#f5f5f5';
  const borderColor = isDark ? '#303030' : '#f0f0f0';

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
          <Button
            type="text"
            icon={isDark ? <SunOutlined style={{ fontSize: 18, color: '#faad14' }} /> : <MoonOutlined style={{ fontSize: 18 }} />}
            onClick={toggleTheme}
            style={{ color: isDark ? '#e8e8e8' : undefined }}
          />
        </Header>
        <Content style={{ background: contentBg, minHeight: 'calc(100vh - 48px)' }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/bank/:id" element={<BankDetail />} />
            <Route path="/practice/:bankId" element={<Practice />} />
          </Routes>
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
        <ThemedApp />
      </ThemeProvider>
    </BrowserRouter>
  );
}
