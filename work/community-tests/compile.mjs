import fs from "node:fs";
import ts from "typescript";
const dir = new URL("./compiled/", import.meta.url);
fs.mkdirSync(dir, { recursive: true });
for (const name of [
  "scenes",
  "boosts",
  "railway",
  "engine",
  "rail-transition",
  "travel-colors",
  "store",
  "community",
  "render",
]) {
  const source = fs.readFileSync(
    new URL(`../../outputs/community-seasons/lib/game/${name}.ts`, import.meta.url),
    "utf8",
  );
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replace(/from ["'](\.\/[a-z-]+)["']/g, "from '$1.mjs'");
  const temporary = new URL(`${name}-${process.pid}.tmp`, dir);
  fs.writeFileSync(temporary, compiled);
  fs.renameSync(temporary, new URL(`${name}.mjs`, dir));
}
