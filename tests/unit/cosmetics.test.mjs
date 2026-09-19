import test from "node:test";
import assert from "node:assert/strict";
import { compileGameModules } from "../helpers/compile-game-modules.mjs";

compileGameModules(new URL("./cosmetics-compiled/", import.meta.url), { entries: ["cosmetics", "store", "cloud-save"] });
const { ACCESSORIES, COSMETIC_SLOTS, createOutfit, accessoryDefinition, isAccessoryId, isAccessoryForSlot } =
  await import("./cosmetics-compiled/cosmetics.mjs");
const { createProgress, readProgress, buyAccessory, equipAccessory, buySkin, equipSkin, buyBooster, bankRunRewards } =
  await import("./cosmetics-compiled/store.mjs");
const { createRun } = await import("./cosmetics-compiled/engine.mjs");
const { SKINS } = await import("./cosmetics-compiled/skins.mjs");
const { normalizeSaveSnapshot, encodeCloudSave, decodeCloudSave, createCloudSaveController, CLOUD_SAVE_KEY } =
  await import("./cosmetics-compiled/cloud-save.mjs");
const ids = ACCESSORIES.map(({ id }) => id);
const snapshot = (progress = createProgress()) => ({ version: 1, progress, best: 42, scene: "summer" });
const legacy = (progress) => {
  const copy = structuredClone(progress);
  delete copy.ownedAccessories;
  delete copy.outfit;
  return copy;
};
const rejectedSave = (save) => assert.throws(() => normalizeSaveSnapshot(save), (error) => error.kind === "invalid-save");

test("accessory catalog offers three independent slots with distinct one-time prices", () => {
  assert.deepEqual(COSMETIC_SLOTS, ["hat", "shoes", "effect"]);
  assert.deepEqual(ids, ["cap", "crown", "sprout", "sneakers", "boots", "skates", "sparkles", "petals", "orbit"]);
  assert.deepEqual(createOutfit(), { hat: null, shoes: null, effect: null });
  assert.notEqual(createOutfit(), createOutfit(), "default outfits are independent objects");
  assert.deepEqual(Object.fromEntries(ACCESSORIES.map(({ id, price }) => [id, price])), {
    cap: 500, crown: 2000, sprout: 750, sneakers: 600, boots: 1000,
    skates: 1500, sparkles: 900, petals: 1200, orbit: 2500,
  });
  for (const definition of ACCESSORIES) {
    assert.equal(accessoryDefinition(definition.id), definition);
    assert.equal(isAccessoryId(definition.id), true);
    for (const slot of COSMETIC_SLOTS) assert.equal(isAccessoryForSlot(slot, definition.id), slot === definition.slot);
  }
  for (const invalid of [null, undefined, {}, 1, "CAP", "future-item", "__proto__"]) {
    assert.equal(isAccessoryId(invalid), false);
    assert.equal(accessoryDefinition(invalid), undefined);
    assert.equal(isAccessoryForSlot(invalid, invalid), false);
  }
});

test("accessory purchases equip one slot, never charge twice, and preserve skins and other slots", () => {
  const accessoryBudget = ACCESSORIES.reduce((total, { price }) => total + price, 0);
  let progress = buySkin({ ...createProgress(), wallet: accessoryBudget + 1200 }, "blossom").progress;
  for (const { id, slot, price } of ACCESSORIES.toReversed()) {
    const before = structuredClone(progress);
    const result = buyAccessory(progress, id);
    assert.equal(result.ok, true);
    assert.deepEqual(progress, before, "purchase cannot mutate the input save");
    progress = result.progress;
    assert.equal(progress.wallet, before.wallet - price);
    assert.equal(progress.equippedSkin, "blossom");
    assert.deepEqual(progress.outfit, { ...before.outfit, [slot]: id });
    assert.deepEqual(progress.ownedAccessories, ids.filter((item) => item === id || before.ownedAccessories.includes(item)));
    const paid = structuredClone(progress);
    assert.equal(buyAccessory(progress, id).ok, false);
    assert.deepEqual(progress, paid, "duplicate purchase preserves everything");
  }
  assert.deepEqual(progress.outfit, { hat: "cap", shoes: "sneakers", effect: "sparkles" });
  const equipped = equipAccessory(progress, "hat", "crown");
  assert.equal(equipped.ok, true);
  assert.equal(equipped.progress.wallet, 200);
  assert.deepEqual(equipped.progress.outfit, { ...progress.outfit, hat: "crown" });
  progress = buyBooster(equipped.progress, "shield").progress;
  progress = equipSkin(progress, "classic").progress;
  const run = createRun(1, "spring");
  run.coins = 25;
  progress = bankRunRewards(run, progress);
  assert.equal(progress.wallet, 150);
  assert.deepEqual(progress.outfit, equipped.progress.outfit);
  assert.deepEqual(progress.ownedAccessories, ids);
  assert.deepEqual(readProgress(JSON.stringify(progress)), progress);
});

test("removing and re-equipping each slot is free and never changes other choices", () => {
  const outfitIds = ["sprout", "skates", "petals"];
  let progress = { ...createProgress(), wallet: outfitIds.reduce((total, id) => total + accessoryDefinition(id).price, 0) };
  for (const id of outfitIds) progress = buyAccessory(progress, id).progress;
  assert.equal(progress.wallet, 0);
  for (const slot of COSMETIC_SLOTS) {
    const before = structuredClone(progress);
    const removed = equipAccessory(progress, slot, null);
    assert.equal(removed.ok, true);
    assert.deepEqual(progress, before);
    assert.deepEqual(removed.progress, { ...before, outfit: { ...before.outfit, [slot]: null } });
    const equipped = equipAccessory(removed.progress, slot, before.outfit[slot]);
    assert.equal(equipped.ok, true);
    assert.deepEqual(equipped.progress, before);
    assert.equal(equipAccessory(removed.progress, slot, null).ok, true, "empty slots can remain empty");
  }
});

test("invalid, wrong-slot, unowned and unaffordable accessory choices preserve the save", () => {
  for (const { id, slot, price, name } of ACCESSORIES) {
    for (const wallet of [0, price - 1]) {
      const progress = { ...createProgress(), wallet };
      const before = structuredClone(progress);
      const result = buyAccessory(progress, id);
      assert.equal(result.ok, false);
      assert.equal(result.message, `Collect ${price - wallet} more coins to unlock ${name}.`);
      assert.deepEqual(equipAccessory(progress, slot, id), {
        ok: false, message: "Unlock this accessory before equipping it.",
      });
      for (const wrongSlot of COSMETIC_SLOTS.filter((other) => other !== slot))
        assert.deepEqual(equipAccessory(progress, wrongSlot, id), {
          ok: false, message: "Choose an accessory for this category.",
        });
      assert.deepEqual(progress, before);
    }
    const exact = buyAccessory({ ...createProgress(), wallet: price }, id);
    assert.equal(exact.ok, true, `${id} unlocks at its exact price`);
    assert.equal(exact.progress.wallet, 0);
  }
  for (const wallet of [0, 10000]) {
    const progress = { ...createProgress(), wallet };
    const before = structuredClone(progress);
    for (const invalid of [undefined, null, {}, 1, "future-item", "__proto__"]) {
      assert.equal(buyAccessory(progress, invalid).ok, false);
      if (invalid !== null) assert.deepEqual(equipAccessory(progress, "hat", invalid), {
        ok: false, message: "Choose an accessory from the store.",
      });
      assert.deepEqual(equipAccessory(progress, invalid, null), {
        ok: false, message: "Choose an accessory category.",
      });
    }
    assert.deepEqual(progress, before);
  }
  const progress = buyAccessory({ ...createProgress(), wallet: 1000 }, "boots").progress;
  const before = structuredClone(progress);
  assert.equal(progress.wallet, 0);
  for (const slot of ["hat", "effect"])
    assert.deepEqual(equipAccessory(progress, slot, "boots"), {
      ok: false, message: "Choose an accessory for this category.",
    });
  assert.deepEqual(progress, before);
});

test("legacy local saves and damaged accessory fields recover without changing wallet or skins", () => {
  const progress = buySkin({ ...createProgress(), wallet: 2314 }, "ocean").progress;
  assert.deepEqual(readProgress(JSON.stringify(legacy(progress))), progress);
  const input = { ...progress, ownedAccessories: ["boots", "sprout", "future-item", "boots", null], outfit: { hat: "sprout", shoes: "boots", effect: "sparkles", future: "hat" } };
  const repaired = readProgress(JSON.stringify(input));
  assert.deepEqual(repaired, { ...progress, ownedAccessories: ["sprout", "boots"], outfit: { hat: "sprout", shoes: "boots", effect: null } });
  for (const ownedAccessories of [null, {}, 3, "sprout", []])
    assert.deepEqual(readProgress(JSON.stringify({ ...input, ownedAccessories })), progress);
  for (const outfit of [null, [], {}, 3, "sprout", { hat: "boots", shoes: "sprout", effect: "future-item" }])
    assert.deepEqual(readProgress(JSON.stringify({ ...repaired, outfit })), { ...repaired, outfit: createOutfit() });
  assert.deepEqual(readProgress(JSON.stringify(repaired)), repaired);
});

test("cloud saves migrate absent accessory fields and reject malformed or newer outfit data", () => {
  const current = snapshot();
  assert.deepEqual(normalizeSaveSnapshot({ ...current, progress: legacy(current.progress) }), current);
  const invalid = [
    { ownedAccessories: [] }, { outfit: createOutfit() },
    { ownedAccessories: null, outfit: createOutfit() },
    { ownedAccessories: ["cap", "cap"], outfit: createOutfit() },
    { ownedAccessories: ["future-item"], outfit: createOutfit() },
    { ownedAccessories: [null], outfit: createOutfit() },
    { ownedAccessories: [], outfit: null },
    { ownedAccessories: [], outfit: [] },
    { ownedAccessories: [], outfit: {} },
    { ownedAccessories: [], outfit: { ...createOutfit(), hat: "cap" } },
    { ownedAccessories: ["boots"], outfit: { ...createOutfit(), hat: "boots" } },
    { ownedAccessories: ["cap"], outfit: { ...createOutfit(), hat: "future-item" } },
    { ownedAccessories: [], outfit: { ...createOutfit(), cape: null } },
    { ownedAccessories: [], outfit: { hat: null, shoes: null, cape: null } },
  ];
  for (const fields of invalid) {
    const input = { ...current, progress: { ...legacy(current.progress), ...fields } };
    rejectedSave(input);
    for (const version of [1, 2, 3])
      assert.throws(() => decodeCloudSave(JSON.stringify({ version, revision: "remote", payload: input })), (error) => error.kind === "invalid-save");
  }
  const unordered = snapshot({ ...createProgress(), ownedAccessories: ["orbit", "boots", "cap"], outfit: { hat: "cap", shoes: "boots", effect: "orbit" } });
  assert.deepEqual(normalizeSaveSnapshot(unordered).progress.ownedAccessories, ["cap", "boots", "orbit"]);
});

test("all cosmetics and maximum counters fit Toy's 1024-byte cloud value with an 80-character revision", () => {
  const progress = createProgress();
  progress.wallet = Number.MAX_SAFE_INTEGER;
  progress.inventory = { headstart: Number.MAX_SAFE_INTEGER, shield: Number.MAX_SAFE_INTEGER, doubleCoins: Number.MAX_SAFE_INTEGER, portal: 1 };
  progress.portalDestination = "winter";
  for (const key of Object.keys(progress.skills)) progress.skills[key].unlocked = true;
  for (const key of Object.keys(progress.levels)) progress.levels[key] = key === "portal" ? 1 : 3;
  progress.equippedSkill = "magnet";
  progress.ownedSkins = SKINS.map(({ id }) => id);
  progress.equippedSkin = "blossom";
  progress.ownedAccessories = ids;
  progress.outfit = { hat: "sprout", shoes: "sneakers", effect: "sparkles" };
  const save = { ...snapshot(progress), best: Number.MAX_SAFE_INTEGER };
  const encoded = encodeCloudSave(save, "r".repeat(80));
  assert.ok(Buffer.byteLength(encoded) <= 1024, `cloud save is ${Buffer.byteLength(encoded)} bytes`);
  assert.equal(JSON.parse(encoded).version, 3, "v2 clients must reject accessories before reading progress");
  assert.deepEqual(decodeCloudSave(encoded), { version: 3, revision: "r".repeat(80), payload: save });
});

test("cloud v1/v2 legacy saves preserve prior skins and migrate accessories to empty slots", () => {
  const progress = buySkin({ ...createProgress(), wallet: 1000 }, "frost").progress;
  const oldSkins = snapshot(legacy(progress));
  assert.deepEqual(decodeCloudSave(JSON.stringify({ version: 2, revision: "skins_client", payload: oldSkins })).payload, snapshot(progress));
  const original = legacy(createProgress());
  delete original.ownedSkins;
  delete original.equippedSkin;
  assert.deepEqual(decodeCloudSave(JSON.stringify({ version: 1, revision: "original_client", payload: snapshot(original) })).payload, snapshot());
});

test("cloud controller imports populated original v1 and skin-only v2 saves without losing progress", async (t) => {
  for (const version of [1, 2]) {
    for (const existingDevice of [false, true]) {
      await t.test(`v${version}: ${existingDevice ? "review then use-cloud" : "first-device import"}`, async (subtest) => {
        // Build historical JSON directly: the current encoder adds new fields
        // and would hide a compatibility failure in the actual SDK read path.
        const oldProgress = {
          version: 1,
          wallet: 8432,
          inventory: { headstart: 4, shield: 9, doubleCoins: 6, portal: 1 },
          skills: { shield: { unlocked: true }, magnet: { unlocked: false }, rush: { unlocked: true } },
          levels: { headstart: 2, shield: 3, doubleCoins: 2, portal: 1, magnet: 2, rush: 3 },
          equippedSkill: "rush",
          portalDestination: "winter",
          ...(version === 2 ? { ownedSkins: ["classic", "blossom", "ocean", "frost"], equippedSkin: "ocean" } : {}),
        };
        const oldPayload = { version: 1, progress: oldProgress, best: 654321, scene: "autumn" };
        const oldText = JSON.stringify({ version, revision: `old_client_${version}`, payload: oldPayload });
        const expected = {
          ...oldPayload,
          progress: {
            ...oldProgress,
            ownedSkins: version === 2 ? ["classic", "blossom", "ocean", "frost"] : ["classic"],
            equippedSkin: version === 2 ? "ocean" : "classic",
            ownedAccessories: [],
            outfit: { hat: null, shoes: null, effect: null },
          },
        };
        const device = existingDevice
          ? { version: 1, progress: buyAccessory({ ...createProgress(), wallet: 1777 }, "cap").progress, best: 12, scene: "spring" }
          : { version: 1, progress: createProgress(), best: 0, scene: "spring" };
        let local = structuredClone(device);
        let cloud = oldText;
        let cloudWrites = 0;
        let localWrites = 0;
        const metadata = new Map();
        const controller = createCloudSaveController({
          getSdk: async () => ({
            isSupport: async () => true,
            getCloudStorage: async (keys) => {
              assert.deepEqual(keys, [CLOUD_SAVE_KEY], "old and new versions share the same storage key");
              return { [CLOUD_SAVE_KEY]: cloud };
            },
            setCloudStorage: async (value) => { cloud = value[CLOUD_SAVE_KEY]; cloudWrites++; },
          }),
          storage: { getItem: (key) => metadata.get(key) ?? null, setItem: (key, value) => metadata.set(key, value) },
          readLocal: () => local,
          writeLocal: (value) => { local = value; localWrites++; },
          hasLocalData: () => existingDevice,
          canApply: () => true,
          revision: () => `updated_client_${version}`,
        });
        subtest.after(() => controller.dispose());

        await controller.start();
        if (existingDevice) {
          assert.equal(controller.getState().status, "conflict");
          assert.equal(controller.getState().conflict.reason, "migration");
          assert.deepEqual(controller.getState().conflict.local, device);
          assert.deepEqual(controller.getState().conflict.cloud, expected);
          assert.deepEqual(local, device, "reading old cloud data cannot overwrite an existing device before a choice");
          assert.equal(localWrites, 0);
          assert.equal(cloud, oldText);
          assert.equal(cloudWrites, 0);
          await controller.resolve("use-cloud");
        }
        assert.equal(controller.getState().status, "synced");
        assert.equal(controller.getState().error, null);
        assert.equal(controller.getState().conflict, null);
        assert.deepEqual(local, expected, "all historical progress survives; only absent cosmetics receive defaults");
        assert.equal(localWrites, 1);
        assert.equal(cloud, oldText, "import does not rewrite or reset the older cloud save");
        assert.equal(cloudWrites, 0);

        await controller.refresh();
        assert.equal(controller.getState().status, "synced", "normalized defaults do not cause another migration conflict");
        assert.deepEqual(local, expected);
        assert.equal(localWrites, 1);
        assert.equal(cloudWrites, 0);

        const purchase = buyAccessory(local.progress, "cap");
        assert.equal(purchase.ok, true);
        local = { ...local, progress: purchase.progress };
        controller.markDirty();
        await controller.flush();
        const saved = decodeCloudSave(cloud);
        assert.equal(controller.getState().status, "synced");
        assert.equal(cloudWrites, 1, "the first new purchase syncs once after legacy import");
        assert.equal(saved.version, 3, "new writes protect accessories from older clients");
        assert.deepEqual(saved.payload, {
          ...expected,
          progress: {
            ...expected.progress,
            wallet: oldProgress.wallet - accessoryDefinition("cap").price,
            ownedAccessories: ["cap"],
            outfit: { hat: "cap", shoes: null, effect: null },
          },
        });
      });
    }
  }
});

test("accessory-only cloud conflicts require a whole-save choice and retain outfit on either side", async (t) => {
  const device = snapshot(buyAccessory({ ...createProgress(), wallet: accessoryDefinition("cap").price }, "cap").progress);
  const remote = snapshot(buyAccessory({ ...createProgress(), wallet: accessoryDefinition("crown").price }, "crown").progress);
  for (const choice of ["use-cloud", "use-local", "local-only"]) {
    let local = structuredClone(device);
    let cloud = encodeCloudSave(remote, "remote");
    let writes = 0;
    const storage = new Map();
    const controller = createCloudSaveController({
      getSdk: async () => ({
        isSupport: async () => true,
        getCloudStorage: async () => ({ [CLOUD_SAVE_KEY]: cloud }),
        setCloudStorage: async (value) => { cloud = value[CLOUD_SAVE_KEY]; writes++; },
      }),
      storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
      readLocal: () => local, writeLocal: (value) => { local = value; },
      hasLocalData: () => true, canApply: () => true, revision: () => "device",
    });
    t.after(() => controller.dispose());
    await controller.start();
    assert.equal(controller.getState().status, "conflict");
    assert.deepEqual(controller.getState().conflict.local, device);
    assert.deepEqual(controller.getState().conflict.cloud, remote);
    assert.equal(writes, 0);
    await controller.resolve(choice);
    assert.deepEqual(local, choice === "use-cloud" ? remote : device);
    assert.deepEqual(decodeCloudSave(cloud).payload, choice === "use-local" ? device : remote);
    assert.equal(writes, choice === "use-local" ? 1 : 0);
  }
});
