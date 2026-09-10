import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
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
