import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

export function projectLicense(licensePath: string, vendoredStylesheetPath?: string): Plugin {
  let notice: Buffer | undefined;
  let vendoredNotice: string | undefined;

  return {
    name: "project-license",
    apply: "build",
    buildStart() {
      this.addWatchFile(licensePath);
      notice = readFileSync(licensePath);
      if (vendoredStylesheetPath) {
        this.addWatchFile(vendoredStylesheetPath);
        const stylesheet = readFileSync(vendoredStylesheetPath, "utf8");
        const comment = stylesheet.match(/^\/\*!([\s\S]*?)\*\//)?.[1];
        if (!comment?.trim()) throw new Error("Vendored stylesheet must start with its license notice.");
        vendoredNotice = comment.replace(/^ \* ?/gm, "").trim() + "\n";
      }
      this.emitFile({ type: "asset", fileName: "LICENSE", source: notice });
    },
    transformIndexHtml() {
      if (!notice) throw new Error("Project license must be loaded before HTML generation.");
      // Toy does not serve standalone license files; retain the same notice in the page too.
      const tags = [{
        tag: "script",
        attrs: { type: "text/plain", id: "project-license" },
        children: notice.toString("utf8"),
        injectTo: "head" as const,
      }];
      // Bundled CSS minification may discard comments after another stylesheet.
      // Keep the vendored notice in the HTML served by every production host.
      if (vendoredNotice) tags.push({
        tag: "script",
        attrs: { type: "text/plain", id: "ui-state-variants-license" },
        children: vendoredNotice,
        injectTo: "head",
      });
      return tags;
    },
  };
}
