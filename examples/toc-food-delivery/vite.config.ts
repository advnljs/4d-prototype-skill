/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // 相对路径：dist/ 可直接作为静态文件部署
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // 两个入口：PC 版 index.html 与手机版 app.html，共用同一套模拟后端与 4D 编排
    rollupOptions: { input: { main: 'index.html', app: 'app.html' } },
  },
  resolve: {
    alias: { '@': decodeURIComponent(new URL('./src', import.meta.url).pathname) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
