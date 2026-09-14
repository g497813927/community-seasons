import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import "./compile.mjs";
const { createRun, update } = await import("./compiled/engine.mjs");
const { createProgress, readProgress, buyBooster, activateOwnedBooster } =
  await import("./compiled/store.mjs");
const { isSceneKind } = await import("./compiled/scenes.mjs");
const root = new URL("../../src/", import.meta.url);
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
const boundary = await import(
  "data:text/javascript;base64," +
    Buffer.from(
      compile(fs.readFileSync(new URL("deploy/production-boundary.ts", root), "utf8")),
    ).toString("base64")
);
const page = fs.readFileSync(new URL("app/page.tsx", root), "utf8");
const ast = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let hydration;
function visit(node) {
  if (ts.isIfStatement(node) && node.expression.getText(ast) === "!progressHydrated.current")
    hydration = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(hydration, "real production save initialization was not found");

test("actual first-launch initialization ignores scene/fresh/speed/debug query and hash overrides", () => {
  const urls = [
    "?scene=winter",
    "?scene=summer&fresh=1&debug=1&speed=999&invulnerable=true",
    "?test=1&qa=1&god=1&coins=99999#scene=autumn",
    "?scene=spring&locale=en&seed=7#debug=true",
  ];
  for (const saved of [null, "spring", "summer", "autumn", "winter"])
    for (const query of urls) {
      const progress = createProgress();
      progress.wallet = 243;
      const data = new Map([["community-seasons-progress-v1", JSON.stringify(progress)]]);
      if (saved) data.set("community-seasons-scene", saved);
      const location = new URL("https://www.bilibili.com/toy/preview/example/index.html" + query),
        game = { current: createRun() },
        sceneRef = { current: "spring" },
        progressRef = { current: createProgress() };
      const context = {
        location,
        window: { location },
        URL,
        URLSearchParams,
        localStorage: {
          getItem: (key) => data.get(key) ?? null,
          setItem() {
            assert.fail("query must not write or clear saved data");
          },
          clear() {
            assert.fail("fresh query cleared data");
          },
        },
        game,
        sceneRef,
        progressRef,
        progressHydrated: { current: false },
        localeRef: { current: "en" },
        savingRef: { current: true },
        document: { documentElement: {}, title: "" },
        translate: (_locale, text) => text,
        isSceneKind,
        readProgress,
        PROGRESS_KEY: "community-seasons-progress-v1",
      };
      vm.runInNewContext(compile(hydration), context);
      assert.equal(game.current.scene, saved ?? "spring");
      assert.equal(sceneRef.current, saved ?? "spring");
      assert.equal(progressRef.current.wallet, 243);
      assert.equal(progressRef.current.inventory.portal, 0);
      assert.equal(game.current.speed, 12);
      assert.equal(game.current.mode, "ready");
      assert.equal(game.current.boosts.grace, 0);
    }
});

test("production build rejects query controls, test globals, and QA workspace aliases", () => {
  for (const code of [
    'new URLSearchParams(location.search).get("scene")',
    'location["hash"]',
    'new URL(location.href).searchParams.get("speed")',
    "window.__phoneQA = {}",
    "window.__journeyRun = run",
  ])
    assert.throws(() => boundary.assertProductionCode(code, "main.tsx", true));
  const guard = boundary.productionBoundary(fileURLToPath(root));
  const deployedGuard = boundary.productionBoundary("/work/community-seasons");
  assert.doesNotThrow(() =>
    deployedGuard.transform(
      'export const scene = "spring";',
      "/work/community-seasons/lib/game/scenes.ts",
    ),
  );
  assert.throws(
    () =>
      guard.transform(
        'export {createRun} from "engine"',
        "/some/project/work/iphone-qa/engine-qa.ts",
      ),
    /Test workspace/,
  );
  assert.throws(
    () => guard.generateBundle({}, { "index.js": { type: "chunk", code: "window.__phoneQA={}" } }),
    /Test-only/,
  );
  assert.throws(
    () => guard.generateBundle({}, { "probe.js": { type: "asset", source: "" } }),
    /Test script/,
  );
  assert.doesNotThrow(() =>
    boundary.assertProductionCode(
      'isToyPage(window.location); localStorage.getItem("community-seasons-scene")',
      "page.tsx",
      true,
    ),
  );
});

test("public production source and built assets contain no QA entry points or URL gameplay controls", () => {
  const guard = boundary.productionBoundary(fileURLToPath(root));
  guard.buildStart();
  for (const folder of ["app", "lib", "components"]) {
    const files = fs.readdirSync(new URL(folder + "/", root), { recursive: true });
    for (const file of files.filter((file) => /\.[jt]sx?$/.test(file)))
      boundary.assertProductionCode(
        fs.readFileSync(new URL(folder + "/" + file, root), "utf8"),
        file,
        true,
      );
  }
  const files = fs.readdirSync(new URL("dist/", root), { recursive: true });
  assert.ok(
    files.some((file) => file.endsWith(".js")),
    "production bundle is missing",
  );
  for (const file of files) {
    assert.ok(!/(?:^|\/)(?:qa-suite|probe)\.js$/.test(file));
    if (/\.(html|js)$/.test(file))
      boundary.assertProductionCode(fs.readFileSync(new URL("dist/" + file, root), "utf8"), file);
  }
  const html = fs.readFileSync(new URL("dist/index.html", root), "utf8");
  assert.ok(!html.includes("/work/"));
  assert.ok(!html.includes("iphone-qa"));
});

test("production artifact includes the complete current project license", () => {
  const notice = fs.readFileSync(new URL("../LICENSE", root));
  assert.deepEqual(
    fs.readFileSync(new URL("dist/LICENSE", root)),
    notice,
    "distributed MIT notice must match the repository license verbatim",
  );
  const html = fs.readFileSync(new URL("dist/index.html", root), "utf8");
  const singleQuoted = html
    .replace('id="project-license"', "id='project-license'")
    .replace('type="text/plain"', "type='text/plain'");
  for (const document of [html, singleQuoted]) {
    const blocks = [...document.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
      .filter((match) => /(?:^|\s)id\s*=\s*(["'])project-license\1(?=\s|$)/.test(match[1]));
    assert.equal(blocks.length, 1, "HTML must retain the notice when a host omits standalone files");
    assert.match(blocks[0][1], /(?:^|\s)type\s*=\s*(["'])text\/plain\1(?=\s|$)/);
    assert.doesNotMatch(blocks[0][1], /(?:^|\s)src\s*=/);
    assert.equal(blocks[0][2], notice.toString("utf8"), "embedded notice must be complete and verbatim");
  }
});

test("legitimate purchased travel still charges coins and consumes a pass; missing passes cannot teleport", () => {
  const run = createRun(4182, "spring");
  run.mode = "running";
  let progress = createProgress();
  assert.equal(buyBooster(progress, "portal", "winter", "spring").ok, false);
  assert.equal(activateOwnedBooster(run, progress, "portal").ok, false);
  assert.equal(run.pendingScene, null);
  progress.wallet = 1200;
  const purchase = buyBooster(progress, "portal", "winter", "spring");
  assert.equal(purchase.ok, true);
  assert.equal(purchase.progress.wallet, 200);
  const result = activateOwnedBooster(run, purchase.progress, "portal");
  assert.equal(result.ok, true);
  assert.equal(result.progress.inventory.portal, 0);
  assert.equal(run.pendingScene, "winter");
  for (let i = 0; i < 25; i++) update(run, 0.05);
  assert.equal(run.scene, "winter");
});
