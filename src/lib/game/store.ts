import { activateBoost, startSceneTravel, type RunState } from "./engine";
import { isSceneKind, type SceneKind } from "./scenes";
import { DEFAULT_SKIN, SKINS, isSkinId, skinDefinition, type SkinId } from "./skins";
import {
  ACCESSORIES,
  COSMETIC_SLOTS,
  createOutfit,
  accessoryDefinition,
  isAccessoryForSlot,
  normalizeOutfit,
  type AccessoryId,
  type CosmeticSlot,
  type Outfit,
} from "./cosmetics";
import {
  boostDefinition,
  isBoostKind,
  isSkillKind,
  isConsumableKind,
  createInventory,
  HEAD_START_WINDOW,
  UPGRADE_BOOSTERS,
  type SkillKind,
  type ConsumableKind,
  createSkillProgress,
  createBoostLevels,
  normalizeBoostLevel,
  upgradePrice,
  skillDefinition,
  PERMANENT_SKILLS,
  type BoostKind,
  type BoostLevel,
  type SkillProgress,
} from "./boosts";
export const PROGRESS_KEY = "community-seasons-progress-v1";
export interface Progress {
  version: 1;
  wallet: number;
  inventory: Record<ConsumableKind, number>;
  skills: Record<SkillKind, SkillProgress>;
  levels: Record<BoostKind, BoostLevel>;
  equippedSkill: SkillKind | null;
  ownedSkins: SkinId[];
  equippedSkin: SkinId;
  ownedAccessories: AccessoryId[];
  outfit: Outfit;
  portalDestination: SceneKind | null;
}
export type StoreResult =
  | { ok: true; progress: Progress; message: string }
  | { ok: false; message: string };
export function createProgress(): Progress {
  return {
    version: 1,
    wallet: 0,
    inventory: createInventory(),
    skills: createSkillProgress(),
    levels: createBoostLevels(),
    equippedSkill: null,
    ownedSkins: [DEFAULT_SKIN],
    equippedSkin: DEFAULT_SKIN,
    ownedAccessories: [],
    outfit: createOutfit(),
    portalDestination: null,
  };
}
function validCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
export function nextPortalScene(progress: Progress): SceneKind | null {
  return progress.inventory.portal > 0 ? progress.portalDestination : null;
}
export function readProgress(raw: string | null): Progress {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1)
      return createProgress();
    const record = value as Record<string, unknown>;
    const savedSkins = Array.isArray(record.ownedSkins) ? record.ownedSkins : [];
    const ownedSkins = SKINS.filter(
      ({ id }) => id === DEFAULT_SKIN || savedSkins.includes(id),
    ).map(({ id }) => id);
    const savedAccessories = Array.isArray(record.ownedAccessories) ? record.ownedAccessories : [];
    const ownedAccessories = ACCESSORIES.filter(({ id }) => savedAccessories.includes(id)).map(
      ({ id }) => id,
    );
    const inventory =
      record.inventory && typeof record.inventory === "object"
        ? (record.inventory as Record<string, unknown>)
        : {};
    const skills = createSkillProgress();
    const savedLevels =
      record.levels && typeof record.levels === "object"
        ? (record.levels as Record<string, unknown>)
        : {};
    const levels = createBoostLevels();
    for (const { id } of UPGRADE_BOOSTERS) levels[id] = normalizeBoostLevel(savedLevels[id]);
    if (!("headstart" in savedLevels)) levels.headstart = normalizeBoostLevel(savedLevels.rush);
    if (!("doubleCoins" in savedLevels))
      levels.doubleCoins = normalizeBoostLevel(savedLevels.magnet);
    const savedSkills =
      record.skills && typeof record.skills === "object"
        ? (record.skills as Record<string, unknown>)
        : {};
    for (const definition of PERMANENT_SKILLS) {
      levels[definition.id] = normalizeBoostLevel(savedLevels[definition.id]);
      const saved = savedSkills[definition.id];
      if (saved && typeof saved === "object" && "unlocked" in saved && saved.unlocked === true) {
        skills[definition.id] = { unlocked: true };
      }
    }
    let headstart = Math.min(
      Number.MAX_SAFE_INTEGER,
      validCount(inventory.headstart) + validCount(inventory.rush),
    );
    let portalDestination: SceneKind | null =
      validCount(inventory.portal) > 0 && isSceneKind(record.portalDestination)
        ? record.portalDestination
        : null;
    // Preserve the first previously purchased destination as the single portal.
    // Other old 40-coin copies remain usable as regular Fresh Starts.
    if (!("portalDestination" in record) && !portalDestination && headstart > 0) {
      const route = (Array.isArray(record.headStartRoutes) ? record.headStartRoutes : []).find(
        (r) => r && isSceneKind(r.scene) && validCount(r.count) > 0,
      );
      if (route) {
        portalDestination = route.scene;
        headstart--;
      }
    }
    return {
      version: 1,
      wallet: validCount(record.wallet),
      inventory: {
        shield: validCount(inventory.shield),
        headstart,
        portal: portalDestination ? 1 : 0,
        doubleCoins: Math.min(
          Number.MAX_SAFE_INTEGER,
          validCount(inventory.doubleCoins) + validCount(inventory.magnet),
        ),
      },
      skills,
      portalDestination,
      levels,
      equippedSkill:
        isSkillKind(record.equippedSkill) && skills[record.equippedSkill].unlocked
          ? record.equippedSkill
          : null,
      ownedSkins,
      ownedAccessories,
      outfit: normalizeOutfit(record.outfit, ownedAccessories),
      equippedSkin:
        isSkinId(record.equippedSkin) && ownedSkins.includes(record.equippedSkin)
          ? record.equippedSkin
          : DEFAULT_SKIN,
    };
  } catch {
    return createProgress();
  }
}
// Credit only the new coins from this run, including its last frame. Starting
// another run resets its checkpoint, while the wallet remains persistent.
export function bankRunRewards(run: RunState, progress: Progress): Progress {
  if (run.skillRechargeLocked && run.permanentSkill && run.boosts[run.permanentSkill] <= 0)
    run.skillRechargeLocked = false;
  const delta = Math.max(0, run.coins - run.bankedCoins);
  if (delta === 0) return progress;
  run.bankedCoins = run.coins;
  // Coins collected before an effect expired in this same frame still cannot
  // recharge it. The full amount is always banked, including Shared Rewards.
  const chargeDelta = run.skillRechargeLocked ? 0 : Math.max(0, delta - run.skillBlockedCoins);
  run.skillBlockedCoins = 0;
  const skills = { ...progress.skills };
  for (const definition of PERMANENT_SKILLS) {
    const skill = skills[definition.id];
    if (skill.unlocked && run.permanentSkill === definition.id)
      run.skillCharge = Math.min(definition.chargeCoins, run.skillCharge + chargeDelta);
  }
  return {
    ...progress,
    wallet: Math.min(Number.MAX_SAFE_INTEGER, progress.wallet + delta),
    skills,
  };
}
export function unlockSkill(progress: Progress, kind: BoostKind): StoreResult {
  if (!isSkillKind(kind)) return { ok: false, message: "Choose a permanent skill." };
  const definition = skillDefinition(kind);
  if (progress.skills[kind].unlocked)
    return {
      ok: false,
      message: "This skill is already permanently unlocked.",
    };
  if (progress.wallet < definition.price)
    return {
      ok: false,
      message: `Collect ${definition.price - progress.wallet} more coins to unlock ${definition.name}.`,
    };
  return {
    ok: true,
    message: `${definition.name} unlocked forever. Equip it for your next run to start charging.`,
    progress: {
      ...progress,
      wallet: progress.wallet - definition.price,
      skills: { ...progress.skills, [kind]: { unlocked: true } },
    },
  };
}
export function activatePermanentSkill(
  run: RunState,
  progress: Progress,
  kind: BoostKind,
): StoreResult {
  if (!isSkillKind(kind)) return { ok: false, message: "Choose a permanent skill." };
  const definition = skillDefinition(kind),
    skill = progress.skills[kind];
  if (run.mode !== "running")
    return { ok: false, message: "Start or resume your run to use a skill." };
  if (run.sceneTransition > 0) return { ok: false, message: "Wait until you leave the tunnel." };
  if (run.permanentSkill !== kind)
    return {
      ok: false,
      message: "Only the permanent skill equipped for this run can be triggered.",
    };
  if (!skill.unlocked)
    return {
      ok: false,
      message: `Unlock ${definition.name} in the store first.`,
    };
  if (run.skillRechargeLocked && run.boosts[kind] > 0)
    return {
      ok: false,
      message: "Your skill is active. Charging resumes when the effect ends.",
    };
  if (run.skillCharge < definition.chargeCoins)
    return {
      ok: false,
      message: "Keep collecting coins to charge your skill.",
    };
  if (!activateBoost(run, kind, progress.levels[kind]))
    return {
      ok: false,
      message: `${boostDefinition(kind).shortName} is already active. Your charge is saved.`,
    };
  run.skillCharge = 0;
  run.skillRechargeLocked = true;
  return {
    ok: true,
    message: `${definition.name} activated! Charging resumes when the effect ends.`,
    progress,
  };
}
export function equipPermanentSkill(progress: Progress, kind: BoostKind): StoreResult {
  if (!isSkillKind(kind) || !progress.skills[kind].unlocked)
    return {
      ok: false,
      message: "Unlock this permanent skill before equipping it.",
    };
  return {
    ok: true,
    message: `${skillDefinition(kind).name} selected for your next run.`,
    progress: { ...progress, equippedSkill: kind },
  };
}
export function buySkin(progress: Progress, kind: SkinId): StoreResult {
  if (!isSkinId(kind)) return { ok: false, message: "Choose a TV skin from the store." };
  const definition = skinDefinition(kind);
  if (progress.ownedSkins.includes(kind))
    return { ok: false, message: "This skin is already permanently unlocked." };
  if (progress.wallet < definition.price)
    return {
      ok: false,
      message: `Collect ${definition.price - progress.wallet} more coins to unlock ${definition.name}.`,
    };
  return {
    ok: true,
    message: `${definition.name} unlocked forever and equipped.`,
    progress: {
      ...progress,
      wallet: progress.wallet - definition.price,
      ownedSkins: SKINS.filter(
        ({ id }) => progress.ownedSkins.includes(id) || id === kind,
      ).map(({ id }) => id),
      equippedSkin: kind,
    },
  };
}
export function equipSkin(progress: Progress, kind: SkinId): StoreResult {
  if (!isSkinId(kind)) return { ok: false, message: "Choose a TV skin from the store." };
  if (!progress.ownedSkins.includes(kind))
    return { ok: false, message: "Unlock this skin before equipping it." };
  return {
    ok: true,
    message: `${skinDefinition(kind).name} equipped.`,
    progress: { ...progress, equippedSkin: kind },
  };
}
export function buyAccessory(progress: Progress, kind: AccessoryId): StoreResult {
  const definition = accessoryDefinition(kind);
  if (!definition) return { ok: false, message: "Choose an accessory from the store." };
  if (progress.ownedAccessories.includes(kind))
    return { ok: false, message: "This accessory is already permanently unlocked." };
  if (progress.wallet < definition.price)
    return {
      ok: false,
      message: `Collect ${definition.price - progress.wallet} more coins to unlock ${definition.name}.`,
    };
  return {
    ok: true,
    message: `${definition.name} unlocked forever and equipped.`,
    progress: {
      ...progress,
      wallet: progress.wallet - definition.price,
      ownedAccessories: ACCESSORIES.filter(
        ({ id }) => progress.ownedAccessories.includes(id) || id === kind,
      ).map(({ id }) => id),
      outfit: { ...progress.outfit, [definition.slot]: kind },
    },
  };
}
export function equipAccessory(
  progress: Progress,
  slot: CosmeticSlot,
  kind: AccessoryId | null,
): StoreResult {
  if (!COSMETIC_SLOTS.includes(slot)) return { ok: false, message: "Choose an accessory category." };
  if (kind !== null) {
    if (!accessoryDefinition(kind)) return { ok: false, message: "Choose an accessory from the store." };
    if (!isAccessoryForSlot(slot, kind)) return { ok: false, message: "Choose an accessory for this category." };
    if (!progress.ownedAccessories.includes(kind))
      return { ok: false, message: "Unlock this accessory before equipping it." };
  }
  return {
    ok: true,
    message: kind === null ? "Accessory removed." : `${accessoryDefinition(kind)!.name} equipped.`,
    progress: { ...progress, outfit: { ...progress.outfit, [slot]: kind } },
  };
}
export function buyBooster(
  progress: Progress,
  kind: BoostKind,
  destination?: SceneKind,
  currentScene?: SceneKind,
): StoreResult {
  if (!isConsumableKind(kind)) return { ok: false, message: "Choose a booster from the store." };
  if (kind === "portal") {
    if (!isSceneKind(destination))
      return { ok: false, message: "Choose a Season Pass destination." };
    if (destination === currentScene)
      return { ok: false, message: "You are already in this world." };
    if (progress.inventory.portal > 0)
      return {
        ok: false,
        message: "Use your Season Pass before buying another.",
      };
  } else if (destination !== undefined)
    return { ok: false, message: "Only Season Pass changes your world." };
  const booster = boostDefinition(kind);
  if (progress.wallet < booster.price)
    return {
      ok: false,
      message: `Collect ${booster.price - progress.wallet} more coins for ${booster.shortName}.`,
    };
  if (progress.inventory[kind] >= Number.MAX_SAFE_INTEGER)
    return { ok: false, message: "Your inventory is full." };
  return {
    ok: true,
    message: `${booster.shortName} added to your inventory.`,
    progress: {
      ...progress,
      wallet: progress.wallet - booster.price,
      portalDestination: kind === "portal" ? destination! : progress.portalDestination,
      inventory: {
        ...progress.inventory,
        [kind]: progress.inventory[kind] + 1,
      },
    },
  };
}
export function activateOwnedBooster(
  run: RunState,
  progress: Progress,
  kind: BoostKind,
): StoreResult {
  if (!isConsumableKind(kind))
    return { ok: false, message: "Choose a booster from your inventory." };
  const booster = boostDefinition(kind);
  if (run.mode !== "running")
    return { ok: false, message: "Start or resume your run to use a booster." };
  if (run.sceneTransition > 0) return { ok: false, message: "Wait until you leave the tunnel." };
  if ((kind === "headstart" || kind === "portal") && run.time >= HEAD_START_WINDOW)
    return {
      ok: false,
      message: `${booster.shortName} is only available during the first 5 seconds. Your booster is saved.`,
    };
  if (progress.inventory[kind] <= 0)
    return {
      ok: false,
      message: `No ${booster.shortName} left. Open the store with B.`,
    };
  if (kind === "portal") {
    const destination = nextPortalScene(progress);
    if (!destination || destination === run.scene)
      return { ok: false, message: "You are already in this world." };
    if (run.boosts.portal > 0 || !startSceneTravel(run, destination))
      return { ok: false, message: "Wait until you leave the tunnel." };
    run.boosts.portal = 5;
    run.effectLevels.portal = 1;
  } else if (!activateBoost(run, kind, progress.levels[kind]))
    return { ok: false, message: `${booster.shortName} is already active.` };
  return {
    ok: true,
    message: `${booster.shortName} activated!`,
    progress: {
      ...progress,
      portalDestination: kind === "portal" ? null : progress.portalDestination,
      inventory: {
        ...progress.inventory,
        [kind]: progress.inventory[kind] - 1,
      },
    },
  };
}
export function upgradeBooster(progress: Progress, kind: BoostKind): StoreResult {
  if (!isBoostKind(kind)) return { ok: false, message: "Choose a booster to upgrade." };
  const current = progress.levels[kind],
    price = upgradePrice(kind, current);
  if (price === null) return { ok: false, message: "This booster is already at maximum level." };
  if (progress.wallet < price)
    return {
      ok: false,
      message: `Collect ${price - progress.wallet} more coins for this upgrade.`,
    };
  const next = (current + 1) as BoostLevel;
  return {
    ok: true,
    message: `${boostDefinition(kind).shortName} upgraded to level ${next}. Future uses of this effect are improved.`,
    progress: {
      ...progress,
      wallet: progress.wallet - price,
      levels: { ...progress.levels, [kind]: next },
    },
  };
}
