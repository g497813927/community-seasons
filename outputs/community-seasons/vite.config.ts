import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { productionBoundary } from "./deploy/production-boundary";

export default defineConfig({
  base: "./",
  plugins: [
    productionBoundary(fileURLToPath(new URL(".", import.meta.url))),
    react(),
    {
      name: "project-license",
      apply: "build",
      buildStart() {
        const licensePath = fileURLToPath(new URL("../../LICENSE", import.meta.url));
        this.addWatchFile(licensePath);
        this.emitFile({
          type: "asset",
          fileName: "LICENSE",
          source: readFileSync(licensePath),
        });
      },
    },
  ],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
});
