import { useState, useEffect } from 'react';
import { Button, Typography } from 'antd';
import { SyncOutlined } from '@ant-design/icons';

const { Text } = Typography;

export default function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);

  useEffect(() => {
    // Listen for service worker updates via the native API
    if ('serviceWorker' in navigator) {
      // Check if there's a waiting SW (already installed, waiting to activate)
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) {
          setNeedRefresh(true);
        }

        // Listen for new SW being found while app is open
        if (reg) {
          reg.addEventListener('updatefound', () => {
            const newSW = reg.installing;
            if (newSW) {
              newSW.addEventListener('statechange', () => {
                if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                  // New SW installed but waiting for activation
                  setNeedRefresh(true);
                }
              });
            }
          });
        }
      });
    }
  }, []);

  const handleRefresh = async () => {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        // Tell the waiting SW to activate
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        // Reload the page to use the new SW
        window.location.reload();
      }
    }
  };

  if (!needRefresh) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        left: 16,
        right: 16,
        background: '#1677ff',
        color: '#fff',
        padding: '14px 20px',
        borderRadius: 10,
        boxShadow: '0 6px 20px rgba(22,119,255,0.3)',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>
          🆕 新版本已发布
        </Text>
        <br />
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
          点击刷新获取最新功能与修复
        </Text>
      </div>
      <Button
        ghost
        size="small"
        icon={<SyncOutlined />}
        style={{
          borderColor: 'rgba(255,255,255,0.6)',
          color: '#fff',
          borderRadius: 6,
          whiteSpace: 'nowrap',
        }}
        onClick={handleRefresh}
      >
        刷新
      </Button>
    </div>
  );
}
