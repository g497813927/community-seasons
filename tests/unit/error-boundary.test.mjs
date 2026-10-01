import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { compileGameModules } from "../helpers/compile-game-modules.mjs";

const folder = new URL("./error-boundary-compiled/", import.meta.url);
compileGameModules(folder, { entries: ["i18n"] });
const i18n = await import(new URL("i18n.mjs", folder));
const require = createRequire(new URL("../../src/package.json", import.meta.url));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
// The report reads page and device details from browser globals. The query
// string carries a fake token to prove the report never includes it.
const context = vm.createContext({
  exports: {},
  require(specifier) {
    if (specifier === "@/lib/game/i18n") return i18n;
    return require(specifier);
  },
  location: { origin: "https://toy.example", pathname: "/toy/community-seasons/", search: "?token=secret" },
  navigator: { userAgent: "TestBrowser/1.0", languages: ["en-US"] },
  innerWidth: 390,
  innerHeight: 844,
  devicePixelRatio: 3,
});
const source = fs.readFileSync(new URL("../../src/components/error-boundary.tsx", import.meta.url), "utf8");
vm.runInContext(ts.transpileModule(source, {
  fileName: "error-boundary.tsx",
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { ErrorBoundary } = context.exports;

// Server rendering cannot trigger an error boundary, so drive the production
// lifecycle directly: catch an error the way React does, then render the screen.
function crash(locale) {
  const error = vm.runInContext('new Error("Canvas 2D context is unavailable.")', context);
  const boundary = new ErrorBoundary({ children: null });
  boundary.state = { ...boundary.state, ...ErrorBoundary.getDerivedStateFromError(error), locale };
  boundary.setState = (update) => { boundary.state = { ...boundary.state, ...update }; };
  boundary.componentDidCatch(error, { componentStack: "\n    at Home\n    at ErrorBoundary" });
  return renderToStaticMarkup(boundary.render());
}

test("crash screen renders one language with a toggle to the other", { concurrency: false }, (t) => {
  // componentDidCatch logs the failure; keep test output quiet.
  t.mock.method(console, "error", () => {});
  const en = crash("en");
  assert.match(en, /<main class="crash-screen" lang="en">/);
  assert.match(en, /<h1 id="crash-title">Something went wrong<\/h1>/);
  assert.match(en, /<button type="button" class="crash-reload">Reload<\/button>/);
  assert.match(en, /<button type="button" class="crash-locale" lang="zh-CN" aria-label="切换到中文">中文<\/button>/);
  assert.doesNotMatch(en, /出了点问题/);

  const zh = crash("zh-CN");
  assert.match(zh, /<main class="crash-screen" lang="zh-CN">/);
  assert.match(zh, /<h1 id="crash-title">出了点问题<\/h1>/);
  assert.match(zh, /<button type="button" class="crash-reload">重新加载<\/button>/);
  assert.match(zh, /<button type="button" class="crash-locale" lang="en" aria-label="Switch to English">English<\/button>/);
  assert.doesNotMatch(zh, /Something went wrong/);
});

test("error report names the failure and its context without the query string", { concurrency: false }, (t) => {
  t.mock.method(console, "error", () => {});
  for (const locale of ["en", "zh-CN"]) {
    const html = crash(locale);
    const report = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/)?.[1];
    assert.ok(report, "the error report must render");
    // The report stays in English for the developer whichever locale is shown.
    assert.match(html, /<pre lang="en" tabindex="0" role="region"/);
    assert.match(report, /^Error: Canvas 2D context is unavailable\./);
    assert.match(report, /Page: https:\/\/toy\.example\/toy\/community-seasons\//);
    assert.match(report, /Browser: TestBrowser\/1\.0/);
    assert.match(report, /Viewport: 390×844 @3x/);
    assert.match(report, /Component stack:\nat Home\n    at ErrorBoundary/);
    assert.doesNotMatch(report, /token|secret/);
  }
});
