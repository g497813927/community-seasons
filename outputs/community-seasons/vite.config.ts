import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { productionBoundary } from "./deploy/production-boundary";

const projectLicensePath = fileURLToPath(new URL("../../LICENSE", import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [
    productionBoundary(fileURLToPath(new URL(".", import.meta.url))),
    react(),
    {
      name: "project-license",
      apply: "build",
      buildStart() {
        this.addWatchFile(projectLicensePath);
        this.emitFile({
          type: "asset",
          fileName: "LICENSE",
          source: readFileSync(projectLicensePath),
        });
      },
      transformIndexHtml() {
        // Toy does not serve standalone license files; retain the notice in the page too.
        return [{
          tag: "script",
          attrs: { type: "text/plain", id: "project-license" },
          children: readFileSync(projectLicensePath, "utf8"),
          injectTo: "head",
        }];
      },
    },
  ],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
});
