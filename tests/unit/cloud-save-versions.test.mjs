import test from "node:test";
import assert from "node:assert/strict";
import { compileGameModules } from "../helpers/compile-game-modules.mjs";

compileGameModules(new URL("./cloud-save-versions-compiled/", import.meta.url), {
  entries: ["cloud-save", "store"],
});
const { createProgress } = await import("./cloud-save-versions-compiled/store.mjs");
const { normalizeSaveSnapshot, encodeCloudSave, decodeCloudSave, createCloudSaveController, CLOUD_SAVE_KEY } =
  await import("./cloud-save-versions-compiled/cloud-save.mjs");

const skinFields = ["ownedSkins", "equippedSkin"];
const accessoryFields = ["ownedAccessories", "outfit"];
const snapshot = () => ({
  version: 1,
  progress: {
    ...createProgress(),
    wallet: 5432,
    ownedSkins: ["classic", "frost"],
    equippedSkin: "frost",
    ownedAccessories: ["crown", "boots", "orbit"],
    outfit: { hat: "crown", shoes: "boots", effect: "orbit" },
  },
  best: 9876,
  scene: "winter",
});
function omitFields(save, fields) {
  const result = structuredClone(save);
  for (const field of fields) delete result.progress[field];
  return result;
}
const envelope = (version, payload, revision = "remote") => JSON.stringify({ version, revision, payload });
const rejectsInvalid = (action) => assert.throws(action, (error) => error.kind === "invalid-save");
const damagedVersions = [
  { name: "v2 missing skin fields", version: 2, missing: skinFields },
  { name: "v3 missing skin fields", version: 3, missing: skinFields },
  { name: "v3 missing accessory fields", version: 3, missing: accessoryFields },
  { name: "v3 missing all cosmetic fields", version: 3, missing: [...skinFields, ...accessoryFields] },
];

test("cloud envelope versions only default cosmetics absent in their historical format", () => {
  const save = snapshot();
  const original = omitFields(save, [...skinFields, ...accessoryFields]);
  const skinOnly = omitFields(save, accessoryFields);
  const defaults = createProgress();
  assert.deepEqual(decodeCloudSave(envelope(1, original)).payload, {
    ...original,
    progress: { ...original.progress, ownedSkins: defaults.ownedSkins, equippedSkin: defaults.equippedSkin,
      ownedAccessories: defaults.ownedAccessories, outfit: defaults.outfit },
  });
  assert.deepEqual(decodeCloudSave(envelope(2, skinOnly)).payload, {
    ...skinOnly,
    progress: { ...skinOnly.progress, ownedAccessories: defaults.ownedAccessories, outfit: defaults.outfit },
  });
  for (const version of [1, 2, 3]) {
    assert.deepEqual(decodeCloudSave(envelope(version, save)).payload, save);
    for (const field of [...skinFields, ...accessoryFields])
      rejectsInvalid(() => decodeCloudSave(envelope(version, omitFields(save, [field]))));
  }
  for (const { version, missing } of damagedVersions)
    rejectsInvalid(() => decodeCloudSave(envelope(version, omitFields(save, missing))));
});

test("local normalization can migrate missing groups but a new cloud write requires a complete current snapshot", () => {
  const save = snapshot();
  for (const missing of [skinFields, accessoryFields, [...skinFields, ...accessoryFields]]) {
    const oldSave = omitFields(save, missing);
    const before = structuredClone(oldSave);
    const migrated = normalizeSaveSnapshot(oldSave);
    assert.deepEqual(oldSave, before, "migration must not mutate the original save");
    rejectsInvalid(() => encodeCloudSave(oldSave, "current_client"));
    const text = encodeCloudSave(migrated, "current_client");
    assert.equal(JSON.parse(text).version, 3);
    assert.deepEqual(decodeCloudSave(text).payload, migrated);
  }
});

test("malformed current cloud envelopes cannot replace the local save or be overwritten by sync", async (t) => {
  for (const { name, version, missing } of damagedVersions) {
    for (const phase of ["first-device", "existing-device", "refresh", "dirty-flush", "use-cloud", "use-local"]) {
      await t.test(`${name}: ${phase}`, async (subtest) => {
        let local = snapshot();
        const remoteSave = { ...snapshot(), best: 12345, scene: "autumn" };
        const damaged = envelope(version, omitFields(remoteSave, missing));
        let remote = ["first-device", "existing-device"].includes(phase)
          ? damaged
          : encodeCloudSave(phase.startsWith("use-") ? remoteSave : local, "remote");
        let localWrites = 0;
        let remoteWrites = 0;
        const metadata = new Map();
        const controller = createCloudSaveController({
          getSdk: async () => ({
            isSupport: async () => true,
            getCloudStorage: async () => ({ [CLOUD_SAVE_KEY]: remote }),
            setCloudStorage: async (items) => { remote = items[CLOUD_SAVE_KEY]; remoteWrites++; },
          }),
          storage: { getItem: (key) => metadata.get(key) ?? null, setItem: (key, value) => metadata.set(key, value) },
          readLocal: () => local,
          writeLocal: (value) => { local = value; localWrites++; },
          hasLocalData: () => phase !== "first-device",
          canApply: () => true,
          revision: () => "device",
        });
        subtest.after(() => controller.dispose());
        await controller.start();
        if (phase === "refresh" || phase === "dirty-flush") {
          assert.equal(controller.getState().status, "synced");
          remote = damaged;
          if (phase === "dirty-flush") {
            local = { ...local, progress: { ...local.progress, wallet: local.progress.wallet + 7 } };
            controller.markDirty();
            await controller.flush();
          } else await controller.refresh();
        } else if (phase.startsWith("use-")) {
          assert.equal(controller.getState().status, "conflict");
          remote = damaged;
          await controller.resolve(phase);
        }
        const expected = snapshot();
        if (phase === "dirty-flush") expected.progress.wallet += 7;
        assert.equal(controller.getState().status, "error");
        assert.equal(controller.getState().error, "invalid-save");
        assert.deepEqual(local, expected, "a damaged cloud save cannot discard device progress or purchases");
        assert.equal(localWrites, 0);
        assert.equal(remote, damaged, "keep the damaged remote value available for recovery");
        assert.equal(remoteWrites, 0, "sync must not replace unreadable cloud data with defaults");
      });
    }
  }
});
