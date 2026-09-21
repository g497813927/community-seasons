import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { fileURLToPath } from "node:url";

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: /^@\/lib\/game\/toy-sdk$/, replacement: local("../preview/toy-sdk.ts") },
      { find: /^\.\/toy-sdk$/, replacement: local("../preview/toy-sdk.ts") },
      { find: "@", replacement: local("../../../src/") },
    ],
  },
  css: { postcss: { plugins: [tailwindcss({ base: local("../../../src/") })] } },
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
});
