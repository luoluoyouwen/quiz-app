import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  test: {
    environment: 'node',
  },
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      external: ['onnxruntime-web'],
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'vendor-react';
          if (id.includes('antd') || id.includes('@ant-design') || id.includes('rc-')) return 'vendor-antd';
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('dexie')) return 'vendor-dexie';
          if (id.includes('mammoth') || id.includes('officeparser') || id.includes('jszip') || id.includes('papaparse')) return 'vendor-importers';
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: '.',
      filename: 'sw-custom.js',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globIgnores: [
          '**/assets/worker-entry-*',
          '**/assets/dist-*',
        ],
      },
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '刷题 App',
        short_name: '刷题',
        description: '离线刷题工具 — 支持选择题/填空题/判断题/自动挖空',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        theme_color: '#425f86',
        background_color: '#f4f7fb',
        display: 'standalone',
        icons: [
          { src: 'icons/192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
