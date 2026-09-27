import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));
const cosmosPkg = path.resolve(here, '../../packages/cosmos/src');
const domainSpace = path.resolve(here, '../../packages/domain/src/space.ts');

// 预览壳刻意留在 pnpm workspace 之外（本机 Node 24 与主仓库 engines 不同）。
// 视图与合同的唯一来源是 packages/cosmos 与 packages/domain，这里只做路径映射。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@zivith/cosmos/styles.css': path.join(cosmosPkg, 'styles.css'),
      '@zivith/cosmos': path.join(cosmosPkg, 'index.ts'),
      '@zivith/domain/space': domainSpace,
    },
    // 包源码与本目录各有 node_modules；强制单实例，避免双份 React / Three。
    dedupe: ['react', 'react-dom', 'three'],
  },
  server: {
    port: 5175,
    host: '127.0.0.1',
    proxy: {
      // 与 Zivith API（127.0.0.1:4000）同源代理，避免 CORS；不改动主应用
      '/zivith-api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/zivith-api/, ''),
      },
    },
  },
});
