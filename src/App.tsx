import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Button, ConfigProvider, Layout, Modal, Tag, Typography, theme, Spin } from 'antd';
import {
  HomeOutlined,
  SettingOutlined,
  BarChartOutlined,
  UserOutlined,
  ArrowLeftOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { Moon as MoonIcon, Sun as SunIcon } from 'lucide-react';
import { supabase } from './lib/supabase';
import { useTheme, ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import PwaUpdatePrompt from './components/PwaUpdatePrompt';
import ErrorBoundary from './components/ErrorBoundary';
import AdminRoute from './components/AdminRoute';
import AppLogo from './components/AppLogo';
import { registerAutoSync } from './lib/syncService';
import { getBackTarget, getBankDetailPath, getPageTitle, getPrimaryTabKey } from './utils/navigation';
import { cssVarsToString, getAppThemeTokens } from './styles/themeTokens';
import { fetchAnnouncements, markAnnouncementRead, type Announcement } from './lib/messageCenter';
import { installModalScrollLock } from './utils/modalScrollLock';
import { loadBankDetailRoute, loadPracticeRoute } from './utils/routePreload';

const { Content } = Layout;
const { Text } = Typography;

const LAST_BANK_KEY = 'quiz-app-last-bank-path';
const getScrollSlot = (pathname: string) => pathname || '/';
const ROUTE_CHUNK_RELOAD_KEY = 'quiz-app-route-chunk-reload';
const HOME_ANNOUNCEMENT_SESSION_KEY = 'quiz-app-home-announcement-dismissed';

function getRouteChunkReloadMarker() {
  try { return sessionStorage.getItem(ROUTE_CHUNK_RELOAD_KEY); }
  catch { return null; }
}

function setRouteChunkReloadMarker() {
  try { sessionStorage.setItem(ROUTE_CHUNK_RELOAD_KEY, '1'); }
  catch { /* storage can be disabled in strict privacy modes */ }
}

function clearRouteChunkReloadMarker() {
  try { sessionStorage.removeItem(ROUTE_CHUNK_RELOAD_KEY); }
  catch { /* storage can be disabled in strict privacy modes */ }
}

function lazyWithChunkReload<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await loader();
      clearRouteChunkReloadMarker();
      return mod;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const chunkFailed = /dynamically imported module|Importing a module script failed|Failed to fetch|Loading chunk/i.test(message);
      if (chunkFailed && getRouteChunkReloadMarker() !== '1') {
        setRouteChunkReloadMarker();
        window.location.reload();
        return new Promise(() => {}) as Promise<{ default: T }>;
      }
      throw error;
    }
  });
}

const Home = lazyWithChunkReload(() => import('./pages/Home'));
const AdminDashboard = lazyWithChunkReload(() => import('./pages/AdminDashboard'));
const BankDetail = lazyWithChunkReload(loadBankDetailRoute);
const Practice = lazyWithChunkReload(loadPracticeRoute);
const Stats = lazyWithChunkReload(() => import('./pages/Stats'));
const Profile = lazyWithChunkReload(() => import('./pages/Profile'));
const Login = lazyWithChunkReload(() => import('./pages/Login'));

function RouteLoadingFallback() {
  return (
    <div className="route-loading-page subpage-loading-card" aria-label="页面加载中">
      <Spin />
      <Text type="secondary">正在打开页面</Text>
    </div>
  );
}

function HomeAnnouncementPopup({ enabled, userId }: { enabled: boolean; userId?: string }) {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    if (!enabled || !userId) {
      setAnnouncement(null);
      return;
    }

    let alive = true;
    const sessionKey = `${HOME_ANNOUNCEMENT_SESSION_KEY}:${userId}`;

    fetchAnnouncements()
      .then((items) => {
        if (!alive) return;
        const unread = items.find((item) => !item.read_at);
        if (!unread) {
          setAnnouncement(null);
          return;
        }
        try {
          const dismissedIds = new Set((sessionStorage.getItem(sessionKey) || '').split(',').filter(Boolean));
          if (dismissedIds.has(unread.id)) return;
        } catch {
          // Session storage can be blocked; the database read marker still prevents repeat prompts.
        }
        setAnnouncement(unread);
      })
      .catch(() => {
        if (alive) setAnnouncement(null);
      });

    return () => { alive = false; };
  }, [enabled, userId]);

  const dismissAnnouncement = async () => {
    const current = announcement;
    setAnnouncement(null);
    if (!current || !userId) return;
    const sessionKey = `${HOME_ANNOUNCEMENT_SESSION_KEY}:${userId}`;
    try {
      const dismissedIds = new Set((sessionStorage.getItem(sessionKey) || '').split(',').filter(Boolean));
      dismissedIds.add(current.id);
      sessionStorage.setItem(sessionKey, Array.from(dismissedIds).join(','));
    } catch {
      // Ignore storage failures; marking read on the server is the durable state.
    }
    if (!current.read_at) {
      try { await markAnnouncementRead(current.id); }
      catch { /* The announcement remains available in the message center if marking read fails. */ }
    }
  };

  return (
    <Modal
      className="home-announcement-modal message-center-modal"
      open={Boolean(announcement)}
      title={<span><BellOutlined style={{ marginRight: 8 }} />站内公告</span>}
      onCancel={dismissAnnouncement}
      footer={<Button type="primary" onClick={dismissAnnouncement}>知道了</Button>}
      width={520}
    >
      {announcement && (
        <div className="home-announcement-content">
          <div className="home-announcement-title-row">
            <Typography.Text strong>{announcement.title}</Typography.Text>
            {announcement.is_pinned && <Tag color="purple">置顶</Tag>}
          </div>
          <Typography.Paragraph>{announcement.content}</Typography.Paragraph>
          <Typography.Text type="secondary" className="home-announcement-meta">
            发布：{new Date(announcement.published_at || announcement.created_at).toLocaleString('zh-CN')}
          </Typography.Text>
        </div>
      )}
    </Modal>
  );
}
function BottomTabBar({ isAdmin }: { isAdmin: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { key: '/', icon: <HomeOutlined />, label: '题库' },
    { key: '/stats', icon: <BarChartOutlined />, label: '统计' },
    { key: '/profile', icon: <UserOutlined />, label: '我的' },
    ...(isAdmin ? [{ key: '/admin', icon: <SettingOutlined />, label: '管理' }] : []),
  ];

  const currentKey = getPrimaryTabKey(location.pathname);

  return (
    <nav className="quiz-mobile-tabbar" aria-label="底部导航">
      <div className="quiz-mobile-tabbar-inner">
        {tabs.map(tab => {
          const active = currentKey === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={active ? 'quiz-mobile-tab is-active' : 'quiz-mobile-tab'}
              onClick={() => { if (location.pathname !== tab.key) navigate(tab.key, { replace: true }); }}
              aria-current={active ? 'page' : undefined}
            >
              <span className="quiz-mobile-tab-icon">{tab.icon}</span>
              <span className="quiz-mobile-tab-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const { username, profile, signOut, user } = useAuth();
  const isHomePage = location.pathname === '/';

  const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine);
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const menuItems = [
    { key: '/', icon: <HomeOutlined />, label: '题库列表' },
    { key: '/stats', icon: <BarChartOutlined />, label: '统计' },
    { key: '/profile', icon: <UserOutlined />, label: '我的' },
    ...(profile?.role === 'admin' ? [{ key: '/admin', icon: <SettingOutlined />, label: '后台管理' }] : []),
  ];

  const selectedKeys = [getPrimaryTabKey(location.pathname)];
  const backTarget = getBackTarget(location.pathname);
  const showBack = Boolean(backTarget && !['/stats', '/profile', '/admin'].includes(location.pathname));

  const handleSmartBack = () => {
    if (backTarget) navigate(backTarget, { replace: true });
  };


  const unregisterSync = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (user) unregisterSync.current = registerAutoSync(user.id);
    return () => unregisterSync.current?.();
  }, [user]);

  const pageViewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTrackedPath = useRef<string>('');
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const currentPath = location.pathname;
    if (currentPath === lastTrackedPath.current) return;
    if (pageViewTimer.current) clearTimeout(pageViewTimer.current);
    pageViewTimer.current = setTimeout(() => {
      lastTrackedPath.current = currentPath;
      supabase.rpc('get_or_increment_page_view', { page_path: currentPath });
    }, 2000);
    return () => {
      if (pageViewTimer.current) clearTimeout(pageViewTimer.current);
    };
  }, [location.pathname]);

  useEffect(() => {
    const bankPath = getBankDetailPath(location.pathname);
    if (!bankPath) return;
    try { localStorage.setItem(LAST_BANK_KEY, bankPath); }
    catch { /* shortcut only */ }
  }, [location.pathname]);

  const pageTitle = getPageTitle(location.pathname);
  const scrollPositions = useRef<Record<string, number>>({});
  const activeScrollSlot = useRef(getScrollSlot(location.pathname));

  useEffect(() => {
    if (typeof window === 'undefined' || !('scrollRestoration' in window.history)) return;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const nextSlot = getScrollSlot(location.pathname);
    const previousSlot = activeScrollSlot.current;
    if (previousSlot !== nextSlot) {
      scrollPositions.current[previousSlot] = window.scrollY;
    }
    activeScrollSlot.current = nextSlot;

    const targetY = scrollPositions.current[nextSlot] ?? 0;
    const restore = () => {
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, Math.min(targetY, maxY));
    };
    const frames: number[] = [];
    const timers: number[] = [];
    const delays = targetY > 0 ? [80, 240, 520, 900, 1400] : [80, 240];
    restore();
    frames.push(window.requestAnimationFrame(() => {
      restore();
      frames.push(window.requestAnimationFrame(restore));
    }));
    delays.forEach((delay) => {
      timers.push(window.setTimeout(restore, delay));
    });

    return () => {
      scrollPositions.current[nextSlot] = window.scrollY;
      frames.forEach((frame) => window.cancelAnimationFrame(frame));
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [location.pathname]);

  return (
    <>
      <style>{`
        .quiz-app-bottom-tab-spacer { display: none; }
        .quiz-app-content-padded { padding: 24px; }
        .quiz-app-content-padded.quiz-app-content-home { padding: 0; }
        .route-loading-page {
          min-height: 320px;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 12px;
        }
        @media (max-width: 767px) {
          .quiz-app-bottom-tab-spacer { display: block; height: 56px; padding-bottom: env(safe-area-inset-bottom); }
          .quiz-app-sider { display: none !important; }
          .quiz-app-content { padding-bottom: 0 !important; }
          .quiz-app-content-padded { padding: 12px; }
          .quiz-app-content-padded.quiz-app-content-home { padding: 0; }
        }
      `}</style>
      <Layout className={isHomePage ? 'quiz-app-shell quiz-app-shell-home' : 'quiz-app-shell'} style={{ minHeight: '100vh' }}>
        <Layout>
          {!isHomePage && (
            <header className="quiz-desktop-topbar" aria-label="页面导航">
              <div className="quiz-desktop-nav-left">
                <div className="quiz-desktop-brand quiz-brand-static" aria-label="刷题 App">
                  <AppLogo className="quiz-brand-logo" markClassName="quiz-brand-logo-mark" />
                  <span>刷题 App</span>
                </div>
                {showBack && (
                  <button className="quiz-topbar-icon" type="button" onClick={handleSmartBack} aria-label="返回上一级">
                    <ArrowLeftOutlined />
                  </button>
                )}
                <div className="quiz-desktop-nav-pills" role="navigation" aria-label="主导航">
                  {menuItems.map((item) => {
                    const active = selectedKeys.includes(item.key);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={active ? 'quiz-desktop-nav-pill is-active' : 'quiz-desktop-nav-pill'}
                        onClick={() => navigate(item.key, { replace: true })}
                        aria-current={active ? 'page' : undefined}
                      >
                        <span className="quiz-desktop-nav-icon">{item.icon}</span>
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
                <Text className="quiz-desktop-page-title">{pageTitle}</Text>
              </div>
              <div className="quiz-app-header-actions quiz-topbar-actions">
                {profile?.role === 'admin' ? (
                  <button className="quiz-user-pill is-admin" type="button" onClick={() => navigate('/admin')}>
                    <span className="quiz-user-dot" />
                    <span>{username}</span>
                    <span className="quiz-user-role">管理员</span>
                  </button>
                ) : (
                  <div className="quiz-user-pill">
                    <span className="quiz-user-dot" />
                    <span>{username}</span>
                  </div>
                )}
                <button className="quiz-topbar-pill" type="button" onClick={signOut}>退出</button>
                <button className="quiz-topbar-icon" type="button" onClick={toggleTheme} aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}>
                  {isDark ? <SunIcon size={17} strokeWidth={2.2} /> : <MoonIcon size={17} strokeWidth={2.2} />}
                </button>
              </div>
            </header>
          )}

          {!isOnline && (
            <div className="quiz-offline-banner">
              当前处于离线模式，数据会在网络恢复后自动同步
            </div>
          )}

          <Content className={isHomePage ? 'quiz-app-content quiz-app-home-content' : 'quiz-app-content'}>
            <ErrorBoundary>
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className={isHomePage ? 'quiz-app-content-padded quiz-app-content-home' : 'quiz-app-content-padded'}>
                    <Suspense fallback={<RouteLoadingFallback />}>
                      <Routes location={location}>
                        <Route path="/" element={<Home />} />
                        <Route path="/stats" element={<Stats />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/admin" element={
                          <AdminRoute>
                            <AdminDashboard />
                          </AdminRoute>
                        } />
                        <Route path="/bank/:id" element={<BankDetail />} />
                        <Route path="/practice/:bankId" element={<Practice />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </Suspense>
                  </div>
                  <div className="quiz-app-bottom-tab-spacer" />
                </motion.div>
              </AnimatePresence>
            </ErrorBoundary>
          </Content>
          <HomeAnnouncementPopup enabled={isHomePage && Boolean(user)} userId={user?.id} />
          <PwaUpdatePrompt />
          <div className="quiz-app-bottom-tab-bar">
            <BottomTabBar isAdmin={profile?.role === 'admin'} />
          </div>
        </Layout>
      </Layout>
    </>
  );
}

function GlobalStyles() {
  const { isDark } = useTheme();
  const appTheme = getAppThemeTokens(isDark);

  return (
    <style>{`
      ${isDark ? ':root, html.dark' : ':root'} {
        color-scheme: ${isDark ? 'dark' : 'light'};
${cssVarsToString(appTheme.cssVars)}
      }
      body {
        background: linear-gradient(180deg, var(--app-bg-top), var(--app-bg-bottom));
        color: var(--app-text);
      }
      html.quiz-modal-scroll-locked {
        overflow: hidden !important;
        overscroll-behavior: none;
      }
      html.quiz-modal-scroll-locked body {
        overscroll-behavior: none;
      }
      .quiz-app-bottom-tab-bar { display: none; }
      .quiz-offline-banner {
        background: var(--app-error);
        color: #fff;
        text-align: center;
        padding: 6px 12px;
        font-size: 13px;
        font-weight: 600;
      }
      @media (max-width: 767px) {
        .quiz-app-bottom-tab-bar { display: block !important; }
      }
    `}</style>
  );
}
function StartupSplash({ isDark }: { isDark: boolean }) {
  return (
    <div className="app-loading-page" data-theme={isDark ? 'dark' : 'light'}>
      <div className="app-loading-workbench" aria-hidden="true">
        <div className="app-loading-glow" />
        <div className="app-loading-doc app-loading-float-card">
          <span className="app-loading-doc-title">题库索引</span>
          <span />
          <span />
          <span />
        </div>
        <div className="app-loading-phone">
          <div className="app-loading-phone-top" />
          <div className="app-loading-screen">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="app-loading-sync app-loading-float-card">进度同步</div>
      </div>
      <div className="app-loading-card">
        <AppLogo className="app-loading-logo" markClassName="app-loading-logo-mark" />
        <Spin size="large" />
        <strong>正在准备刷题环境</strong>
        <span>同步账号、题库与离线缓存</span>
      </div>
    </div>
  );
}
function ThemedApp() {
  const { isDark } = useTheme();
  const { user, loading } = useAuth();
  const appTheme = getAppThemeTokens(isDark);

  useEffect(() => installModalScrollLock(), []);

  return (
    <ConfigProvider theme={{ algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm, token: appTheme.antdToken }}>
      <GlobalStyles />
      {loading ? <StartupSplash isDark={isDark} /> : user ? <AppLayout /> : (
        <Suspense fallback={<StartupSplash isDark={isDark} />}>
          <Login />
        </Suspense>
      )}
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
