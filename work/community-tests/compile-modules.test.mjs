import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileGameModules } from "../compile-game-modules.mjs";

test("QA compiles and hashes live nested imports, re-exports and type dependencies", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "community-module-qa-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceRoot = pathToFileURL(path.join(root, "source/"));
  const write = (file, source) => {
    const target = new URL(file, sourceRoot);
    fs.mkdirSync(new URL("./", target), { recursive: true });
    fs.writeFileSync(target, source);
  };
  write("entry.ts", 'export { value, lazy } from "./render/scene";');
  write("render/scene.ts", 'import { offset } from "../shared"; import type { Point } from "./types"; export const value: Point = { x: offset + 2 }; export const lazy = () => import("./detail");');
  write("render/detail/index.ts", 'export const detail = "ready";');
  write("render/types.ts", "export type Point = { x: number };");
  write("shared.ts", "export const offset = 3;");
  write("shared.ts.orig", "This stale backup must never be compiled.");
  write("unused.ts", "This unrelated file must never be compiled.");

  const firstOutput = pathToFileURL(path.join(root, "first/"));
  const firstHashes = compileGameModules(firstOutput, { sourceRoot, entries: ["entry"] });
  const first = await import(new URL("entry.mjs", firstOutput));
  assert.deepEqual(first.value, { x: 5 });
  assert.equal((await first.lazy()).detail, "ready");
  assert.deepEqual(Object.keys(firstHashes).sort(), ["entry", "render/detail/index", "render/scene", "render/types", "shared"]);
  assert.equal(fs.existsSync(new URL("shared.ts.orig.mjs", firstOutput)), false);
  assert.equal(fs.existsSync(new URL("unused.mjs", firstOutput)), false);

  write("shared.ts", "export const offset = 7;");
  const secondOutput = pathToFileURL(path.join(root, "second/"));
  const secondHashes = compileGameModules(secondOutput, { sourceRoot, entries: ["entry"] });
  const second = await import(new URL("entry.mjs", secondOutput));
  assert.deepEqual(second.value, { x: 9 }, "QA loaded stale nested source");
  assert.notEqual(firstHashes.shared, secondHashes.shared);
  assert.equal(firstHashes["render/scene"], secondHashes["render/scene"]);
});
