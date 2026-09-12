import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import "./compile.mjs";
const { createRun } = await import("./compiled/engine.mjs");
const { createRailQuestionDeck } = await import("./compiled/railway.mjs");
const project = new URL("../../outputs/community-seasons/", import.meta.url);
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
const page = fs.readFileSync(new URL("app/page.tsx", project), "utf8");
const ast = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = [];
function visit(node) {
  if (
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some((d) =>
      ["railQuestionDeckRef", "game", "recordRef"].includes(d.name.getText(ast)),
    )
  )
    declarations.push(node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(declarations.length, 3);
const hook = compile(fs.readFileSync(new URL("lib/use-lazy-ref.ts", project), "utf8"))
  .replace(/^import.*;\n/m, "")
  .replace("export function", "function");
const records = compile(
  fs.readFileSync(new URL("lib/game/records.ts", project), "utf8"),
).replaceAll("export function", "function");
function mount() {
  const slots = [];
  let slot = 0,
    runCalls = 0,
    recordCalls = 0;
  const context = {
    createRailQuestionDeck,
    useRef: (initial) => slots[slot++] ?? (slots[slot - 1] = { current: initial }),
    createRun: () => {
      runCalls++;
      return createRun(4182);
    },
  };
  vm.createContext(context);
  vm.runInContext(
    hook +
      "\n" +
      records +
      "\nconst realRecordFactory=createRecordProgress; createRecordProgress=(best)=>{countRecord();return realRecordFactory(best)};\nfunction renderRefs(){" +
      compile(declarations.join("\n")) +
      ";return {game,recordRef}}",
    Object.assign(context, { countRecord: () => recordCalls++ }),
  );
  return {
    render() {
      slot = 0;
      return vm.runInContext("renderRefs()", context);
    },
    counts: () => ({ runCalls, recordCalls }),
  };
}
test("actual Home ref initialization creates one run and record across 200 HUD renders", () => {
  const m = mount(),
    first = m.render();
  for (let i = 0; i < 200; i++) {
    const next = m.render();
    assert.equal(next.game, first.game);
    assert.equal(next.recordRef, first.recordRef);
    assert.equal(next.game.current, first.game.current);
  }
  assert.deepEqual(m.counts(), { runCalls: 1, recordCalls: 1 });
  assert.equal(first.game.current.scene, "spring");
  assert.equal(first.game.current.mode, "ready");
});
test("replacing the run and loaded record survives HUD rerenders without rebuilding either", () => {
  const m = mount(),
    refs = m.render(),
    newRun = createRun(913, "winter"),
    savedRecord = { target: 3400, beaten: false, celebrateUntil: 0 };
  refs.game.current = newRun;
  refs.recordRef.current = savedRecord;
  newRun.mode = "running";
  newRun.coins = 25;
  for (let i = 0; i < 100; i++) {
    const next = m.render();
    assert.equal(next.game.current, newRun);
    assert.equal(next.recordRef.current, savedRecord);
  }
  assert.equal(refs.game.current.scene, "winter");
  assert.equal(refs.game.current.coins, 25);
  assert.deepEqual(m.counts(), { runCalls: 1, recordCalls: 1 });
});
test("a separate mounted game gets an independent initial run and record", () => {
  const a = mount(),
    b = mount(),
    first = a.render(),
    second = b.render();
  assert.notEqual(first.game.current, second.game.current);
  assert.notEqual(first.recordRef.current, second.recordRef.current);
  assert.deepEqual(a.counts(), { runCalls: 1, recordCalls: 1 });
  assert.deepEqual(b.counts(), { runCalls: 1, recordCalls: 1 });
});
