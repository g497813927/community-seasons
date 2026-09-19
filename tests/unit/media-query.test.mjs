import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../../src/lib/game/media-query.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { listenToMediaQuery } = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

for (const api of ["modern", "legacy", "incomplete-modern"]) {
  test(`media-query ${api} listeners follow preference changes and stop after cleanup`, () => {
    const listeners = new Set(), calls = [], values = [];
    const add = (kind, listener) => { calls.push(`add:${kind}`); listeners.add(listener); };
    const remove = (kind, listener) => {
      calls.push(`remove:${kind}`);
      assert.ok(listeners.delete(listener), "cleanup must remove the registered callback");
    };
    const query = {
      matches: false,
      addListener(listener) { add("legacy", listener); },
      removeListener(listener) { remove("legacy", listener); },
    };
    if (api !== "legacy") query.addEventListener = (event, listener) => {
      assert.equal(event, "change"); add("modern", listener);
    };
    if (api === "modern") query.removeEventListener = (event, listener) => {
      assert.equal(event, "change"); remove("modern", listener);
    };
    const update = () => values.push(query.matches);
    update();
    const stop = listenToMediaQuery(query, update);
    const change = (matches) => {
      query.matches = matches;
      for (const listener of listeners) listener({ matches });
    };
    change(true); change(false);
    assert.deepEqual(values, [false, true, false]);
    stop();
    change(true);
    assert.deepEqual(values, [false, true, false], "unmounted listener still responds");
    const expected = api === "modern" ? "modern" : "legacy";
    assert.deepEqual(calls, [`add:${expected}`, `remove:${expected}`]);
  });
}
