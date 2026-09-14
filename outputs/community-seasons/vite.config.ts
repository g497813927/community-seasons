import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { productionBoundary } from "./deploy/production-boundary";
import { projectLicense } from "./deploy/project-license";

export default defineConfig({
  base: "./",
  plugins: [
    productionBoundary(fileURLToPath(new URL(".", import.meta.url))),
    react(),
    projectLicense(fileURLToPath(new URL("../../LICENSE", import.meta.url))),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
});
