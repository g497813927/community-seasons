import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { compileGameModules } from "../helpers/compile-game-modules.mjs";

const folder = new URL("./cloud-save-dialog-compiled/", import.meta.url);
const entries = ["boosts", "cosmetics", "i18n", "scenes", "skins", "store"];
compileGameModules(folder, { entries });
const modules = new Map(await Promise.all(entries.map(async (entry) => [
  `@/lib/game/${entry}`, await import(new URL(`${entry}.mjs`, folder)),
])));
const { createProgress } = modules.get("@/lib/game/store");
const { SKINS } = modules.get("@/lib/game/skins");
const { ACCESSORIES } = modules.get("@/lib/game/cosmetics");
const require = createRequire(new URL("../../src/package.json", import.meta.url));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
// Render the complete production dialog. Replace only the browser portal shell
// and generic button with server-renderable elements; all comparison logic,
// catalog names, translations, details and consequences come from real source.
const shell = (tag) => ({ children, className, lang }) => React.createElement(tag, { className, lang }, children);
const surfaces = {
  Dialog: ({ open, children }) => open ? children : null,
  DialogContent: shell("div"),
  DialogDescription: shell("p"),
  DialogHeader: shell("header"),
  DialogTitle: shell("h2"),
};
const context = vm.createContext({
  exports: {},
  require(specifier) {
    if (modules.has(specifier)) return modules.get(specifier);
    if (specifier === "@/components/ui/dialog") return surfaces;
    if (specifier === "@/components/ui/button") return {
      Button: ({ children, disabled }) => React.createElement("button", { disabled }, children),
    };
    if (specifier.endsWith(".css")) return {};
    return require(specifier);
  },
});
const source = fs.readFileSync(new URL("../../src/components/cloud-save-dialog.tsx", import.meta.url), "utf8");
vm.runInContext(ts.transpileModule(source, {
  fileName: "cloud-save-dialog.tsx",
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { CloudSaveDialog } = context.exports;
const snapshot = (fields = {}) => ({
  version: 1, best: 42, scene: "spring", progress: { ...createProgress(), ...fields },
});
const render = (locale, localSnapshot, cloudSnapshot) => renderToStaticMarkup(React.createElement(CloudSaveDialog, {
  open: true, locale, localSnapshot, cloudSnapshot, busy: false,
  onUseLocal() {}, onUseCloud() {}, onStayLocal() {},
}));
const rowValues = (html, label) => {
  const table = html.match(/<table\b[^>]*class="cloud-save-comparison"[^>]*>([\s\S]*?)<\/table>/)?.[1];
  assert.ok(table, "the production comparison must remain visible outside collapsed details");
  const row = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((match) => match[1])
    .find((text) => text.includes(`<th scope="row">${label}</th>`));
  assert.ok(row, `missing comparison row ${label}`);
  return [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
};
const names = {
  en: {
    skins: ["Classic TV", "Blossom TV", "Ocean TV", "Amber TV", "Frost TV"],
    accessories: ["Trail Cap", "Golden Crown", "Little Sprout", "Canvas Sneakers", "Explorer Boots", "Roller Skates", "Sparkle Trail", "Petal Drift", "Star Orbit"],
    ownedSkins: "Owned skins", skin: "Equipped skin", ownedAccessories: "Owned accessories",
    hat: "Equipped hat", shoes: "Equipped shoes", effect: "Equipped effect",
    empty: ["None", "No hat", "Default shoes", "No effect"],
  },
  "zh-CN": {
    skins: ["经典小电视", "樱花小电视", "海洋小电视", "琥珀小电视", "冰霜小电视"],
    accessories: ["旅途鸭舌帽", "金色王冠", "小小嫩芽", "帆布运动鞋", "探险短靴", "轮滑鞋", "闪光足迹", "飞舞花瓣", "环绕星光"],
    ownedSkins: "已拥有皮肤", skin: "已装备皮肤", ownedAccessories: "已拥有饰品",
    hat: "已装备帽子", shoes: "已装备鞋子", effect: "已装备特效",
    empty: ["暂无", "不戴帽子", "默认鞋子", "无特效"],
  },
};

for (const locale of ["en", "zh-CN"]) {
  const n = names[locale];
  const join = (values) => values.join(locale === "en" ? ", " : "、");

  test(`${locale}: skin ownership alone distinguishes otherwise identical saves`, () => {
    const html = render(locale, snapshot({ ownedSkins: ["classic", "blossom"] }), snapshot({ ownedSkins: ["classic", "ocean"] }));
    assert.deepEqual(rowValues(html, n.ownedSkins), [join([n.skins[0], n.skins[1]]), join([n.skins[0], n.skins[2]])]);
    assert.deepEqual(rowValues(html, n.skin), [n.skins[0], n.skins[0]]);
    assert.deepEqual(rowValues(html, locale === "en" ? "Coins" : "金币"), ["0", "0"]);
  });

  test(`${locale}: equal accessory counts show different owned names before expanding details`, () => {
    const html = render(locale, snapshot({ ownedAccessories: ["cap"] }), snapshot({ ownedAccessories: ["crown"] }));
    assert.deepEqual(rowValues(html, n.ownedAccessories), [n.accessories[0], n.accessories[1]]);
    assert.deepEqual(rowValues(html, n.hat), [n.empty[1], n.empty[1]]);
  });

  test(`${locale}: equipment-only conflicts expose each independently equipped slot`, () => {
    const owned = { ownedSkins: SKINS.map(({ id }) => id), ownedAccessories: ACCESSORIES.map(({ id }) => id) };
    for (const [field, value, label, expected, fallback] of [
      ["equippedSkin", "frost", n.skin, n.skins[4], n.skins[0]],
      ["hat", "sprout", n.hat, n.accessories[2], n.empty[1]],
      ["shoes", "boots", n.shoes, n.accessories[4], n.empty[2]],
      ["effect", "orbit", n.effect, n.accessories[8], n.empty[3]],
    ]) {
      const local = snapshot(owned);
      if (field === "equippedSkin") local.progress.equippedSkin = value;
      else local.progress.outfit[field] = value;
      const html = render(locale, local, snapshot(owned));
      assert.deepEqual(rowValues(html, label), [expected, fallback]);
      assert.equal(rowValues(html, n.ownedSkins)[0], rowValues(html, n.ownedSkins)[1]);
      assert.equal(rowValues(html, n.ownedAccessories)[0], rowValues(html, n.ownedAccessories)[1]);
    }
  });

  test(`${locale}: every cosmetic is named in visible ownership rows and expanded details`, () => {
    const local = snapshot({ ownedSkins: SKINS.map(({ id }) => id), ownedAccessories: ACCESSORIES.map(({ id }) => id) });
    const html = render(locale, local, snapshot());
    assert.deepEqual(rowValues(html, n.ownedSkins), [join(n.skins), n.skins[0]]);
    assert.deepEqual(rowValues(html, n.ownedAccessories), [join(n.accessories), n.empty[0]]);
    const details = html.match(/<details\b[^>]*>([\s\S]*?)<\/details>/)?.[1];
    assert.ok(details);
    for (const name of [...n.skins, ...n.accessories]) assert.ok(details.includes(name), `missing ${name} from ${locale} details`);
  });

  test(`${locale}: migrated defaults and first upload show the classic skin and empty slots`, () => {
    const html = render(locale, snapshot(), null);
    for (const [label, value] of [
      [n.ownedSkins, n.skins[0]], [n.skin, n.skins[0]], [n.ownedAccessories, n.empty[0]],
      [n.hat, n.empty[1]], [n.shoes, n.empty[2]], [n.effect, n.empty[3]],
    ]) assert.deepEqual(rowValues(html, label), [value]);
    assert.ok(html.includes(locale === "en" ? "Upload this device save" : "上传本机存档"));
    assert.ok(!html.includes(locale === "en" ? "Use cloud save" : "使用云存档"));
  });

  test(`${locale}: both replacement and upload consequences disclose cosmetics`, () => {
    for (const cloud of [snapshot(), null]) {
      const html = render(locale, snapshot(), cloud);
      const consequence = html.match(/<p class="cloud-save-consequence">([\s\S]*?)<\/p>/)?.[1];
      assert.ok(consequence);
      for (const phrase of locale === "en" ? ["owned skins and accessories", "equipped outfit"] : ["已拥有的皮肤与饰品", "当前装扮"]) {
        assert.ok(consequence.includes(phrase), `missing ${phrase}`);
      }
    }
  });
}
