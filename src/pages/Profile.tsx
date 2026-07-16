import { useEffect, useState } from 'react';
import { Card, Button, Typography, Modal, List, Tag, Space, message, Popconfirm } from 'antd';
import {
  UserOutlined,
  LogoutOutlined,
  InfoCircleOutlined,
  QuestionCircleOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  DeleteOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../db';
import { APP_VERSION, CHANGELOG } from '../utils/changelog';
import { useSearchParams } from 'react-router-dom';
import UserMessageActions from '../components/UserMessageActions';
import { checkForPwaUpdate } from '../utils/pwaManualUpdate';

const { Title, Text } = Typography;

export default function Profile() {
  const { username, profile, signOut } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const openModal = (modal: 'changelog' | 'help') => {
    setChangelogOpen(modal === 'changelog');
    setHelpOpen(modal === 'help');
    const next = new URLSearchParams(searchParams);
    next.set('modal', modal);
    setSearchParams(next);
  };

  const closeModal = (modal?: 'changelog' | 'help') => {
    if (!modal || modal === 'changelog') setChangelogOpen(false);
    if (!modal || modal === 'help') setHelpOpen(false);
    if (!modal || searchParams.get('modal') === modal) {
      const next = new URLSearchParams(searchParams);
      next.delete('modal');
      setSearchParams(next, { replace: true });
    }
  };

  useEffect(() => {
    const modal = searchParams.get('modal');
    setChangelogOpen(modal === 'changelog');
    setHelpOpen(modal === 'help');
  }, [searchParams]);

  const handleClearLocal = async () => {
    setClearing(true);
    try {
      await db.banks.clear();
      await db.questions.clear();
      await db.sessionAnswers.clear();
      await db.userProgress.clear();
      await db.sessions.clear();
      await db.cloudBankCache.clear();
      const { clearCloudBankDataCache } = await import('../lib/cloudBankData');
      clearCloudBankDataCache();
      message.success('本地数据已清除（云端题库需重新缓存）');
    } catch {
      message.error('清除失败');
    } finally {
      setClearing(false);
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const status = await checkForPwaUpdate();
      if (status === 'updating') {
        message.loading({
          content: '发现新版本，正在完成更新并重新启动…',
          key: 'pwa-manual-update',
          duration: 4,
        });
      } else if (status === 'up-to-date') {
        message.success('当前已是最新版本 v' + APP_VERSION);
      } else if (status === 'not-registered') {
        message.info('更新服务尚未就绪，请关闭应用后重新打开再试');
      } else {
        message.info('当前浏览器不支持应用内更新检查');
      }
    } catch (error) {
      console.error('Manual PWA update check failed:', error);
      message.error('检查更新失败，请确认网络连接后重试');
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="profile-page profile-workbench">
      <div className="subpage-hero profile-hero">
        <div>
          <Text className="subpage-eyebrow">账号、公告与设备</Text>
          <Title className="profile-page-title" level={3}>我的</Title>
        </div>
        <Text className="subpage-hero-copy">公告反馈、使用帮助、账号身份与设备数据管理</Text>
      </div>

      <Card className="profile-identity-card">
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div className="profile-identity-row">
            <div className="profile-avatar">
              <UserOutlined style={{ fontSize: 24, color: '#fff' }} />
            </div>
            <div className="profile-identity-copy">
              <div className="profile-username">{username}</div>
              <div className="profile-version">v{APP_VERSION}</div>
              <Space style={{ marginTop: 4 }}>
                {profile?.role === 'admin' && (
                  <Tag icon={<SafetyCertificateOutlined />} color="gold">管理员</Tag>
                )}
                <Tag icon={<TeamOutlined />}>{profile?.role === 'admin' ? '管理员' : '普通用户'}</Tag>
              </Space>
            </div>
          </div>
        </Space>
      </Card>

      <Card className="profile-action-card" size="small">
        <div className="profile-action-list">
          <Button
            className="profile-action-button"
            block
            icon={<SyncOutlined spin={checkingUpdate} />}
            loading={checkingUpdate}
            onClick={handleCheckUpdate}
          >
            {checkingUpdate ? '正在检查更新' : '检查更新'}
          </Button>
          <Button className="profile-action-button" block icon={<InfoCircleOutlined />} onClick={() => openModal('changelog')}>
            更新日志 v{APP_VERSION}
          </Button>
          <Button className="profile-action-button" block icon={<QuestionCircleOutlined />} onClick={() => openModal('help')}>
            使用帮助
          </Button>
          <UserMessageActions />
          <Popconfirm
            title="确定清除全部本地数据？"
            description="云端题库数据不受影响，可重新缓存"
            onConfirm={handleClearLocal}
            okText="确定清除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button className="profile-action-button" block danger icon={<DeleteOutlined />} loading={clearing}>
              清除本地数据
            </Button>
          </Popconfirm>
          <Button className="profile-action-button" block icon={<LogoutOutlined />} onClick={signOut} type="primary" danger>
            退出登录
          </Button>
        </div>
      </Card>

      <Modal
        className="profile-changelog-modal"
        title={<span><InfoCircleOutlined style={{ marginRight: 8 }} />更新日志</span>}
        open={changelogOpen}
        onCancel={() => closeModal('changelog')}
        footer={<Button onClick={() => closeModal('changelog')}>关闭</Button>}
        width={560}
      >
        {CHANGELOG.map((entry) => (
          <div key={entry.version} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Tag color="blue">v{entry.version}</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>{entry.date}</Text>
              <Text strong>{entry.title}</Text>
            </div>
            <List
              size="small"
              dataSource={entry.changes}
              renderItem={(item) => (
                <List.Item style={{ padding: '2px 0' }}>
                  <Text style={{ fontSize: 13 }}>• {item}</Text>
                </List.Item>
              )}
            />
          </div>
        ))}
      </Modal>

      <Modal
        className="profile-help-modal"
        title={<span><QuestionCircleOutlined style={{ marginRight: 8 }} />使用帮助</span>}
        open={helpOpen}
        onCancel={() => closeModal('help')}
        footer={<Button onClick={() => closeModal('help')}>关闭</Button>}
        width={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <Tag color="blue" style={{ marginBottom: 4 }}>1</Tag>
            <Text strong>从题库开始</Text>
            <div style={{ marginTop: 4, paddingLeft: 28 }}>
              <Text type="secondary">首页展示可用题库和学习状态。点击“进入”先看题库详情，点击“刷题”可直接开始全部题型练习。</Text>
              <br />
              <Text type="secondary">支持 DOCX、TXT、JSON、CSV、Markdown 导入；普通用户上传云端后需管理员审核，缓存后的云端题库可离线使用。</Text>
            </div>
          </div>
          <div>
            <Tag color="cyan" style={{ marginBottom: 4 }}>2</Tag>
            <Text strong>刷题、背题与学习状态</Text>
            <div style={{ marginTop: 4, paddingLeft: 28 }}>
              <Text type="secondary">题库详情支持全部练习、按题型、随机抽题和需复习重刷；简答题默认使用背题策略。</Text>
              <br />
              <Text type="secondary">答对或点击“已掌握”会更新为掌握；答错或点击“再看一遍”会进入需复习队列，可从首页或题库详情再次练习。</Text>
            </div>
          </div>
          <div>
            <Tag color="geekblue" style={{ marginBottom: 4 }}>3</Tag>
            <Text strong>快捷键与题号面板</Text>
            <div style={{ marginTop: 4, paddingLeft: 28 }}>
              <Text type="secondary">←/→ 翻题，数字键或 A-E 选择选项，Enter 提交，Space 下一题；小键盘数字兼容 NumLock 开关状态。</Text>
              <br />
              <Text type="secondary">右下角题号按钮可查看当前、已答和云端已记录题目；弹窗打开时背景页面不会继续滚动。</Text>
            </div>
          </div>
          <div>
            <Tag color="orange" style={{ marginBottom: 4 }}>4</Tag>
            <Text strong>拍照搜题</Text>
            <div style={{ marginTop: 4, paddingLeft: 28 }}>
              <Text type="secondary">点击相机入口拍摄题干，识别完成后会匹配本地与已缓存题库；首次使用 OCR 可能需要等待模型加载。</Text>
              <br />
              <Text type="secondary">识别文本可手动修改并重新搜索。拍摄时尽量保持文字清晰、画面平整并减少反光。</Text>
            </div>
          </div>
          <div>
            <Tag color="green" style={{ marginBottom: 4 }}>5</Tag>
            <Text strong>公告与意见反馈</Text>
            <div style={{ marginTop: 4, paddingLeft: 28 }}>
              <Text type="secondary">管理员发布的重要公告会在进入应用时提醒一次，也可随时在“我的 → 站内公告”中查看。</Text>
              <br />
              <Text type="secondary">在“意见反馈”中提交问题并查看管理员回复；待回复且尚无管理员回复的反馈可以自行删除。</Text>
            </div>
          </div>
          <div>
            <Tag color="purple" style={{ marginBottom: 4 }}>6</Tag>
            <Text strong>同步、离线与账号隔离</Text>
            <div style={{ marginTop: 4, paddingLeft: 28 }}>
              <Text type="secondary">联网时自动同步云端进度，断网时继续使用已缓存题库，恢复网络后再回写待同步记录。</Text>
              <br />
              <Text type="secondary">同一设备切换账号时，统计、会话和答题记录按账号隔离；清除本地数据不会删除云端题库或云端进度。</Text>
            </div>
          </div>
          <div>
            <Tag color="magenta" style={{ marginBottom: 4 }}>7</Tag>
            <Text strong>安装、更新与返回</Text>
            <div style={{ marginTop: 4, paddingLeft: 28 }}>
              <Text type="secondary">浏览器支持时可将应用安装到桌面或主屏幕。可在“我的 → 检查更新”立即拉取最新版本，也可按页面自动更新提示切换。</Text>
              <br />
              <Text type="secondary">移动端底部栏目互相独立，栏目内会逐层返回；系统返回键可优先关闭当前弹窗。</Text>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
