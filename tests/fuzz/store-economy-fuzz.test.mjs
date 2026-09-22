import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const cache = new URL("./store-economy-fuzz-compiled/", import.meta.url);
fs.mkdirSync(cache, { recursive: true });
for (const name of ["scenes", "boosts", "skins", "cosmetics", "railway", "community", "ranked-run", "engine", "store", "cloud-save"]) {
  const text = fs.readFileSync(
    new URL(`../../src/lib/game/${name}.ts`, import.meta.url),
    "utf8",
  );
  fs.writeFileSync(
    new URL(`${name}.mjs`, cache),
    ts
      .transpileModule(text, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      })
      .outputText.replace(/from ["'](\.\/[a-z-]+)["']/g, "from '$1.mjs'"),
  );
}
const store = await import("./store-economy-fuzz-compiled/store.mjs");
const { createRun, update } = await import("./store-economy-fuzz-compiled/engine.mjs");
const { createRailRide } = await import("./store-economy-fuzz-compiled/railway.mjs");
const { boostDefinition, skillDefinition, upgradePrice } =
  await import("./store-economy-fuzz-compiled/boosts.mjs");
const { SKINS, skinDefinition } = await import("./store-economy-fuzz-compiled/skins.mjs");
const { ACCESSORIES, COSMETIC_SLOTS, accessoryDefinition, isAccessoryForSlot } = await import("./store-economy-fuzz-compiled/cosmetics.mjs");
const { normalizeSaveSnapshot, encodeCloudSave, decodeCloudSave } =
  await import("./store-economy-fuzz-compiled/cloud-save.mjs");
const all = ["headstart", "shield", "doubleCoins", "portal", "magnet", "rush"];
const owned = ["headstart", "shield", "doubleCoins", "portal"];
const skills = ["shield", "magnet", "rush"];
const skinIds = SKINS.map(({ id }) => id);
const accessoryIds = ACCESSORIES.map(({ id }) => id);
const scenes = ["spring", "summer", "autumn", "winter"];
const max = Number.MAX_SAFE_INTEGER;
function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x += 0x6d2b79f5;
    let z = x;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const copy = (x) => structuredClone(x);
function run(seed, scene = "spring") {
  return Object.assign(createRun(seed, scene), {
    mode: "running",
    time: 0,
    nextRow: 1e9,
    nextForkAt: 1e9,
    nextRailAt: 1e9,
    nextPortalAt: 1e9,
    obstacles: [],
    pickups: [],
    relics: [],
  });
}
function invariant(p, s) {
  assert.ok(
    Number.isSafeInteger(p.wallet) && p.wallet >= 0,
    "wallet must be finite, safe and nonnegative",
  );
  assert.deepEqual(Object.keys(p.inventory).sort(), owned.toSorted());
  for (const value of Object.values(p.inventory))
    assert.ok(Number.isSafeInteger(value) && value >= 0, "inventory count");
  assert.ok(p.inventory.portal <= 1);
  assert.equal(p.inventory.portal === 1, p.portalDestination !== null);
  assert.equal(p.levels.portal, 1);
  for (const value of Object.values(p.levels))
    assert.ok([1, 2, 3].includes(value), "level outside supported bounds");
  if (p.equippedSkill !== null) assert.equal(p.skills[p.equippedSkill].unlocked, true);
  assert.deepEqual(p.ownedSkins, skinIds.filter((id) => id === "classic" || p.ownedSkins.includes(id)));
  assert.ok(p.ownedSkins.includes(p.equippedSkin));
  assert.deepEqual(p.ownedAccessories, accessoryIds.filter((id) => p.ownedAccessories.includes(id)));
  assert.deepEqual(Object.keys(p.outfit).sort(), [...COSMETIC_SLOTS].sort());
  for (const slot of COSMETIC_SLOTS)
    assert.ok(p.outfit[slot] === null || (isAccessoryForSlot(slot, p.outfit[slot]) && p.ownedAccessories.includes(p.outfit[slot])));
  if (s) {
    assert.ok(Number.isFinite(s.skillCharge) && s.skillCharge >= 0 && s.skillCharge <= 100);
    assert.ok(Number.isSafeInteger(s.coins) && s.coins >= 0);
  }
}
function failTrace(seed, trace, error) {
  fs.writeFileSync(
    new URL("./store-economy-fuzz-failure.json", import.meta.url),
    JSON.stringify({ seed, trace, error: String(error) }, null, 2),
  );
  throw new Error(`seed ${seed}: ${error.message}; replay with STORE_FUZZ_SEED=${seed}`, {
    cause: error,
  });
}
const stats = {
  seeds: 0,
  actions: 0,
  success: {},
  failure: {},
  successByKind: {},
  contexts: {},
  saveRoundTrips: 0,
  corruptCases: 0,
  skillCycles: 0,
  boundaryCases: 0,
};
function bank(s, p) {
  const before = copy(p),
    delta = Math.max(0, s.coins - s.bankedCoins),
    blocked = s.skillBlockedCoins,
    charge = s.skillCharge,
    locked = s.skillRechargeLocked && s.permanentSkill && s.boosts[s.permanentSkill] > 0;
  const next = store.bankRunRewards(s, p);
  assert.equal(next.wallet, Math.min(max, before.wallet + delta));
  assert.deepEqual(next.inventory, before.inventory);
  assert.deepEqual(next.levels, before.levels);
  assert.deepEqual(next.ownedAccessories, before.ownedAccessories);
  assert.deepEqual(next.outfit, before.outfit);
  const expected =
    s.permanentSkill && p.skills[s.permanentSkill].unlocked
      ? Math.min(100, charge + (locked ? 0 : Math.max(0, delta - blocked)))
      : charge;
  assert.equal(s.skillCharge, expected);
  assert.deepEqual(p, before, "bank mutates old save");
  const once = copy(next);
  assert.deepEqual(store.bankRunRewards(s, next), once, "double-bank credited again");
  return next;
}
const only = process.env.STORE_FUZZ_SEED ? Number(process.env.STORE_FUZZ_SEED) : null;
test("deterministic economy/save action sequences preserve money, inventory, eligibility and charge", () => {
  for (const seed of only === null
    ? Array.from({ length: Number(process.env.STORE_FUZZ_SEEDS ?? 1024) }, (_, i) => (0x51a000 + i + Number(process.env.STORE_FUZZ_SEED_OFFSET ?? 0)) >>> 0)
    : [only]) {
    const r = rng(seed),
      trace = [];
    let p = store.createProgress(),
      s = run(seed);
    p.wallet = pick(r, [0, 75, 99, 300, 5000, 20000, max]);
    try {
      for (let i = 0; i < Number(process.env.STORE_FUZZ_ACTIONS ?? 400); i++) {
        const op = pick(r, [
          "buy",
          "buy",
          "upgrade",
          "unlock",
          "equip",
          "buy-skin",
          "equip-skin",
          "buy-accessory",
          "equip-accessory",
          "remove-accessory",
          "new-run",
          "context",
          "owned",
          "owned",
          "skill",
          "collect",
          "collect",
          "advance",
          "bank",
          "save",
          "load-damaged",
        ]);
        const kind = pick(r, all),
          destination = pick(r, [undefined, ...scenes]),
          skin = pick(r, skinIds),
          accessory = pick(r, accessoryIds),
          slot = pick(r, COSMETIC_SLOTS);
        trace.push({
          i,
          op,
          kind,
          destination,
          skin,
          accessory,
          slot,
          mode: s.mode,
          time: s.time,
          rail: !!s.rail,
          wallet: p.wallet,
        });
        stats.actions++;
        if (op === "new-run") {
          p = bank(s, p);
          s = run(seed + i, pick(r, scenes));
          s.permanentSkill = pick(r, [null, p.equippedSkill]);
        } else if (op === "context") {
          const context = pick(r, [
            "setup",
            "early",
            "boundary",
            "late",
            "paused",
            "cart",
            "return",
            "turn",
            "tunnel",
          ]);
          stats.contexts[context] = (stats.contexts[context] ?? 0) + 1;
          s.rail = null;
          s.railReturnRemaining = 0;
          s.turnRemaining = 0;
          s.sceneTransition = 0;
          s.pendingScene = null;
          s.mode = "running";
          s.time = pick(r, [0, 0.01, 4.99, 5, 5.001, 25]);
          if (context === "setup") s.mode = "ready";
          if (context === "early") s.time = pick(r, [0, 0.01, 4.99]);
          if (context === "boundary") s.time = 5;
          if (context === "late") s.time = 25;
          if (context === "paused") s.mode = "paused";
          if (context === "cart") s.rail = createRailRide(r);
          if (context === "return") s.railReturnRemaining = 0.5;
          if (context === "turn") s.turnRemaining = 0.5;
          if (context === "tunnel") {
            s.sceneTransition = 1;
            s.pendingScene = pick(r, scenes);
          }
        } else if (op === "collect") {
          s.pickups = Array.from({ length: 1 + Math.floor(r() * 24) }, (_, j) => ({
            id: s.nextId++,
            lane: 0,
            at: s.distance + 0.1 + j * 0.002,
            height: 1,
            taken: false,
          }));
          s.lane = 0;
          s.x = 0;
          s.jump = 0;
          s.slide = 0;
          update(s, 1 / 120, p.levels);
          p = bank(s, p);
        } else if (op === "advance") {
          update(s, pick(r, [0, 1 / 120, 1 / 60, 0.1, 0.25, 1]), p.levels);
          if (r() < 0.5) p = bank(s, p);
        } else if (op === "bank") p = bank(s, p);
        else if (op === "save") {
          assert.deepEqual(store.readProgress(JSON.stringify(p)), p);
          const snapshot = { version: 1, progress: p, best: Math.floor(s.score), scene: s.scene };
          const encoded = encodeCloudSave(snapshot, `seed_${seed}_${i}`);
          assert.deepEqual(decodeCloudSave(encoded).payload, snapshot);
          assert.deepEqual(normalizeSaveSnapshot(copy(snapshot)), snapshot);
          stats.saveRoundTrips++;
        } else if (op === "load-damaged") {
          const damaged = copy(p);
          damaged[
            pick(r, [
              "wallet",
              "inventory",
              "levels",
              "skills",
              "equippedSkill",
              "portalDestination",
              "ownedSkins",
              "equippedSkin",
              "ownedAccessories",
              "outfit",
            ])
          ] = pick(r, [null, -1, 1.5, "oops", {}, [], true, 1e50]);
          p = store.readProgress(JSON.stringify(damaged));
          s = run(seed + i, s.scene);
          s.permanentSkill = p.equippedSkill;
        } else {
          const before = copy(p),
            beforeRun = copy(s);
          let result,
            expected = false,
            cost = 0;
          if (op === "buy") {
            const valid = owned.includes(kind);
            cost = valid ? boostDefinition(kind).price : 0;
            expected =
              valid &&
              p.wallet >= cost &&
              p.inventory[kind] < max &&
              (kind === "portal"
                ? scenes.includes(destination) &&
                  destination !== s.scene &&
                  p.inventory.portal === 0
                : destination === undefined);
            result = store.buyBooster(p, kind, destination, s.scene);
          }
          if (op === "upgrade") {
            cost = upgradePrice(kind, p.levels[kind]);
            expected = cost !== null && p.wallet >= cost;
            result = store.upgradeBooster(p, kind);
          }
          if (op === "unlock") {
            cost = skills.includes(kind) ? skillDefinition(kind).price : 0;
            expected = skills.includes(kind) && !p.skills[kind].unlocked && p.wallet >= cost;
            result = store.unlockSkill(p, kind);
          }
          if (op === "equip") {
            expected = skills.includes(kind) && p.skills[kind].unlocked;
            result = store.equipPermanentSkill(p, kind);
          }
          if (op === "buy-skin") {
            cost = skinDefinition(skin).price;
            expected = !p.ownedSkins.includes(skin) && p.wallet >= cost;
            result = store.buySkin(p, skin);
          }
          if (op === "equip-skin") {
            expected = p.ownedSkins.includes(skin);
            result = store.equipSkin(p, skin);
          }
          if (op === "buy-accessory") {
            cost = accessoryDefinition(accessory).price;
            expected = !p.ownedAccessories.includes(accessory) && p.wallet >= cost;
            result = store.buyAccessory(p, accessory);
          }
          if (op === "equip-accessory") {
            expected = p.ownedAccessories.includes(accessory) && isAccessoryForSlot(slot, accessory);
            result = store.equipAccessory(p, slot, accessory);
          }
          if (op === "remove-accessory") {
            expected = true;
            result = store.equipAccessory(p, slot, null);
          }
          if (op === "owned") {
            const open =
              s.mode === "running" &&
              !s.sceneTransition &&
              !s.rail &&
              !s.railReturnRemaining &&
              !s.turnRemaining;
            expected =
              owned.includes(kind) &&
              open &&
              p.inventory[kind] > 0 &&
              s.boosts[kind] === 0 &&
              (!["headstart", "portal"].includes(kind) || s.time < 5) &&
              (kind !== "portal" ||
                (p.portalDestination !== null && p.portalDestination !== s.scene));
            result = store.activateOwnedBooster(s, p, kind);
          }
          if (op === "skill") {
            expected =
              skills.includes(kind) &&
              s.mode === "running" &&
              !s.sceneTransition &&
              !s.rail &&
              !s.railReturnRemaining &&
              !s.turnRemaining &&
              s.permanentSkill === kind &&
              p.skills[kind].unlocked &&
              s.skillCharge >= 100 &&
              s.boosts[kind] === 0;
            result = store.activatePermanentSkill(s, p, kind);
          }
          assert.equal(result.ok, expected, `eligibility ${op}/${kind}`);
          assert.deepEqual(p, before, "input save mutated");
          const tally = result.ok ? stats.success : stats.failure;
          tally[op] = (tally[op] ?? 0) + 1;
          if (result.ok) {
            stats.successByKind[`${op}:${kind}`] = (stats.successByKind[`${op}:${kind}`] ?? 0) + 1;
            p = result.progress;
            if (["buy", "upgrade", "unlock", "buy-skin", "buy-accessory"].includes(op))
              assert.equal(p.wallet, before.wallet - cost, "purchase cost charged exactly once");
            else assert.equal(p.wallet, before.wallet, "activation/selection spends no wallet");
            if (["buy-skin", "equip-skin"].includes(op)) {
              assert.equal(p.equippedSkin, skin);
              assert.deepEqual(p.inventory, before.inventory);
              assert.deepEqual(p.skills, before.skills);
              assert.deepEqual(p.levels, before.levels);
              assert.deepEqual(p.ownedSkins, skinIds.filter((id) => before.ownedSkins.includes(id) || (op === "buy-skin" && id === skin)));
            } else {
              assert.deepEqual(p.ownedSkins, before.ownedSkins);
              assert.equal(p.equippedSkin, before.equippedSkin);
            }
            if (["buy-accessory", "equip-accessory", "remove-accessory"].includes(op)) {
              const changedSlot = op === "buy-accessory" ? accessoryDefinition(accessory).slot : slot;
              assert.deepEqual(p.outfit, { ...before.outfit, [changedSlot]: op === "remove-accessory" ? null : accessory });
              assert.deepEqual(p.ownedAccessories, accessoryIds.filter((id) => before.ownedAccessories.includes(id) || (op === "buy-accessory" && id === accessory)));
              assert.deepEqual(p.inventory, before.inventory);
              assert.deepEqual(p.skills, before.skills);
              assert.deepEqual(p.levels, before.levels);
            } else {
              assert.deepEqual(p.ownedAccessories, before.ownedAccessories);
              assert.deepEqual(p.outfit, before.outfit);
            }
            if (op === "buy")
              for (const k of owned)
                assert.equal(p.inventory[k], before.inventory[k] + (k === kind ? 1 : 0));
            if (op === "upgrade") {
              for (const k of all)
                assert.equal(p.levels[k], before.levels[k] + (k === kind ? 1 : 0));
              assert.deepEqual(p.inventory, before.inventory);
            }
            if (op === "owned") {
              for (const k of owned)
                assert.equal(p.inventory[k], before.inventory[k] - (k === kind ? 1 : 0));
              assert.ok(s.boosts[kind] > 0);
              const runOnce = copy(s),
                savedOnce = copy(p);
              assert.equal(
                store.activateOwnedBooster(s, p, kind).ok,
                false,
                "double activation succeeds",
              );
              assert.deepEqual(s, runOnce);
              assert.deepEqual(p, savedOnce);
            }
            if (op === "skill") {
              assert.equal(s.skillCharge, 0);
              assert.equal(s.skillRechargeLocked, true);
              assert.deepEqual(p.inventory, before.inventory);
              assert.equal(store.activatePermanentSkill(s, p, kind).ok, false);
            }
          } else {
            assert.deepEqual(s, beforeRun, "failed action mutates run");
          }
        }
        invariant(p, s);
      }
      stats.seeds++;
    } catch (error) {
      failTrace(seed, trace, error);
    }
  }
  for (const op of only === null ? ["buy", "upgrade", "unlock", "equip", "owned", "buy-skin", "equip-skin", "buy-accessory", "equip-accessory"] : [])
    assert.ok(stats.success[op] > 0 && stats.failure[op] > 0, `insufficient ${op} coverage`);
  if (only === null)
    assert.ok(stats.success["remove-accessory"] > 0, "insufficient remove-accessory coverage");
});
test("seeded charging cycles block all active-effect coins and resume only after expiry", () => {
  for (let seed = 1; seed <= 48; seed++)
    for (const kind of skills) {
      const r = rng(seed);
      let p = store.createProgress(),
        s = run(seed);
      p.skills[kind].unlocked = true;
      p.levels[kind] = pick(r, [1, 2, 3]);
      p.equippedSkill = kind;
      s.permanentSkill = kind;
      const collect = (n) => {
        s.pickups = Array.from({ length: n }, () => ({
          id: s.nextId++,
          lane: 0,
          at: s.distance + 0.05,
          height: 1,
          taken: false,
        }));
        update(s, 1 / 120, p.levels);
        p = bank(s, p);
      };
      collect(100);
      assert.equal(s.skillCharge, 100);
      assert.equal(store.activatePermanentSkill(s, p, kind).ok, true);
      const wallet = p.wallet;
      collect(1 + Math.floor(r() * 50));
      assert.equal(s.skillCharge, 0);
      assert.ok(p.wallet > wallet);
      s.mode = "paused";
      const paused = copy(s);
      update(s, 0.25, p.levels);
      assert.deepEqual(s, paused);
      s.mode = "running";
      for (let steps = 0; s.boosts[kind] > 0 && steps < 120; steps++) {
        update(s, 0.25, p.levels);
        if (r() < 0.3) p = bank(s, p);
      }
      assert.equal(s.boosts[kind], 0);
      p = bank(s, p);
      assert.equal(s.skillCharge, 0, "old blocked coins charged at expiry");
      collect(1);
      assert.equal(s.skillCharge, 1);
      collect(99);
      assert.equal(s.skillCharge, 100);
      assert.equal(store.activatePermanentSkill(s, p, kind).ok, true);
      stats.skillCycles++;
    }
});
test("corrupted and legacy local JSON always recovers a valid, stable save without throwing", () => {
  const atoms = [
    null,
    true,
    false,
    0,
    -1,
    1.5,
    max,
    max + 1,
    1e100,
    "1",
    "bad",
    [],
    {},
    [1, 2],
    { unlocked: true },
    { unlocked: "true" },
  ];
  function junk(r, depth = 0) {
    if (depth > 2 || r() < 0.65) return copy(pick(r, atoms));
    return r() < 0.5
      ? Array.from({ length: Math.floor(r() * 5) }, () => junk(r, depth + 1))
      : Object.fromEntries(
          [
            "wallet",
            "portal",
            "shield",
            "magnet",
            "rush",
            "headstart",
            "doubleCoins",
            "unlocked",
            "scene",
            "count",
          ]
            .filter(() => r() < 0.5)
            .map((k) => [k, junk(r, depth + 1)]),
        );
  }
  const cases = [
    null,
    "",
    "{",
    "undefined",
    "null",
    "[]",
    "1e999",
    '{"version":1,"wallet":1e999}',
    '{"version":1,"__proto__":{"wallet":999}}',
  ];
  for (let seed = 0; seed < 6000; seed++) {
    const r = rng(seed + 991),
      p = store.createProgress();
    for (const key of Object.keys(p)) if (r() < 0.65) p[key] = junk(r);
    if (r() < 0.65) p.version = 1;
    if (r() < 0.3) p.headStartRoutes = junk(r);
    if (r() < 0.2) delete p.portalDestination;
    let raw = JSON.stringify(p);
    if (r() < 0.1) raw = raw.slice(0, Math.floor(r() * raw.length));
    cases.push(raw);
  }
  for (const raw of cases) {
    const p = store.readProgress(raw);
    invariant(p);
    assert.deepEqual(
      store.readProgress(JSON.stringify(p)),
      p,
      "repair is not stable across round trips",
    );
    assert.equal({}.wallet, undefined, "prototype pollution");
    stats.corruptCases++;
  }
});
test("maximum counts, single portal ownership and legacy routes preserve value without overflow", () => {
  for (const kind of owned) {
    const p = store.createProgress();
    p.wallet = max;
    p.inventory[kind] = kind === "portal" ? 1 : max;
    if (kind === "portal") p.portalDestination = "winter";
    const before = copy(p);
    assert.equal(
      store.buyBooster(p, kind, kind === "portal" ? "summer" : undefined, "spring").ok,
      false,
    );
    assert.deepEqual(p, before);
    const s = run(88);
    const activated = store.activateOwnedBooster(s, p, kind);
    assert.equal(activated.ok, true);
    assert.equal(activated.progress.inventory[kind], before.inventory[kind] - 1);
    assert.equal(activated.progress.wallet, max);
    invariant(activated.progress, s);
    stats.boundaryCases++;
  }
  for (const current of scenes)
    for (const destination of scenes) {
      let p = store.createProgress();
      p.wallet = 2000;
      const before = copy(p);
      const result = store.buyBooster(p, "portal", destination, current);
      assert.equal(result.ok, destination !== current);
      assert.deepEqual(p, before);
      if (result.ok) {
        p = result.progress;
        assert.equal(p.wallet, 1000);
        assert.equal(p.inventory.portal, 1);
        assert.equal(p.portalDestination, destination);
        const held = copy(p);
        assert.equal(store.buyBooster(p, "portal", pick(rng(22), scenes), current).ok, false);
        assert.deepEqual(p, held);
        const s = run(90, current),
          a = store.activateOwnedBooster(s, p, "portal");
        assert.equal(a.ok, true);
        assert.equal(a.progress.inventory.portal, 0);
        assert.equal(a.progress.portalDestination, null);
        assert.equal(s.pendingScene, destination);
        assert.equal(s.sceneTransitionFrom, current);
        invariant(a.progress, s);
      }
      stats.boundaryCases++;
    }
  for (const count of [0, 1, 2, 250, max]) {
    const legacy = {
      version: 1,
      wallet: max,
      inventory: { rush: count, headstart: count, magnet: count, doubleCoins: count },
      levels: { rush: 3, magnet: 2 },
      headStartRoutes: [
        { scene: "autumn", count: 1 },
        { scene: "winter", count: 99 },
      ],
    };
    const p = store.readProgress(JSON.stringify(legacy)),
      combined = Math.min(max, count + count);
    assert.equal(p.wallet, max);
    assert.equal(p.inventory.headstart, Math.max(0, combined - (count > 0 ? 1 : 0)));
    assert.equal(p.inventory.portal, count > 0 ? 1 : 0);
    assert.equal(p.portalDestination, count > 0 ? "autumn" : null);
    assert.equal(p.inventory.doubleCoins, combined);
    assert.equal(p.levels.headstart, 3);
    assert.equal(p.levels.doubleCoins, 2);
    invariant(p);
    stats.boundaryCases++;
  }
  const p = store.createProgress();
  p.wallet = max - 1;
  const s = run(1);
  s.coins = 50;
  assert.equal(bank(s, p).wallet, max);
  stats.boundaryCases++;
});
process.on("exit", () =>
  fs.writeFileSync(
    new URL("./store-economy-fuzz-results.json", import.meta.url),
    JSON.stringify(stats, null, 2),
  ),
);
