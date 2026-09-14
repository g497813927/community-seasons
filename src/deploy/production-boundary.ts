import type { Plugin } from "vite";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const testHook =
  /__phoneQA|__journey(?:Run|Engine)|__qaCloud|qa-iphone-\d+|qa-suite\.js|(?:engine|render)-qa\.[jt]s|mock-toy-sdk/;
const queryControl =
  /\bURLSearchParams\b|\blocation\s*(?:\.\s*(?:search|hash)\b|\[\s*["'`](?:search|hash)["'`]\s*\])|\.\s*searchParams\b/;

export function assertProductionCode(code: string, name: string, firstParty = false) {
  if (testHook.test(code)) throw new Error(`Test-only hooks cannot ship in ${name}.`);
  // Scene selection and gameplay parameters come from the saved game and
  // earned travel, never from query/hash overrides. Toy host/path detection
  // is deliberately allowed and continues to use the real cloud provider.
  if (firstParty && queryControl.test(code))
    throw new Error(`URL-controlled gameplay is not allowed in ${name}.`);
}

export function productionBoundary(appRoot: string): Plugin {
  const root = appRoot.replaceAll("\\", "/").replace(/\/$/, "");
  return {
    name: "production-boundary",
    enforce: "pre",
    buildStart() {
      assertProductionCode(readFileSync(`${root}/index.html`, "utf8"), "index.html");
      const folders = [`${root}/public`];
      while (folders.length) {
        const folder = folders.pop()!;
        if (!existsSync(folder)) continue;
        for (const entry of readdirSync(folder, { withFileTypes: true })) {
          const path = `${folder}/${entry.name}`;
          if (entry.isDirectory()) folders.push(path);
          else {
            if (/^(?:qa-suite|probe)\.js$/.test(entry.name))
              throw new Error(`Test script cannot ship: ${path}`);
            if (/\.(?:html|js)$/.test(entry.name))
              assertProductionCode(readFileSync(path, "utf8"), path);
          }
        }
      }
    },
    transform(code, id) {
      const path = id.split("?")[0].replaceAll("\\", "/");
      if (
        !path.startsWith(`${root}/`) &&
        /\/work\/(?:iphone-qa|journey-browser|cloud-browser|community-tests)(?:\/|$)/.test(path)
      )
        throw new Error(`Test workspace imports cannot ship: ${path}`);
      if (
        path.startsWith(`${root}/`) &&
        !path.includes("/node_modules/") &&
        /\.[jt]sx?$/.test(path)
      )
        assertProductionCode(code, path, true);
    },
    generateBundle(_options, bundle) {
      for (const [name, item] of Object.entries(bundle)) {
        if (/^(?:qa-suite|probe)\.js$/.test(name))
          throw new Error(`Test script cannot ship: ${name}`);
        if (item.type === "chunk") assertProductionCode(item.code, name);
        else if (/\.(?:html|js)$/.test(name) && typeof item.source === "string")
          assertProductionCode(item.source, name);
      }
    },
  };
}
