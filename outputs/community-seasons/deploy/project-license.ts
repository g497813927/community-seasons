import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

export function projectLicense(licensePath: string): Plugin {
  let notice: Buffer | undefined;

  return {
    name: "project-license",
    apply: "build",
    buildStart() {
      this.addWatchFile(licensePath);
      notice = readFileSync(licensePath);
      this.emitFile({ type: "asset", fileName: "LICENSE", source: notice });
    },
    transformIndexHtml() {
      if (!notice) throw new Error("Project license must be loaded before HTML generation.");
      // Toy does not serve standalone license files; retain the same notice in the page too.
      return [{
        tag: "script",
        attrs: { type: "text/plain", id: "project-license" },
        children: notice.toString("utf8"),
        injectTo: "head",
      }];
    },
  };
}
