import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../../src/lib/game/i18n.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { translate } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("outfit validation distinguishes invalid, wrong-category and locked selections in both languages", () => {
  for (const [message, chinese] of [
    ["Choose a TV skin from the store.", "请在商店中选择一款小电视皮肤。"],
    ["Choose an accessory from the store.", "请在商店中选择一款饰品。"],
    ["Choose an accessory category.", "请选择一个饰品分类。"],
    ["Choose an accessory for this category.", "请选择此分类的饰品。"],
    ["Unlock this skin before equipping it.", "请先解锁这款皮肤，再装备它。"],
    ["Unlock this accessory before equipping it.", "请先解锁这款饰品，再装备它。"],
  ]) {
    assert.equal(translate("en", message), message);
    assert.equal(translate("zh-CN", message), chinese);
  }
});
