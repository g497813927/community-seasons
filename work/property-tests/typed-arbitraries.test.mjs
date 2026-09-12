import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as fc from "fast-check";
import ts from "typescript";
const folder = new URL("./typed-arbitraries-compiled/", import.meta.url);
fs.mkdirSync(folder, { recursive: true });
const configPath = fileURLToPath(new URL("./typed-arbitraries.tsconfig.json", import.meta.url));
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  fileURLToPath(new URL("./", import.meta.url)),
);
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, parsed.options));
assert.equal(
  diagnostics.length,
  0,
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (n) => n,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  }),
);
const compile = (source) =>
  ts
    .transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(/from ["'](\.\/[a-z-]+)["']/g, "from '$1.mjs'");
fs.writeFileSync(
  new URL("helper.mjs", folder),
  compile(fs.readFileSync(new URL("./typed-arbitraries.ts", import.meta.url), "utf8")),
);
for (const name of ["scenes", "boosts", "railway", "community", "engine", "store", "cloud-save"])
  fs.writeFileSync(
    new URL(`${name}.mjs`, folder),
    compile(
      fs.readFileSync(
        new URL(`../../outputs/community-seasons/lib/game/${name}.ts`, import.meta.url),
        "utf8",
      ),
    ),
  );
const { validProgressArbitrary, validSaveArbitrary, invalidSaveArbitrary, inputCommandArbitrary } =
  await import("./typed-arbitraries-compiled/helper.mjs");
const { readProgress } = await import("./typed-arbitraries-compiled/store.mjs");
const { encodeCloudSave, decodeCloudSave, normalizeSaveSnapshot } =
  await import("./typed-arbitraries-compiled/cloud-save.mjs");
const rows = [];
const baseSeed = Number(process.env.FC_TYPED_SEED ?? 104729);
const numRuns = Number(process.env.FC_TYPED_RUNS ?? 1000);
function check(name, property, index) {
  let result;
  try {
    result = fc.check(property, {
      numRuns,
      seed: baseSeed + index,
      ...(process.env.FC_TYPED_PATH ? { path: process.env.FC_TYPED_PATH } : {}),
      interruptAfterTimeLimit: 10000,
      markInterruptAsFailure: true,
    });
  } catch (error) {
    // Generator and invalid-replay errors can escape fc.check before it returns
    // RunDetails. Record them explicitly instead of leaving a false passing row set.
    const row = {
      name,
      seed: baseSeed + index,
      runs: 0,
      shrinks: 0,
      failed: true,
      interrupted: false,
      exception: true,
      error: String(error),
    };
    rows.push(row);
    const replayPath = process.env.FC_TYPED_PATH;
    const quotedPath = replayPath?.replaceAll("'", "'\\''");
    fs.writeFileSync(
      new URL(`./typed-arbitraries-failure-${name}.json`, import.meta.url),
      JSON.stringify(
        {
          ...row,
          path: replayPath ?? null,
          counterexample: null,
          replay: `FC_TYPED_SEED=${baseSeed}${replayPath ? ` FC_TYPED_PATH='${quotedPath}'` : ""} node --test --test-name-pattern='${name}' work/property-tests/typed-arbitraries.test.mjs`,
        },
        null,
        2,
      ),
    );
    throw error;
  }
  const row = {
    name,
    seed: result.seed,
    runs: result.numRuns,
    shrinks: result.numShrinks,
    failed: result.failed,
    interrupted: result.interrupted,
  };
  rows.push(row);
  if (result.failed)
    fs.writeFileSync(
      new URL(`./typed-arbitraries-failure-${name}.json`, import.meta.url),
      JSON.stringify(
        {
          ...row,
          path: result.counterexamplePath,
          counterexample: fc.stringify(result.counterexample),
          error: String(result.errorInstance),
          replay: `FC_TYPED_SEED=${result.seed - index} FC_TYPED_PATH='${result.counterexamplePath}' node --test --test-name-pattern='${name}' work/property-tests/typed-arbitraries.test.mjs`,
        },
        null,
        2,
      ),
    );
  assert.equal(
    result.failed,
    false,
    fc.stringify(result.counterexample) + " " + result.errorInstance,
  );
  assert.equal(result.interrupted, false);
}
test("typed-valid-save-roundtrip", () =>
  check(
    "typed-valid-save-roundtrip",
    fc.property(validSaveArbitrary, (snapshot) => {
      const before = structuredClone(snapshot);
      assert.deepEqual(normalizeSaveSnapshot(snapshot), snapshot);
      assert.deepEqual(
        decodeCloudSave(encodeCloudSave(snapshot, "typed_factory")).payload,
        snapshot,
      );
      assert.deepEqual(snapshot, before);
    }),
    0,
  ));
test("typed-progress-coupling", () =>
  check(
    "typed-progress-coupling",
    fc.property(validProgressArbitrary, (p) => {
      assert.deepEqual(readProgress(JSON.stringify(p)), p);
      assert.equal(p.inventory.portal === 1, p.portalDestination !== null);
      if (p.equippedSkill) assert.equal(p.skills[p.equippedSkill].unlocked, true);
      assert.equal(p.levels.portal, 1);
    }),
    1,
  ));
test("typed-invalid-field-mutations-reject", () =>
  check(
    "typed-invalid-field-mutations-reject",
    fc.property(invalidSaveArbitrary, ({ snapshot, invalid }) => {
      const before = structuredClone(snapshot);
      assert.throws(
        () => normalizeSaveSnapshot(invalid),
        (e) => e.kind === "invalid-save",
      );
      assert.throws(
        () =>
          decodeCloudSave(JSON.stringify({ version: 1, revision: "typed_bad", payload: invalid })),
        (e) => ["invalid-save", "too-large"].includes(e.kind),
      );
      assert.deepEqual(snapshot, before);
    }),
    2,
  ));
test("typed-structured-commands-retain-contract", () =>
  check(
    "typed-structured-commands-retain-contract",
    fc.property(fc.array(inputCommandArbitrary, { maxLength: 30 }), (commands) => {
      for (const c of commands) {
        switch (c.kind) {
          case "movement":
            assert.ok(["left", "right", "jump", "slide"].includes(c.action));
            break;
          case "boost":
            assert.ok([1, 2, 3].includes(c.level));
            break;
          case "tick":
            assert.ok(Number.isFinite(c.seconds) && c.seconds >= 0);
            break;
          case "answer":
            assert.ok([-1, 0, 1].includes(c.lane));
            break;
          case "invalid-action":
            assert.equal(["left", "right", "jump", "slide"].includes(c.value), false);
            break;
          case "invalid-lane":
            assert.equal([-1, 0, 1].includes(c.value), false);
            break;
          case "invalid-level":
            assert.equal([1, 2, 3].includes(c.value), false);
            break;
          default:
            assert.fail("unknown discriminant");
        }
      }
    }),
    3,
  ));
process.on("exit", (exitCode) =>
  fs.writeFileSync(
    new URL("./typed-arbitraries-results.json", import.meta.url),
    JSON.stringify(
      {
        version: 1,
        framework: `fast-check ${fc.__version}`,
        typecheckPassed: true,
        status:
          exitCode === 0 && rows.length > 0 && rows.every((r) => !r.failed && !r.interrupted)
            ? "passed"
            : "failed",
        properties: rows,
        totalRuns: rows.reduce((n, r) => n + r.runs, 0),
      },
      null,
      2,
    ),
  ),
);
