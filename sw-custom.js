/**
 * custom-sw.js — 自定义 Service Worker
 * 
 * - 接收到 SKIP_WAITING 消息后立即激活
 * - 激活后立即接管所有客户端
 * - 使用 Network First 策略确保 HTML 始终最新
 */
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

// Precache 静态资源 — 排除 PaddleOCR WASM（~21MB，按需加载）
const manifest = self.__WB_MANIFEST.filter(
  (entry) => !entry.url.includes('worker-entry') && !entry.url.includes('dist-')
);
precacheAndRoute(manifest);

// 网络优先策略加载 HTML（保证用户每次都拿到最新版本）
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'pages',
      networkTimeoutSeconds: 3,
      plugins: [],
    })
  )
);

// 监听来自页面的 skipWaiting 指令
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 激活后立即接管所有打开的页面
self.addEventListener('activate', (event) => {
  const claim = self.clients.claim();
  // 通知所有页面新 SW 已接管
  event.waitUntil(
    claim.then(() => (
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'CONTROLLED' });
        });
      })
    ))
  );
});
