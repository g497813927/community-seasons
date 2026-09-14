import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import * as fc from "fast-check";
import ts from "typescript";
const started = performance.now(),
  folder = new URL("./save-compiled/", import.meta.url),
  sourceHashes = {};
fs.mkdirSync(folder, { recursive: true });
for (const name of ["scenes", "boosts", "railway", "community", "engine", "store", "cloud-save"]) {
  const source = fs.readFileSync(
    new URL(`../../src/lib/game/${name}.ts`, import.meta.url),
    "utf8",
  );
  sourceHashes[name] = crypto.createHash("sha256").update(source).digest("hex");
  fs.writeFileSync(
    new URL(`${name}.mjs`, folder),
    ts
      .transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      })
      .outputText.replace(/from ["'](\.\/[a-z-]+)["']/g, "from '$1.mjs'"),
  );
}
const { readProgress, createProgress } = await import("./save-compiled/store.mjs");
const { normalizeSaveSnapshot, encodeCloudSave, decodeCloudSave } =
  await import("./save-compiled/cloud-save.mjs");
const max = Number.MAX_SAFE_INTEGER,
  scenes = ["spring", "summer", "autumn", "winter"],
  skills = ["shield", "magnet", "rush"],
  kinds = ["shield", "magnet", "rush", "headstart", "doubleCoins", "portal"];
const rows = [];
let propertyIndex = 0;
function writeResults(exitCode = 0) {
  fs.writeFileSync(
    new URL("./save-invalid-results.json", import.meta.url),
    JSON.stringify(
      {
        version: 1,
        framework: `fast-check ${fc.__version}`,
        status:
          exitCode === 0 && rows.length > 0 && rows.every((r) => !r.failed && !r.interrupted)
            ? "passed"
            : "failed",
        elapsedSeconds: (performance.now() - started) / 1000,
        sourceHashes,
        properties: rows,
        totalRuns: rows.reduce((n, r) => n + r.runs, 0),
      },
      null,
      2,
    ),
  );
}
function property(name, arbitraries, body, runs = 4000) {
  const index = propertyIndex++;
  test(name, { skip: !!process.env.FC_SAVE_CASE && process.env.FC_SAVE_CASE !== name }, () => {
    const seed = Number(process.env.FC_SAVE_SEED ?? 614209 + name.length * 17 + index);
    let details;
    try {
      details = fc.check(fc.property(...arbitraries, body), {
        numRuns: Number(process.env.FC_SAVE_RUNS ?? runs),
        seed,
        ...(process.env.FC_SAVE_PATH ? { path: process.env.FC_SAVE_PATH } : {}),
        interruptAfterTimeLimit: 10000,
        markInterruptAsFailure: true,
      });
    } catch (error) {
      const row = {
        name, seed, runs: 0, skips: 0, shrinks: 0,
        failed: true, interrupted: false, exception: true, error: String(error),
      };
      rows.push(row);
      const replayPath = process.env.FC_SAVE_PATH;
      const quotedPath = replayPath?.replaceAll("'", "'\\''");
      fs.writeFileSync(
        new URL(`./save-invalid-failure-${name}.json`, import.meta.url),
        JSON.stringify({
          ...row, path: replayPath ?? null, counterexample: null,
          replay: `FC_SAVE_CASE='${name}' FC_SAVE_SEED=${seed}${replayPath ? ` FC_SAVE_PATH='${quotedPath}'` : ""} node --test work/property-tests/save-invalid.test.mjs`,
        }, null, 2),
      );
      writeResults();
      throw error;
    }
    const row = {
      name,
      seed: details.seed,
      runs: details.numRuns,
      skips: details.numSkips,
      shrinks: details.numShrinks,
      failed: details.failed,
      interrupted: details.interrupted,
    };
    rows.push(row);
    if (details.failed) {
      const artifact = {
        ...row,
        path: details.counterexamplePath,
        counterexample: fc.stringify(details.counterexample),
        error: String(details.errorInstance),
        replay: `FC_SAVE_CASE='${name}' FC_SAVE_SEED=${details.seed} FC_SAVE_PATH='${details.counterexamplePath}' node --test work/property-tests/save-invalid.test.mjs`,
      };
      fs.writeFileSync(
        new URL(`./save-invalid-failure-${name}.json`, import.meta.url),
        JSON.stringify(artifact, null, 2),
      );
    }
    writeResults();
    assert.equal(
      details.failed,
      false,
      `${name}: seed ${details.seed}, path ${details.counterexamplePath}, ${fc.stringify(details.counterexample)}; ${details.errorInstance}`,
    );
    assert.equal(details.interrupted, false, "test time bound reached");
  });
}
const isCount = (n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
function validProgress(p) {
  assert.equal(p.version, 1);
  assert.ok(isCount(p.wallet));
  assert.deepEqual(Object.keys(p.inventory).sort(), [
    "doubleCoins",
    "headstart",
    "portal",
    "shield",
  ]);
  for (const n of Object.values(p.inventory)) assert.ok(isCount(n));
  assert.ok(p.inventory.portal <= 1);
  assert.equal(p.levels.portal, 1);
  assert.equal(p.inventory.portal === 1, p.portalDestination !== null);
  if (p.portalDestination !== null) assert.ok(scenes.includes(p.portalDestination));
  for (const k of kinds) assert.ok([1, 2, 3].includes(p.levels[k]));
  for (const k of skills) assert.equal(typeof p.skills[k].unlocked, "boolean");
  if (p.equippedSkill !== null) {
    assert.ok(skills.includes(p.equippedSkill));
    assert.equal(p.skills[p.equippedSkill].unlocked, true);
  }
  assert.deepEqual(readProgress(JSON.stringify(p)), p);
}
function validSnapshot(s) {
  assert.equal(s.version, 1);
  assert.ok(isCount(s.best));
  assert.ok(scenes.includes(s.scene));
  validProgress(s.progress);
}
function classifiedReject(action) {
  assert.throws(action, (e) => e?.kind === "invalid-save" || e?.kind === "too-large");
}
const json = fc.jsonValue({ maxDepth: 4 });
const unknown = fc.anything({ maxDepth: 3, maxKeys: 8 });
const count = fc.integer({ min: 0, max });
const level = fc.integer({ min: 1, max: 3 });
const valid = fc
  .record({
    wallet: count,
    best: count,
    scene: fc.constantFrom(...scenes),
    headstart: count,
    shield: count,
    doubleCoins: count,
    portal: fc.boolean(),
    destination: fc.constantFrom(...scenes),
    unlocks: fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()),
    levels: fc.tuple(level, level, level, level, level),
    equip: fc.constantFrom(null, ...skills),
  })
  .map((v) => {
    const p = createProgress();
    p.wallet = v.wallet;
    p.inventory = {
      headstart: v.headstart,
      shield: v.shield,
      doubleCoins: v.doubleCoins,
      portal: v.portal ? 1 : 0,
    };
    p.portalDestination = v.portal ? v.destination : null;
    skills.forEach((k, i) => (p.skills[k].unlocked = v.unlocks[i]));
    ["shield", "magnet", "rush", "headstart", "doubleCoins"].forEach(
      (k, i) => (p.levels[k] = v.levels[i]),
    );
    p.equippedSkill = v.equip && p.skills[v.equip].unlocked ? v.equip : null;
    return { version: 1, progress: p, best: v.best, scene: v.scene };
  });
property(
  "local-arbitrary-text-recovers",
  [
    fc.oneof(
      fc.string({ maxLength: 4096 }),
      json.map((v) => JSON.stringify(v)),
      fc.constant(null),
    ),
  ],
  (raw) => validProgress(readProgress(raw)),
  6000,
);
property(
  "local-malformed-json-defaults",
  [json, fc.string({ maxLength: 100 })],
  (value, suffix) => {
    const raw = `${JSON.stringify(value)}#${suffix}`;
    assert.deepEqual(readProgress(raw), createProgress());
    classifiedReject(() => decodeCloudSave(raw));
  },
);
property("local-unknown-fields-preserve-wallet", [count, json, json], (wallet, extra, shape) => {
  const raw = JSON.stringify({
    version: 1,
    wallet,
    extension: extra,
    inventory: shape,
    skills: shape,
    levels: shape,
  });
  const p = readProgress(raw);
  validProgress(p);
  assert.equal(p.wallet, wallet);
});
property(
  "local-and-cloud-version-boundary",
  [valid, json.filter((v) => v !== 1)],
  (snapshot, version) => {
    const p = { ...snapshot.progress, version };
    assert.deepEqual(readProgress(JSON.stringify(p)), createProgress());
    classifiedReject(() => normalizeSaveSnapshot({ ...snapshot, version }));
    classifiedReject(() => normalizeSaveSnapshot({ ...snapshot, progress: p }));
    classifiedReject(() =>
      decodeCloudSave(JSON.stringify({ version, revision: "v1", payload: snapshot })),
    );
  },
);
property("cloud-unknown-shapes-reject-or-normalize", [unknown], (value) => {
  const before = structuredClone(value);
  let result;
  try {
    result = normalizeSaveSnapshot(value);
  } catch (error) {
    assert.equal(error.kind, "invalid-save");
    assert.deepEqual(value, before);
    return;
  }
  validSnapshot(result);
  assert.deepEqual(value, before);
});
property("cloud-arbitrary-json-envelope", [json], (value) => {
  const raw = JSON.stringify(value);
  let result;
  try {
    result = decodeCloudSave(raw);
  } catch (error) {
    assert.ok(["invalid-save", "too-large"].includes(error.kind));
    return;
  }
  validSnapshot(result.payload);
  assert.match(result.revision, /^[A-Za-z0-9_-]{1,80}$/);
});
property("valid-saves-ignore-extra-json-metadata", [valid, json, json], (snapshot, a, b) => {
  const input = structuredClone(snapshot);
  input.extension = a;
  input.progress.extension = b;
  const before = structuredClone(input);
  assert.deepEqual(normalizeSaveSnapshot(input), snapshot);
  assert.deepEqual(input, before);
  const encoded = encodeCloudSave(input, "property_seed");
  assert.deepEqual(decodeCloudSave(encoded).payload, snapshot);
  assert.equal(new TextEncoder().encode(encoded).byteLength <= 1024, true);
});
const badCount = fc.oneof(
  fc.constantFrom(NaN, Infinity, -Infinity, max + 1, Number.MAX_VALUE, -1, -0.5),
  fc.double().filter((n) => !isCount(n)),
  json.filter((v) => !isCount(v)),
);
const countPath = fc.constantFrom("best", "wallet", "shield", "headstart", "doubleCoins", "portal");
property(
  "nonfinite-unsafe-and-wrong-counts-rejected",
  [valid, countPath, badCount],
  (snapshot, path, value) => {
    const input = structuredClone(snapshot);
    if (path === "best") input.best = value;
    else if (path === "wallet") input.progress.wallet = value;
    else input.progress.inventory[path] = value;
    classifiedReject(() => normalizeSaveSnapshot(input));
    classifiedReject(() =>
      decodeCloudSave(JSON.stringify({ version: 1, revision: "v1", payload: input })),
    );
    const local = readProgress(JSON.stringify(input.progress));
    validProgress(local);
    if (path === "wallet") assert.equal(local.wallet, 0);
    if (["shield", "headstart", "doubleCoins"].includes(path))
      assert.equal(local.inventory[path], 0);
  },
);
property(
  "invalid-scenes-skills-and-levels-rejected",
  [valid, fc.constantFrom("scene", "destination", "equipped", "level"), json],
  (snapshot, path, value) => {
    const input = structuredClone(snapshot);
    if (path === "scene") {
      fc.pre(!scenes.includes(value));
      input.scene = value;
    }
    if (path === "destination") {
      fc.pre(value !== null && !scenes.includes(value));
      input.progress.portalDestination = value;
    }
    if (path === "equipped") {
      fc.pre(value !== null && !skills.includes(value));
      input.progress.equippedSkill = value;
    }
    if (path === "level") {
      fc.pre(![1, 2, 3].includes(value));
      input.progress.levels.shield = value;
    }
    classifiedReject(() => normalizeSaveSnapshot(input));
    validProgress(readProgress(JSON.stringify(input.progress)));
  },
);
property(
  "shape-replacement-cannot-silently-reset-cloud",
  [
    valid,
    fc.constantFrom("progress", "inventory", "skills", "levels"),
    fc.oneof(
      fc.constant(null),
      fc.boolean(),
      fc.integer(),
      fc.string(),
      fc.array(json, { maxLength: 5 }),
    ),
  ],
  (snapshot, key, value) => {
    const input = structuredClone(snapshot);
    if (key === "progress") input.progress = value;
    else input.progress[key] = value;
    classifiedReject(() => normalizeSaveSnapshot(input));
    classifiedReject(() =>
      decodeCloudSave(JSON.stringify({ version: 1, revision: "v1", payload: input })),
    );
  },
);
property(
  "portal-ownership-and-locked-skill-consistency",
  [
    valid,
    fc.constantFrom(
      "portal-overflow",
      "portal-missing",
      "portal-surplus",
      "portal-level",
      "locked-skill",
    ),
  ],
  (snapshot, kind) => {
    const input = structuredClone(snapshot),
      p = input.progress;
    if (kind === "portal-overflow") p.inventory.portal = 2;
    if (kind === "portal-missing") {
      p.inventory.portal = 1;
      p.portalDestination = null;
    }
    if (kind === "portal-surplus") {
      p.inventory.portal = 0;
      p.portalDestination = "winter";
    }
    if (kind === "portal-level") p.levels.portal = 2;
    if (kind === "locked-skill") {
      p.equippedSkill = "rush";
      p.skills.rush.unlocked = false;
    }
    classifiedReject(() => normalizeSaveSnapshot(input));
    validProgress(readProgress(JSON.stringify(p)));
  },
);
property(
  "revision-format-and-byte-budget",
  [valid, fc.string({ maxLength: 120 })],
  (snapshot, revision) => {
    if (/^[A-Za-z0-9_-]{1,80}$/.test(revision)) {
      const encoded = encodeCloudSave(snapshot, revision);
      assert.deepEqual(decodeCloudSave(encoded).payload, snapshot);
    } else {
      classifiedReject(() => encodeCloudSave(snapshot, revision));
      classifiedReject(() =>
        decodeCloudSave(JSON.stringify({ version: 1, revision, payload: snapshot })),
      );
    }
    const large = JSON.stringify({
      version: 1,
      revision: "v1",
      payload: snapshot,
      metadata: "x".repeat(1025),
    });
    assert.throws(
      () => decodeCloudSave(large),
      (e) => e.kind === "too-large",
    );
  },
);
test("save property selection executes at least one property", () => {
  assert.ok(rows.length > 0, `No save property matched FC_SAVE_CASE=${process.env.FC_SAVE_CASE ?? "<all>"}`);
});
process.on("exit", writeResults);
