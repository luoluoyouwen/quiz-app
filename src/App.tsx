import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Typography } from 'antd';
import {
  HomeOutlined,
  BookOutlined,
} from '@ant-design/icons';
import Home from './pages/Home';
import BankDetail from './pages/BankDetail';
import Practice from './pages/Practice';
import PwaUpdatePrompt from './components/PwaUpdatePrompt';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: '/',
      icon: <HomeOutlined />,
      label: '题库列表',
    },
  ];

  // Determine selected key - highlight based on path
  const selectedKey = location.pathname === '/' ? '/' : '';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        breakpoint="lg"
        collapsedWidth={0}
        trigger={null}
        style={{
          borderRight: '1px solid #f0f0f0',
        }}
      >
        <div style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid #f0f0f0',
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
            background: '#fff',
            padding: '0 24px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            height: 48,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: 500 }}>
            {location.pathname === '/' && '题库列表'}
            {location.pathname.startsWith('/bank/') && '题库详情'}
            {location.pathname.startsWith('/practice/') && '刷题练习'}
          </Text>
        </Header>
        <Content style={{ background: '#f5f5f5', minHeight: 'calc(100vh - 48px)' }}>
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

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
