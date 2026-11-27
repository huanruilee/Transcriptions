import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { generateCorrectionDates } from './scripts/course_correction_dates.mjs';

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'course-correction-dates',
      apply: 'build',
      buildStart() {
        if (!process.env.VITEST) {
          generateCorrectionDates();
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    // happy-dom 21 預設停用 iframe 頁面載入（改由 enable* 旗標明確 opt-in）。
    // 閱讀器的 YouTube 播放器測試需要 iframe.contentWindow 存在，
    // 否則 postMessage 通道與 end-of-session 事件無法驗證。
    environmentOptions: {
      happyDOM: {
        settings: {
          enableIframePageLoading: true,
        },
      },
    },
    include: ['tests/unit_v2/**/*.{test,spec}.ts'],
  },
  server: {
    port: 3000,
    open: false,
    proxy: {
      '/remote-audio': {
        target: 'https://drive.usercontent.google.com',
        changeOrigin: true,
        rewrite: (requestPath) => {
          const requestUrl = new URL(requestPath, 'http://localhost');
          const targetValue = requestUrl.searchParams.get('url');
          if (!targetValue) return '/invalid-audio-request';
          const target = new URL(targetValue);
          if (target.protocol !== 'https:' || target.hostname !== 'drive.usercontent.google.com') {
            return '/invalid-audio-request';
          }
          return `${target.pathname}${target.search}`;
        },
        configure: (proxy) => {
          proxy.on('proxyRes', (response) => {
            delete response.headers['cross-origin-resource-policy'];
            delete response.headers['content-disposition'];
          });
        },
      },
    },
  },
});
