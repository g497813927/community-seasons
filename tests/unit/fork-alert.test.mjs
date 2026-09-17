import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const page = fs.readFileSync(new URL("../../src/app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let alert;
const cueHeadings = [], cueDeclarations = new Map();
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(
    (prop) => ts.isJsxAttribute(prop) && prop.name.text === "className" &&
      prop.initializer?.text === "fork-announcement sr-only",
  )) alert = node.getText(ast);
  if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(
    (prop) => ts.isJsxAttribute(prop) && prop.name.text === "className" &&
      prop.getText(ast).includes("fork-direction-cue"),
  )) cueHeadings.push(node);
  if (ts.isVariableDeclaration(node) && [
    "active", "speedBoosted", "forkBlockedDirection", "forkAhead", "forkCue",
  ].includes(node.name.getText(ast))) cueDeclarations.set(node.name.getText(ast), node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(alert, "test the production fork notice");
const context = vm.createContext({ React });
vm.runInContext(ts.transpileModule(
  `function renderAlert(forkBlockedDirection, speedBoosted, locale) {
    const l = (en, zh) => locale === 'zh-CN' ? zh : en;
    return (${alert});
  }`,
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText, context);
const render = (blocked, boosted, locale) => renderToStaticMarkup(context.renderAlert(blocked, boosted, locale));

assert.equal(cueHeadings.length, 2, "keyboard and touch footers both need scalable direction text");
assert.equal(cueDeclarations.size, 5, "exercise the production fork visibility and direction expressions");
context.Footprints = () => null;
vm.runInContext(ts.transpileModule(
  `function renderFooterCues(hud, game, locale) {
    const l = (en, zh) => locale === 'zh-CN' ? zh : en;
    const t = text => text;
    ${[...cueDeclarations.values()].map((declaration) => `const ${declaration};`).join("\n")}
    return [${cueHeadings.map((heading) => `(${heading.getText(ast)})`).join(",")}];
  }`,
  { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } },
).outputText, context);
const cueState = (blocked, boosted) => ({
  hud: { mode: "running", rail: null, distance: 100, boosts: { rush: boosted ? 1 : 0, headstart: 0, portal: 0 } },
  game: { current: { fork: { at: 150, blockedDirection: blocked } } },
});
const renderCues = (state, locale) => context.renderFooterCues(state.hud, state.game, locale).map(renderToStaticMarkup);

test("visible keyboard and touch direction cues live outside the game arena", () => {
  for (const heading of cueHeadings) {
    const ancestors = [];
    for (let node = heading.parent; node; node = node.parent) if (ts.isJsxElement(node)) ancestors.push(node);
    assert.ok(ancestors.some((node) => node.openingElement.tagName.getText(ast) === "footer"), "reuse the controls footer");
    assert.ok(!ancestors.some((node) => node.openingElement.tagName.getText(ast) === "section" &&
      node.openingElement.attributes.getText(ast).includes("arena")), "direction text must never overlay the canvas");
  }
});

test("both footers visibly name only the open direction in English and Chinese, with boost assistance", () => {
  for (const locale of ["en", "zh-CN"]) for (const boosted of [false, true]) {
    for (const [blocked, manual, automatic] of [
      [-1, ["Turn right →", "向右转 →"], ["Auto-turn right →", "自动右转 →"]],
      [1, ["← Turn left", "← 向左转"], ["← Auto-turn left", "← 自动左转"]],
    ]) {
      const expected = (boosted ? automatic : manual)[locale === "en" ? 0 : 1];
      for (const html of renderCues(cueState(blocked, boosted), locale)) {
        assert.ok(html.includes("fork-direction-cue"));
        assert.ok(!html.includes("sr-only"), "the footer cue must remain visible to sighted players");
        assert.ok(html.includes(expected), `${locale}: expected ${expected}`);
        assert.ok(!html.includes(blocked === -1 ? "←" : "→"), "do not suggest the dead-end direction");
      }
    }
    for (const html of renderCues(cueState(undefined, boosted), locale)) {
      assert.ok(html.includes(locale === "en" ? "← Left or right →" : "← 向左或向右 →"));
    }
  }
});

test("the ordinary control headings return whenever no running fork is ahead", () => {
  for (const locale of ["en", "zh-CN"]) for (const inactive of ["no fork", "distant fork", "paused", "railway"]) {
    const state = cueState(-1, true);
    if (inactive === "no fork") state.game.current.fork = null;
    if (inactive === "distant fork") state.game.current.fork.at = state.hud.distance + 135;
    if (inactive === "paused") state.hud.mode = "paused";
    if (inactive === "railway") state.hud.rail = {};
    const headings = renderCues(state, locale);
    assert.ok(headings[0].includes("MAKE YOUR MOVE"), `${inactive}: keyboard heading is restored`);
    assert.ok(headings[1].includes("SWIPE TO MOVE"), `${inactive}: touch heading is restored`);
    for (const html of headings) assert.ok(!html.includes("fork-direction-cue"), `${inactive}: no stale direction cue`);
  }
});

test("fork direction remains available to screen readers without a visible toast, in both languages", () => {
  for (const locale of ["en", "zh-CN"]) for (const boosted of [false, true]) {
    for (const [blocked, heading, autoHeading, deadEnd] of [
      [-1, ["Take the right lane", "请选择右侧跑道"], ["Boost automatically turns right", "加速将自动向右转"], ["Left dead end", "左路不通"]],
      [1, ["Take the left lane", "请选择左侧跑道"], ["Boost automatically turns left", "加速将自动向左转"], ["Right dead end", "右路不通"]],
    ]) {
      const html = render(blocked, boosted, locale), language = locale === "en" ? 0 : 1;
      assert.ok(html.includes((boosted ? autoHeading : heading)[language]));
      assert.ok(html.includes(deadEnd[language]), "closure must be described without relying on color");
      assert.ok(html.includes('class="fork-announcement sr-only"'), "announcement must not cover gameplay");
      assert.ok(html.includes('aria-live="polite"'));
      assert.ok(html.includes('aria-atomic="true"'));
      assert.ok(!html.includes("<svg"), "a screen-reader announcement needs no visual arrows");
      assert.ok(!html.includes("defaults left"), "single-open forks must not advertise an unavailable default");
    }
  }
  assert.ok(!page.includes('className="fork-alert"'), "remove the visual fork toast entirely");
  const css = fs.readFileSync(new URL("../../src/components/rail-quiz.css", import.meta.url), "utf8");
  assert.ok(!css.includes(".fork-alert"), "remove unused fork toast styles in all viewport rules");
});

test("both-open forks retain the left/right choice and boost override guidance", () => {
  for (const locale of ["en", "zh-CN"]) for (const boosted of [false, true]) {
    const html = render(undefined, boosted, locale);
    assert.ok(html.includes('class="fork-announcement sr-only"'));
    assert.ok(html.includes(locale === "en"
      ? boosted ? "You can still choose right" : "Take the left or right lane"
      : boosted ? "仍可选择右侧" : "选择左侧或右侧跑道"));
  }
});

test("both directional dead-end reasons have matching Chinese explanations", async () => {
  const source = fs.readFileSync(new URL("../../src/lib/game/i18n.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const { translate } = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
  for (const [reason, translated] of [
    ["The left branch is a dead end. Take the right branch at this fork.", "左侧是断头路。请在这个岔口选择右侧分支。"],
    ["The right branch is a dead end. Take the left branch at this fork.", "右侧是断头路。请在这个岔口选择左侧分支。"],
  ]) {
    assert.equal(translate("en", reason), reason);
    assert.equal(translate("zh-CN", reason), translated);
  }
});
