import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const source = fs.readFileSync(
  new URL("../../src/deploy/project-license.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { projectLicense } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);

test("both license outputs use one snapshot per build and refresh on the next build", (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "community-seasons-license-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const licensePath = path.join(folder, "LICENSE");
  const first = "First project notice\n";
  const second = "Updated project notice\n";
  fs.writeFileSync(licensePath, first);
  const plugin = projectLicense(licensePath);
  const assets = [];
  const watched = [];
  const context = {
    addWatchFile(file) { watched.push(file); },
    emitFile(asset) { assets.push(asset); return String(assets.length); },
  };

  plugin.buildStart.call(context);
  // A change between hooks must not mix old standalone and new embedded notices.
  fs.writeFileSync(licensePath, second);
  assert.deepEqual(assets[0].source, Buffer.from(first));
  assert.equal(plugin.transformIndexHtml()[0].children, first);

  plugin.buildStart.call(context);
  assert.deepEqual(assets[1].source, Buffer.from(second));
  assert.equal(plugin.transformIndexHtml()[0].children, second);
  assert.ok(watched.includes(licensePath), "license edits must trigger watch rebuilds");
});
