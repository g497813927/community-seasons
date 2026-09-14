import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath, URL } from 'node:url';

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  base: './',
  publicDir: local('../../src/public/'),
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: '@/lib/game/engine', replacement: local('./engine.ts') },
      { find: '@/lib/game/toy-sdk', replacement: local('./toy-sdk.ts') },
      { find: '@', replacement: local('../../src/') },
    ],
  },
  css: { postcss: { plugins: [tailwindcss({ base: local('../../src/') })] } },
  server: { host: '127.0.0.1', port: 3030, strictPort: true, fs: { allow: ['../..'] } },
});
