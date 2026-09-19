import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
import { matrixBuildInfo } from './build-info.mjs';
import { MATRIX_CASES } from './cases';
import { REQUIREMENTS } from './stages';
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  base: './', publicDir: local('../../../src/public'),
  plugins: [matrixBuildInfo(local('../../../'), MATRIX_CASES, REQUIREMENTS), react()],
  resolve: { dedupe: ['react', 'react-dom'], alias: [
    { find: /^@\/lib\/game\/tools$/, replacement: local('./functional-tools.ts') },
    { find: /^@\/lib\/game\/toy-sdk$/, replacement: local('../preview/toy-sdk.ts') },
    { find: /^\.\/toy-sdk$/, replacement: local('../preview/toy-sdk.ts') },
    { find: '@', replacement: local('../../../src/') },
  ] },
  css: { postcss: { plugins: [tailwindcss({ base: local('../../../src/') })] } },
  server: { host: '127.0.0.1', port: 4176, strictPort: true, fs: { allow: [local('../../../')] } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022',
    rollupOptions: { input: { matrix: local('./index.html'), functional: local('./functional.html') } } },
});
