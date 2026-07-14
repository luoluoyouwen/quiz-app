import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Typography } from 'antd';
import { CloseOutlined, SyncOutlined } from '@ant-design/icons';
import { readAutoUpdateState, shouldAutoApplyUpdate } from './pwaUpdateStrategy';

const { Text } = Typography;

export default function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const refreshingRef = useRef(false);

  const applyUpdate = useCallback(async (reg?: ServiceWorkerRegistration | null) => {
    if (!('serviceWorker' in navigator)) return;
    const registration = reg ?? await navigator.serviceWorker.getRegistration();
    if (!registration?.waiting) return;
    setIsApplying(true);
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;
    let registration: ServiceWorkerRegistration | undefined;

    const handleReadyWorker = (reg: ServiceWorkerRegistration) => {
      if (cancelled || !reg.waiting) return;
      if (shouldAutoApplyUpdate(readAutoUpdateState())) {
        void applyUpdate(reg);
      } else {
        setNeedRefresh(true);
      }
    };

    const handleControllerChange = () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      window.location.reload();
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'CONTROLLED') {
        handleControllerChange();
      }
    };

    const checkForUpdates = () => {
      if (document.visibilityState === 'visible') {
        void registration?.update();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    navigator.serviceWorker.addEventListener('message', handleMessage);

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg || cancelled) return;
      registration = reg;
      handleReadyWorker(reg);

      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (newSW) {
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              handleReadyWorker(reg);
            }
          });
        }
      });
    });

    document.addEventListener('visibilitychange', checkForUpdates);
    const interval = window.setInterval(checkForUpdates, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      navigator.serviceWorker.removeEventListener('message', handleMessage);
      document.removeEventListener('visibilitychange', checkForUpdates);
      window.clearInterval(interval);
    };
  }, [applyUpdate]);

  const handleRefresh = async () => {
    await applyUpdate();
    window.setTimeout(() => {
      if (!refreshingRef.current) window.location.reload();
    }, 2500);
  };

  if (!needRefresh) return null;

  return (
    <div className="pwa-update-backdrop" role="presentation">
      <section className="pwa-update-dialog" role="dialog" aria-live="polite" aria-label="新版本更新提示">
        <button className="pwa-update-close" type="button" onClick={() => setNeedRefresh(false)} aria-label="关闭更新提示">
          <CloseOutlined />
        </button>
        <div className="pwa-update-icon" aria-hidden="true">
          <SyncOutlined spin={isApplying} />
        </div>
        <div className="pwa-update-copy">
          <Text strong>新版本可以使用了</Text>
          <Text type="secondary">更新包含最新界面与体验优化。当前操作完成后刷新，也可以现在立即切换。</Text>
        </div>
        <div className="pwa-update-actions">
          <Button onClick={() => setNeedRefresh(false)}>稍后</Button>
          <Button type="primary" icon={<SyncOutlined spin={isApplying} />} loading={isApplying} onClick={handleRefresh}>立即更新</Button>
        </div>
      </section>
    </div>
  );
}