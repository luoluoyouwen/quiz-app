import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { BarChart3, BookOpen, Camera, CheckCircle2, FileText, Moon, RotateCcw, Settings, Sun, User } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import AppLogo from './AppLogo';

const ease = [0.16, 1, 0.3, 1] as const;

interface LandingHeroProps {
  onUploadBank?: () => void;
  onEnterBank?: () => void;
  onPhotoSearch?: () => void;
  onWrongPractice?: () => void;
}


function TagPill({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  if (!onClick) return <span className="nk-tag-pill">{children}</span>;
  return <button className="nk-tag-pill nk-tag-action" type="button" onClick={onClick}>{children}</button>;
}

function HeroVisual() {
  return (
    <motion.div
      className="nk-visual-wrap"
      initial={{ opacity: 0, scale: 0.96, y: 18 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 1.1, ease }}
      aria-hidden="true"
    >
      <div className="nk-visual-doc nk-visual-card">
        <div className="nk-visual-doc-head">
          <span className="nk-doc-icon"><FileText size={17} /></span>
          <span>岗位标准题库.docx</span>
        </div>
        <div className="nk-doc-lines">
          <span />
          <span />
          <span />
        </div>
        <div className="nk-doc-tags">
          <span>单选</span>
          <span>填空</span>
          <span>判断</span>
        </div>
      </div>

      <div className="nk-visual-phone">
        <div className="nk-phone-top" />
        <div className="nk-phone-card">
          <span className="nk-phone-kicker">第 18 题</span>
          <strong>主风岗位开车前应确认哪些条件？</strong>
          <div className="nk-phone-options">
            <span>A. 仪表联锁正常</span>
            <span>B. 系统盲板未拆除</span>
            <span>C. 压力表无指示</span>
          </div>
        </div>
        <div className="nk-phone-result"><CheckCircle2 size={16} /> 已掌握</div>
      </div>

      <div className="nk-visual-stats nk-visual-card">
        <div className="nk-stat-title"><BarChart3 size={16} /> 今日进度</div>
        <div className="nk-stat-meter"><span /></div>
        <div className="nk-stat-row"><span>正确率</span><strong>86%</strong></div>
        <div className="nk-stat-row"><span>错题</span><strong>12</strong></div>
      </div>

      <div className="nk-visual-camera nk-visual-card">
        <Camera size={17} />
        <span>拍照搜题</span>
      </div>
    </motion.div>
  );
}

export default function LandingHero({ onUploadBank, onEnterBank, onPhotoSearch, onWrongPractice }: LandingHeroProps) {
  const { isDark, toggleTheme } = useTheme();
  const { username, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const userLabel = username || '当前用户';
  const scrollToBanks = () => {
    document.getElementById('bank-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const enterBank = onEnterBank ?? scrollToBanks;
  const navItems = [
    { key: '/', label: '题库', icon: <BookOpen size={14} /> },
    { key: '/stats', label: '统计', icon: <BarChart3 size={14} /> },
    { key: '/profile', label: '我的', icon: <User size={14} /> },
    ...(profile?.role === 'admin' ? [{ key: '/admin', label: '管理', icon: <Settings size={14} /> }] : []),
  ];

  return (
    <section className="nk-hero" aria-label="刷题 App 首页">
      <motion.nav
        className="nk-navbar"
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease }}
      >
        <div className="nk-nav-left">
          <button className="nk-brand" type="button" onClick={scrollToBanks} aria-label="刷题 App 首页">
            <AppLogo markClassName="nk-logo-mark" />
            <span className="nk-brand-text">刷题 App</span>
          </button>

          <div className="quiz-desktop-nav-pills nk-home-nav-pills" role="navigation" aria-label="主导航">
            {navItems.map((item) => {
              const active = location.pathname === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={active ? 'quiz-desktop-nav-pill is-active' : 'quiz-desktop-nav-pill'}
                  onClick={() => { if (item.key === '/') scrollToBanks(); else navigate(item.key); }}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="quiz-desktop-nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="nk-nav-right">
          <div className="nk-user-pill" title={userLabel}>
            <span className="nk-user-dot" aria-hidden="true" />
            <span className="nk-user-name">{userLabel}</span>
            {profile?.role === 'admin' && <span className="nk-user-role">管理员</span>}
          </div>
          <button className="nk-theme-btn" type="button" onClick={toggleTheme} aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}>
            {isDark ? <Sun size={17} strokeWidth={2.2} /> : <Moon size={17} strokeWidth={2.2} />}
          </button>
        </div>
      </motion.nav>

      <HeroVisual />

      <motion.footer
        className="nk-hero-footer"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.9, ease }}
      >
        <div className="nk-footer-left">
          <motion.div className="nk-subtitle" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.45, duration: 0.8, ease }}>
            <span className="nk-subtitle-dot" />
            <span>化工岗位题库 · 离线刷题 · 云端同步</span>
          </motion.div>

          <motion.h1 className="nk-heading" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6, duration: 0.8, ease }}>
            把题库整理好，<br />把刷题变简单。
          </motion.h1>

          <motion.div className="nk-actions" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.75, duration: 0.8, ease }}>
            <button className="nk-primary-btn" type="button" onClick={onUploadBank ?? scrollToBanks}>上传题库</button>
            <button className="nk-secondary-btn" type="button" onClick={enterBank}>查看题库</button>
          </motion.div>
        </div>

        <div className="nk-footer-tags" aria-label="刷题能力入口">
          <TagPill onClick={onPhotoSearch}><Camera size={13} />拍照搜题</TagPill>
          <TagPill onClick={onWrongPractice}><RotateCcw size={13} />错题练习</TagPill>
        </div>
      </motion.footer>
    </section>
  );
}
