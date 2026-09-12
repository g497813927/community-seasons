import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { productionBoundary } from "./deploy/production-boundary";

export default defineConfig({
  base: "./",
  plugins: [productionBoundary(fileURLToPath(new URL(".", import.meta.url))), react()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
});
