import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(new URL("../../src/package.json", import.meta.url));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Production reads the locale from storage and the browser. Run the real i18n
// module in the same sandbox as the boundary so it reads these stand-ins, which
// each test configures; the query string carries a fake token to prove the
// report never includes it.
const storage = new Map();
const browser = { languages: ["en-US"], storageThrows: false };
const context = vm.createContext({
  location: { origin: "https://toy.example", pathname: "/toy/community-seasons/", search: "?token=secret" },
  navigator: {
    userAgent: "TestBrowser/1.0",
    get languages() { return browser.languages; },
    get language() { return browser.languages[0]; },
  },
  localStorage: {
    getItem(key) {
      if (browser.storageThrows) throw new Error("storage blocked");
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      if (browser.storageThrows) throw new Error("storage blocked");
      storage.set(key, String(value));
    },
  },
  document: { documentElement: { lang: "" } },
  innerWidth: 390,
  innerHeight: 844,
  devicePixelRatio: 3,
});
// Each module gets its own exports object, like a real CommonJS loader:
// compiled code reads its own exported constants back through `exports`.
function load(path, modules) {
  const source = fs.readFileSync(new URL(`../../src/${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: path.split("/").pop(),
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInContext(`(function (exports, require) {\n${outputText}\n})`, context)(
    exports, (specifier) => modules[specifier] ?? require(specifier));
  return exports;
}
const i18n = load("lib/game/i18n.ts", {});
const { ErrorBoundary } = load("components/error-boundary.tsx", { "@/lib/game/i18n": i18n });

function setBrowser({ languages = ["en-US"], saved = null, storageThrows = false } = {}) {
  storage.clear();
  if (saved !== null) storage.set(i18n.LOCALE_STORAGE_KEY, saved);
  browser.languages = languages;
  browser.storageThrows = storageThrows;
  context.document.documentElement.lang = "";
}

// Server rendering cannot trigger an error boundary, so drive the production
// lifecycle directly: catch an error the way React does, then render the screen.
// The locale is whatever the boundary itself derives.
function crash() {
  const error = vm.runInContext('new Error("Canvas 2D context is unavailable.")', context);
  const boundary = new ErrorBoundary({ children: null });
  boundary.setState = (update) => { boundary.state = { ...boundary.state, ...update }; };
  boundary.state = { ...boundary.state, ...ErrorBoundary.getDerivedStateFromError(error) };
  boundary.componentDidCatch(error, { componentStack: "\n    at Home\n    at ErrorBoundary" });
  return { boundary, html: () => renderToStaticMarkup(boundary.render()) };
}

const ENGLISH = {
  main: /<main class="crash-screen" lang="en">/,
  title: /<h1 id="crash-title">Something went wrong<\/h1>/,
  reload: /<button type="button" class="crash-reload">Reload<\/button>/,
  toggle: /<button type="button" class="crash-locale" lang="zh-CN" aria-label="切换到中文">中文<\/button>/,
  other: /出了点问题/,
};
const CHINESE = {
  main: /<main class="crash-screen" lang="zh-CN">/,
  title: /<h1 id="crash-title">出了点问题<\/h1>/,
  reload: /<button type="button" class="crash-reload">重新加载<\/button>/,
  toggle: /<button type="button" class="crash-locale" lang="en" aria-label="Switch to English">English<\/button>/,
  other: /Something went wrong/,
};
function assertScreen(html, expected) {
  for (const key of ["main", "title", "reload", "toggle"]) assert.match(html, expected[key]);
  assert.doesNotMatch(html, expected.other, "only one language is shown");
}

test("crash screen shows the language the game would have chosen", { concurrency: false }, (t) => {
  t.mock.method(console, "error", () => {});
  const cases = [
    [{ languages: ["en-US"] }, ENGLISH, "English browser"],
    [{ languages: ["zh-CN", "en"] }, CHINESE, "Chinese browser"],
    [{ languages: ["zh-TW"] }, CHINESE, "other Chinese variants map to Simplified Chinese"],
    [{ languages: ["fr-FR"] }, ENGLISH, "unsupported languages fall back to English"],
    [{ languages: ["en-US"], saved: "zh-CN" }, CHINESE, "the saved in-game choice wins over the browser"],
    [{ languages: ["zh-CN"], saved: "en" }, ENGLISH, "the saved in-game choice wins over the browser"],
    [{ languages: ["zh-CN"], storageThrows: true }, CHINESE, "blocked storage falls back to the browser"],
  ];
  for (const [browserSettings, expected, label] of cases) {
    setBrowser(browserSettings);
    const { boundary, html } = crash();
    assert.equal(boundary.state.locale, expected === CHINESE ? "zh-CN" : "en", label);
    assertScreen(html(), expected);
  }
});

test("language toggle switches the screen, the document language and the saved choice", { concurrency: false }, (t) => {
  t.mock.method(console, "error", () => {});
  setBrowser({ languages: ["en-US"] });
  const { boundary, html } = crash();
  assertScreen(html(), ENGLISH);

  boundary.toggleLocale();
  assertScreen(html(), CHINESE);
  assert.equal(context.document.documentElement.lang, "zh-CN");
  // Saved like the in-game switcher, so the reloaded game starts in Chinese.
  assert.equal(storage.get(i18n.LOCALE_STORAGE_KEY), "zh-CN");
  assert.equal(i18n.readInitialLocale(), "zh-CN");

  boundary.toggleLocale();
  assertScreen(html(), ENGLISH);
  assert.equal(context.document.documentElement.lang, "en");
  assert.equal(storage.get(i18n.LOCALE_STORAGE_KEY), "en");

  // A blocked store must not stop the screen from switching.
  browser.storageThrows = true;
  boundary.toggleLocale();
  assertScreen(html(), CHINESE);
});

test("error report names the failure and its context without the query string", { concurrency: false }, (t) => {
  t.mock.method(console, "error", () => {});
  for (const languages of [["en-US"], ["zh-CN"]]) {
    setBrowser({ languages });
    const markup = crash().html();
    const report = markup.match(/<pre[^>]*>([\s\S]*?)<\/pre>/)?.[1];
    assert.ok(report, "the error report must render");
    // The report stays in English for the developer whichever locale is shown.
    assert.match(markup, /<pre lang="en" tabindex="0" role="region"/);
    assert.match(report, /^Error: Canvas 2D context is unavailable\./);
    assert.match(report, /Page: https:\/\/toy\.example\/toy\/community-seasons\//);
    assert.match(report, /Browser: TestBrowser\/1\.0/);
    assert.match(report, /Viewport: 390×844 @3x/);
    assert.match(report, /Component stack:\nat Home\n    at ErrorBoundary/);
    assert.doesNotMatch(report, /token|secret/);
  }
});
