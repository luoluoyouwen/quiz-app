/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  test: {
    environment: 'node',
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: '.',
      filename: 'sw-custom.js',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '刷题 App',
        short_name: '刷题',
        description: '离线刷题工具 — 支持选择题/填空题/判断题/自动挖空',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        theme_color: '#1677ff',
        background_color: '#ffffff',
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
