import test from "node:test";
import assert from "node:assert/strict";
import { compileGameModules } from "../helpers/compile-game-modules.mjs";

const folder = new URL("./skins-compiled/", import.meta.url);
compileGameModules(folder, { entries: ["skins", "store", "cloud-save"] });
const { SKINS, DEFAULT_SKIN, isSkinId, skinDefinition } = await import("./skins-compiled/skins.mjs");
const { createProgress, readProgress, buySkin, equipSkin, buyBooster, bankRunRewards } =
  await import("./skins-compiled/store.mjs");
const { createRun } = await import("./skins-compiled/engine.mjs");
const { normalizeSaveSnapshot, encodeCloudSave, decodeCloudSave, createCloudSaveController, CLOUD_SAVE_KEY } =
  await import("./skins-compiled/cloud-save.mjs");
const ids = SKINS.map(({ id }) => id);
const snapshot = (progress = createProgress()) => ({ version: 1, progress, best: 42, scene: "summer" });
const legacy = (progress) => {
  const copy = structuredClone(progress);
  delete copy.ownedSkins;
  delete copy.equippedSkin;
  return copy;
};

test("skin catalog preserves the original TV and rejects unknown skin identifiers", () => {
  assert.deepEqual(ids, ["classic", "blossom", "ocean", "amber", "frost"]);
  assert.equal(DEFAULT_SKIN, "classic");
  assert.equal(skinDefinition("classic").price, 0);
  assert.deepEqual(skinDefinition("classic").palette, {
    shell: ["#72d0e7", "#3295b3", "#b5eff9"],
    trim: ["#284c60", "#183444", "#4c7285"],
    panel: "#60bfd8",
    indicator: "#f4a4bc",
  });
  for (const id of ids) assert.equal(isSkinId(id), true);
  for (const value of [null, undefined, "CLASSIC", "future-skin", "__proto__", {}, 1]) {
    assert.equal(isSkinId(value), false);
    assert.equal(skinDefinition(value).id, "classic");
  }
  for (const skin of SKINS.slice(1)) assert.equal(skin.price, 1000);
});

test("skins cost earned coins once, equip on purchase, and survive other wallet operations", () => {
  let progress = { ...createProgress(), wallet: 4200 };
  for (const id of ids.slice(1).reverse()) {
    const before = structuredClone(progress);
    const bought = buySkin(progress, id);
    assert.equal(bought.ok, true);
    assert.deepEqual(progress, before, "purchase cannot mutate the previous save");
    progress = bought.progress;
    assert.equal(progress.wallet, before.wallet - 1000);
    assert.equal(progress.equippedSkin, id);
    assert.deepEqual(progress.ownedSkins, ids.filter((skin) => skin === id || before.ownedSkins.includes(skin)));
    const paid = structuredClone(progress);
    assert.equal(buySkin(progress, id).ok, false, "an unlocked skin must never charge twice");
    assert.deepEqual(progress, paid);
  }
  const beforeEquip = structuredClone(progress);
  const equipped = equipSkin(progress, "classic");
  assert.equal(equipped.ok, true);
  assert.equal(equipped.progress.wallet, 200);
  assert.deepEqual(progress, beforeEquip);
  progress = buyBooster(equipped.progress, "shield").progress;
  const run = createRun(1, "spring");
  run.coins = 25;
  progress = bankRunRewards(run, progress);
  assert.equal(progress.wallet, 150);
  assert.deepEqual(progress.ownedSkins, ids);
  assert.equal(progress.equippedSkin, "classic");
  assert.deepEqual(readProgress(JSON.stringify(progress)), progress);
});

test("failed skin purchases and locked or invalid selections preserve wallet and ownership", () => {
  for (const wallet of [0, 200, 999]) {
    const progress = { ...createProgress(), wallet };
    const before = structuredClone(progress);
    for (const id of ids.slice(1)) {
      assert.equal(buySkin(progress, id).ok, false);
      assert.deepEqual(equipSkin(progress, id), {
        ok: false, message: "Unlock this skin before equipping it.",
      });
    }
    for (const bad of [undefined, null, "future-skin", "__proto__", 1, {}]) {
      assert.equal(buySkin(progress, bad).ok, false);
      assert.deepEqual(equipSkin(progress, bad), {
        ok: false, message: "Choose a TV skin from the store.",
      });
    }
    assert.equal(buySkin(progress, "classic").ok, false);
    assert.deepEqual(progress, before);
  }
  assert.equal(buySkin({ ...createProgress(), wallet: 1000 }, "frost").progress.wallet, 0);
});

test("local saves migrate legacy cosmetics and repair ownership without changing other progress", () => {
  const existing = createProgress();
  existing.wallet = 314;
  existing.inventory.shield = 2;
  existing.skills.rush.unlocked = true;
  existing.equippedSkill = "rush";
  existing.levels.rush = 3;
  assert.deepEqual(readProgress(JSON.stringify(legacy(existing))), existing);
  const input = { ...existing, ownedSkins: ["frost", "blossom", "future-skin", "frost", null], equippedSkin: "frost" };
  const repaired = readProgress(JSON.stringify(input));
  assert.deepEqual(repaired, { ...existing, ownedSkins: ["classic", "blossom", "frost"], equippedSkin: "frost" });
  assert.deepEqual(readProgress(JSON.stringify(repaired)), repaired);
  for (const ownedSkins of [null, {}, 3, "ocean", []]) {
    assert.deepEqual(readProgress(JSON.stringify({ ...existing, ownedSkins, equippedSkin: "ocean" })), existing);
  }
  for (const equippedSkin of [null, "ocean", "future-skin", {}, 1]) {
    assert.equal(readProgress(JSON.stringify({ ...repaired, equippedSkin })).equippedSkin, "classic");
  }
});

test("cloud saves migrate missing legacy fields but reject malformed or newer skin data", () => {
  const current = snapshot();
  assert.deepEqual(normalizeSaveSnapshot({ ...current, progress: legacy(current.progress) }), current);
  const rejected = [
    { ownedSkins: ["classic"] },
    { equippedSkin: "classic" },
    { ownedSkins: null, equippedSkin: "classic" },
    { ownedSkins: "classic", equippedSkin: "classic" },
    { ownedSkins: [], equippedSkin: "classic" },
    { ownedSkins: ["ocean"], equippedSkin: "ocean" },
    { ownedSkins: ["classic", "classic"], equippedSkin: "classic" },
    { ownedSkins: ["classic", "future-skin"], equippedSkin: "classic" },
    { ownedSkins: ["classic", null], equippedSkin: "classic" },
    { ownedSkins: ["classic"], equippedSkin: "ocean" },
    { ownedSkins: ["classic"], equippedSkin: "future-skin" },
    { ownedSkins: ["classic"], equippedSkin: null },
  ];
  for (const fields of rejected) {
    const input = { ...current, progress: { ...legacy(current.progress), ...fields } };
    assert.throws(() => normalizeSaveSnapshot(input), (error) => error.kind === "invalid-save");
    assert.throws(() => decodeCloudSave(JSON.stringify({ version: 1, revision: "remote", payload: input })),
      (error) => error.kind === "invalid-save");
  }
  const unordered = snapshot({ ...createProgress(), ownedSkins: ["frost", "classic", "ocean"], equippedSkin: "ocean" });
  assert.deepEqual(normalizeSaveSnapshot(unordered).progress.ownedSkins, ["classic", "ocean", "frost"]);
});

test("all skins fit Toy cloud storage with maximum counters and revision length", () => {
  const progress = createProgress();
  progress.wallet = Number.MAX_SAFE_INTEGER;
  progress.inventory = { headstart: Number.MAX_SAFE_INTEGER, shield: Number.MAX_SAFE_INTEGER, doubleCoins: Number.MAX_SAFE_INTEGER, portal: 1 };
  progress.portalDestination = "winter";
  for (const key of Object.keys(progress.skills)) progress.skills[key].unlocked = true;
  for (const key of Object.keys(progress.levels)) progress.levels[key] = key === "portal" ? 1 : 3;
  progress.equippedSkill = "magnet";
  progress.ownedSkins = ids;
  progress.equippedSkin = "blossom";
  const save = { ...snapshot(progress), best: Number.MAX_SAFE_INTEGER };
  const text = encodeCloudSave(save, "r".repeat(80));
  assert.ok(Buffer.byteLength(text) <= 1024, `cloud save is ${Buffer.byteLength(text)} bytes`);
  assert.deepEqual(decodeCloudSave(text).payload, save);
});

test("cloud envelope v3 protects cosmetics from legacy clients while retaining v1 imports", () => {
  const progress = buySkin({ ...createProgress(), wallet: 1000 }, "blossom").progress;
  const save = snapshot(progress);
  const encoded = encodeCloudSave(save, "new_client");
  const envelope = JSON.parse(encoded);
  assert.equal(envelope.version, 3, "old clients reject outer versions newer than 2 before reading progress");
  assert.equal(envelope.payload.version, 1, "snapshot migration remains independent of the envelope");
  assert.equal(envelope.payload.progress.version, 1, "local progress must keep its existing version");
  assert.deepEqual(decodeCloudSave(encoded), { version: 3, revision: "new_client", payload: save });

  const oldSave = snapshot(legacy(createProgress()));
  const decoded = decodeCloudSave(JSON.stringify({ version: 1, revision: "legacy_client", payload: oldSave }));
  assert.equal(decoded.version, 1);
  assert.deepEqual(decoded.payload, snapshot());
  for (const version of [0, 4, null, "3", {}, undefined]) {
    assert.throws(
      () => decodeCloudSave(JSON.stringify({ version, revision: "unsupported", payload: save })),
      (error) => error.kind === "invalid-save",
    );
  }
});

function cloudHarness(localSave, cloudSave) {
  let local = structuredClone(localSave);
  let remote = encodeCloudSave(cloudSave, "remote");
  let writes = 0;
  const metadata = new Map();
  const controller = createCloudSaveController({
    getSdk: async () => ({
      isSupport: async () => true,
      getCloudStorage: async () => ({ [CLOUD_SAVE_KEY]: remote }),
      setCloudStorage: async (value) => { remote = value[CLOUD_SAVE_KEY]; writes++; },
    }),
    storage: { getItem: (key) => metadata.get(key) ?? null, setItem: (key, value) => metadata.set(key, value) },
    readLocal: () => local,
    writeLocal: (value) => { local = value; },
    hasLocalData: () => true,
    canApply: () => true,
    revision: () => "device",
  });
  return { controller, local: () => local, cloud: () => decodeCloudSave(remote).payload, writes: () => writes };
}

test("skin-only cloud conflicts preserve complete saves and obey each replacement choice", async (t) => {
  const base = { ...createProgress(), wallet: 2000 };
  const device = snapshot(buySkin(base, "blossom").progress);
  const remote = snapshot(buySkin(base, "ocean").progress);
  for (const choice of ["use-cloud", "use-local", "local-only"]) {
    const harness = cloudHarness(device, remote);
    t.after(() => harness.controller.dispose());
    await harness.controller.start();
    assert.equal(harness.controller.getState().status, "conflict");
    assert.deepEqual(harness.controller.getState().conflict.local, device);
    assert.deepEqual(harness.controller.getState().conflict.cloud, remote);
    assert.equal(harness.writes(), 0);
    await harness.controller.resolve(choice);
    assert.deepEqual(harness.local(), choice === "use-cloud" ? remote : device);
    assert.deepEqual(harness.cloud(), choice === "use-local" ? device : remote);
    assert.equal(harness.writes(), choice === "use-local" ? 1 : 0);
  }
});
