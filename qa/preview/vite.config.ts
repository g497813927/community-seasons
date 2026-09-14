import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
import { previewBuildInfo } from './build-info.mjs';

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  base: './',
  publicDir: local('../../src/public/'),
  plugins: [previewBuildInfo(local('../../')), react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: /^@\/lib\/game\/toy-sdk$/, replacement: local('./toy-sdk.ts') },
      { find: /^\.\/toy-sdk$/, replacement: local('./toy-sdk.ts') },
      { find: '@', replacement: local('../../src/') },
    ],
  },
  css: { postcss: { plugins: [tailwindcss({ base: local('../../src/') })] } },
  server: { host: '127.0.0.1', port: 4175, strictPort: true, fs: { allow: [local('../../')] } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
