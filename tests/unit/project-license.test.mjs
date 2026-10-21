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

test("vendored CSS attribution is embedded verbatim and refreshed from the same build snapshot", (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "community-seasons-vendored-license-"));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const licensePath = path.join(folder, "LICENSE");
  const stylesheetPath = path.join(folder, "ui-state-variants.css");
  const original = fs.readFileSync(new URL("../../src/app/ui-state-variants.css", import.meta.url), "utf8");
  const expected = original.match(/^\/\*!([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, "").trim() + "\n";
  assert.ok(expected.includes("Copyright (c) 2023 shadcn"));
  assert.ok(expected.includes("Permission is hereby granted"));
  assert.ok(expected.includes('THE SOFTWARE IS PROVIDED "AS IS"'));
  fs.writeFileSync(licensePath, "Project notice\n");
  fs.writeFileSync(stylesheetPath, original);
  const plugin = projectLicense(licensePath, stylesheetPath);
  const watched = [];
  const context = { addWatchFile(file) { watched.push(file); }, emitFile() {} };

  plugin.buildStart.call(context);
  fs.writeFileSync(stylesheetPath, "/*! Updated vendored notice */\n");
  let tags = plugin.transformIndexHtml();
  assert.equal(tags[0].children, "Project notice\n");
  assert.deepEqual(tags[1], {
    tag: "script",
    attrs: { type: "text/plain", id: "ui-state-variants-license" },
    children: expected,
    injectTo: "head",
  });

  plugin.buildStart.call(context);
  tags = plugin.transformIndexHtml();
  assert.equal(tags[1].children, "Updated vendored notice\n");
  assert.ok(watched.includes(stylesheetPath));
  fs.writeFileSync(stylesheetPath, "@custom-variant data-open;\n");
  assert.throws(() => plugin.buildStart.call(context), /must start with its license notice/);
});
