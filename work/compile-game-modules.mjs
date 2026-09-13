import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const gameRoot = new URL("../outputs/community-seasons/lib/game/", import.meta.url);
const gameEntries = ["scenes", "boosts", "railway", "engine", "rail-transition", "travel-colors", "store", "community", "render"];
const portablePath = (file) => file.split(path.sep).join("/");

// Follow source imports so nested components, re-exports and their type inputs
// stay current without maintaining a second list of the game's module graph.
export function compileGameModules(outputRoot, { sourceRoot = gameRoot, entries = gameEntries } = {}) {
  const sourceDir = fileURLToPath(sourceRoot);
  const outputDir = fileURLToPath(outputRoot);
  const pending = entries.map((entry) => `${entry}.ts`);
  const sourceHashes = {};
  const visited = new Set();

  function resolveImport(file, specifier) {
    const base = path.resolve(sourceDir, path.dirname(file), specifier);
    const candidates = /\.ts$/.test(base) ? [base] : [`${base}.ts`, path.join(base, "index.ts")];
    const resolved = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!resolved) throw new Error(`Cannot resolve ${specifier} from ${file}`);
    const relative = path.relative(sourceDir, resolved);
    if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Game import leaves source root: ${specifier} from ${file}`);
    return relative;
  }

  for (let index = 0; index < pending.length; index++) {
    const file = pending[index];
    if (visited.has(file)) continue;
    visited.add(file);
    const source = fs.readFileSync(path.join(sourceDir, file), "utf8");
    sourceHashes[portablePath(file).replace(/\.ts$/, "")] = crypto.createHash("sha256").update(source).digest("hex");
    for (const { fileName } of ts.preProcessFile(source, true, true).importedFiles) {
      if (fileName.startsWith(".")) pending.push(resolveImport(file, fileName));
    }

    let compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: file,
    }).outputText;
    const parsed = ts.createSourceFile(file, compiled, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    const replacements = [];
    function visit(node) {
      const specifier = ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? node.arguments[0]
          : undefined;
      if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith(".")) {
        const target = resolveImport(file, specifier.text).replace(/\.ts$/, ".mjs");
        let relative = portablePath(path.relative(path.dirname(file), target));
        if (!relative.startsWith(".")) relative = `./${relative}`;
        replacements.push({ start: specifier.getStart(parsed) + 1, end: specifier.getEnd() - 1, text: relative });
      }
      ts.forEachChild(node, visit);
    }
    visit(parsed);
    for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
      compiled = compiled.slice(0, replacement.start) + replacement.text + compiled.slice(replacement.end);
    }
    const output = path.join(outputDir, file.replace(/\.ts$/, ".mjs"));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const temporary = `${output}-${process.pid}.tmp`;
    fs.writeFileSync(temporary, compiled);
    fs.renameSync(temporary, output);
  }
  return sourceHashes;
}
