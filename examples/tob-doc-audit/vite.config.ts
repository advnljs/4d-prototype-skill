/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // 相对路径，便于打包后以静态文件形式部署到集团内门户（财务共享平台 小应用）
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': decodeURIComponent(new URL('./src', import.meta.url).pathname) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
