import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 全局错误捕获
window.addEventListener('error', (e) => {
  console.error('=== GLOBAL ERROR ===', e.error || e.message || e);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('=== UNHANDLED REJECTION ===', e.reason);
});

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (err) {
  console.error('=== RENDER ERROR ===', err);
  document.getElementById('root')!.innerHTML = `<div style="padding:40px;text-align:center;color:red;font-size:18px">
    <h2>加载失败</h2>
    <pre style="text-align:left;background:#f5f5f5;padding:16px;overflow:auto">${err instanceof Error ? err.stack || err.message : String(err)}</pre>
  </div>`;
}
