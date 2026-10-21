import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const source = fs.readFileSync(new URL("../../src/app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const fragments = new Map();
let changeLeaderboard;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "changeLeaderboard") {
    changeLeaderboard = node.getText(ast);
  }
  const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
  if (opening) {
    const tag = opening.tagName.getText(ast);
    const className = opening.attributes.properties.find((attribute) =>
      ts.isJsxAttribute(attribute) && attribute.name.text === "className")?.initializer?.text;
    const key = ["CloudSaveStatus", "CloudSaveDialog", "LeaderboardDialog"].includes(tag) ? tag
      : className === "leaderboard-launcher" ? "home"
        : className === "run-button leaderboard-result-launcher" ? "result" : null;
    if (key) {
      // Keep the production condition surrounding each surface, if any. The
      // tests render real JSX rather than matching the spelling of its guard.
      let expression = node;
      while (expression.parent && (ts.isParenthesizedExpression(expression.parent) ||
        ts.isBinaryExpression(expression.parent) || ts.isJsxExpression(expression.parent))) {
        expression = expression.parent;
      }
      fragments.set(key, ts.isJsxExpression(expression) ? expression.expression.getText(ast) : expression.getText(ast));
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(fragments.size, 5, "exercise both launchers and every Toy account surface");
assert.ok(changeLeaderboard, "exercise the production leaderboard action");

const compile = (text) => ts.transpileModule(text, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
function surfaceContext(onToy, locale) {
  const marker = (name) => () => React.createElement("div", { "data-surface": name });
  const context = vm.createContext({
    React, onToy, locale, l: (en, zh) => locale === "zh-CN" ? zh : en,
    Button: ({ children, className }) => React.createElement("button", { className }, children),
    Trophy: () => null,
    CloudSaveStatus: marker("cloud-status"), CloudSaveDialog: marker("cloud-conflict"),
    LeaderboardDialog: marker("leaderboard"),
    changeLeaderboard() {}, chooseCloudSave() {}, retryCloudSave() {},
    cloudState: { status: "conflict", conflict: { local: {}, cloud: {} } },
    cloudLabel: "", cloudError: null, cloudBusy: false,
    viewport: { width: 375 }, navigator: { userAgent: "test" }, shouldSuggestBilibili: () => false,
    graphicsReady: true, hud: { mode: "ready" }, startAfterCloudRef: { current: false },
    storeOpen: false, setupOpen: false, guideOpen: false, licensesOpen: false, helpOpen: false,
    leaderboardOpen: true, leaderboardButtonRef: { current: null },
    loadLeaderboard: { current() {} }, leaderboardParticipation: { current: { decline() {} } },
    rankConsented: false, rankPreference: "disabled", rankedReceipt: null, rankEligibility: "ready",
    joinLeaderboard() {},
  });
  for (const [key, expression] of fragments) {
    context[key] = vm.runInContext(compile(`(${expression})`), context);
  }
  return context;
}

for (const locale of ["en", "zh-CN"]) {
  test(`${locale}: standalone pages omit account controls even with stale conflict or open state`, () => {
    const context = surfaceContext(false, locale);
    for (const key of fragments.keys()) assert.equal(renderToStaticMarkup(context[key]), "", key);
  });

  test(`${locale}: Toy retains home/result leaderboard buttons and account dialogs`, () => {
    const context = surfaceContext(true, locale);
    assert.ok(renderToStaticMarkup(context.home).includes(locale === "en" ? "Leaderboard" : "排行榜"));
    assert.ok(renderToStaticMarkup(context.result).includes(locale === "en" ? "Join leaderboard" : "参与排行榜"));
    for (const key of ["CloudSaveStatus", "CloudSaveDialog", "LeaderboardDialog"]) {
      assert.ok(renderToStaticMarkup(context[key]).includes("data-surface"), key);
    }
  });
}

function actionContext(onToy, mode) {
  const context = vm.createContext({ onToy, game: { current: { mode, review: null } } });
  for (const key of ["shareOpenRef", "licensesOpenRef", "helpOpenRef", "storeOpenRef", "setupOpenRef",
    "guideOpenRef", "startAfterCloudRef", "rotateRequiredRef", "leaderboardOpenRef"]) {
    context[key] = { current: false };
  }
  for (const key of ["swipeRef", "lastTapRef", "lastRailUpRef", "leaderboardButtonRef"]) {
    context[key] = { current: "untouched" };
  }
  context.setLeaderboardOpen = (open) => { context.open = open; };
  vm.runInContext(compile(changeLeaderboard), context);
  return context;
}

test("standalone leaderboard actions cannot open a dialog or consume gameplay input", () => {
  for (const mode of ["ready", "over"]) {
    const context = actionContext(false, mode);
    context.changeLeaderboard(true, {});
    assert.equal(context.open, undefined);
    assert.equal(context.leaderboardOpenRef.current, false);
    for (const key of ["swipeRef", "lastTapRef", "lastRailUpRef", "leaderboardButtonRef"]) {
      assert.equal(context[key].current, "untouched");
    }
  }
});

test("Toy leaderboard opens at home and after a run, preserves focus target, and still closes", () => {
  for (const mode of ["ready", "over"]) {
    const context = actionContext(true, mode), trigger = {};
    context.changeLeaderboard(true, trigger);
    assert.equal(context.open, true);
    assert.equal(context.leaderboardOpenRef.current, true);
    assert.equal(context.leaderboardButtonRef.current, trigger);
    for (const key of ["swipeRef", "lastTapRef", "lastRailUpRef"]) assert.equal(context[key].current, null);
    context.changeLeaderboard(false);
    assert.equal(context.open, false);
    assert.equal(context.leaderboardOpenRef.current, false);
  }
});
