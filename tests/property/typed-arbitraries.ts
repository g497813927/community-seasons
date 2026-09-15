import * as fc from "fast-check";
import type { Progress } from "../../src/lib/game/store";
import type { SaveSnapshot } from "../../src/lib/game/cloud-save";
import type {
  BoostKind,
  BoostLevel,
  ConsumableKind,
  SkillKind,
  SkillProgress,
} from "../../src/lib/game/boosts";
import type { SceneKind } from "../../src/lib/game/scenes";
import type { Action } from "../../src/lib/game/engine";

type Fields<T> = { [K in keyof T]-?: fc.Arbitrary<T[K]> };
const safeCount = fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER });
const level = fc.constantFrom<BoostLevel>(1, 2, 3);
const scene = fc.constantFrom<SceneKind>("spring", "summer", "autumn", "winter");
const skill = fc.constantFrom<SkillKind>("shield", "magnet", "rush");
const boost = fc.constantFrom<BoostKind>(
  "headstart",
  "shield",
  "doubleCoins",
  "portal",
  "magnet",
  "rush",
);
const unlocked = fc.record({ unlocked: fc.boolean() } satisfies Fields<SkillProgress>);

// Exhaustive field maps catch required-field/type drift in the production schemas.
const progressFields = {
  version: fc.constant(1),
  wallet: safeCount,
  inventory: fc.record({
    headstart: safeCount,
    shield: safeCount,
    doubleCoins: safeCount,
    portal: fc.integer({ min: 0, max: 1 }),
  } satisfies Fields<Progress["inventory"]>),
  skills: fc.record({ shield: unlocked, magnet: unlocked, rush: unlocked } satisfies Fields<
    Progress["skills"]
  >),
  levels: fc.record({
    headstart: level,
    shield: level,
    doubleCoins: level,
    portal: fc.constant(1),
    magnet: level,
    rush: level,
  } satisfies Fields<Progress["levels"]>),
  equippedSkill: fc.option(skill, { nil: null }),
  portalDestination: fc.option(scene, { nil: null }),
} satisfies Fields<Progress>;

export const validProgressArbitrary = fc.record(progressFields).map((progress) => ({
  ...progress,
  // A save is JSON data; emit plain records even when fc.record shrinks to
  // a null-prototype object. Prototype identity is not persisted by JSON.
  inventory: { ...progress.inventory },
  levels: { ...progress.levels },
  skills: {
    shield: { ...progress.skills.shield },
    magnet: { ...progress.skills.magnet },
    rush: { ...progress.skills.rush },
  },
  // Keep cross-field invariants valid while preserving each field's shrinker.
  portalDestination:
    progress.inventory.portal === 1 ? (progress.portalDestination ?? "spring") : null,
  equippedSkill:
    progress.equippedSkill && progress.skills[progress.equippedSkill].unlocked
      ? progress.equippedSkill
      : null,
})) satisfies fc.Arbitrary<Progress>;

export const validSaveArbitrary = fc
  .record({
    version: fc.constant(1),
    progress: validProgressArbitrary,
    best: safeCount,
    scene,
  } satisfies Fields<SaveSnapshot>)
  .map((snapshot) => ({ ...snapshot })) satisfies fc.Arbitrary<SaveSnapshot>;

const invalidCount = fc.oneof(
  fc.constantFrom(NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1),
  fc.double().filter((n) => !Number.isSafeInteger(n) || n < 0),
  fc
    .jsonValue({ maxDepth: 2 })
    .filter((value) => typeof value !== "number" || !Number.isSafeInteger(value) || value < 0),
);
const invalidLevel = fc
  .jsonValue({ maxDepth: 2 })
  .filter((value) => value !== 1 && value !== 2 && value !== 3);
const invalidScene = fc
  .jsonValue({ maxDepth: 2 })
  .filter(
    (value) =>
      typeof value !== "string" || !["spring", "summer", "autumn", "winter"].includes(value),
  );
const invalidShape = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer(),
  fc.string(),
  fc.array(fc.jsonValue({ maxDepth: 1 }), { maxLength: 4 }),
);

export type InvalidSaveMutation =
  | { kind: "wallet"; value: unknown }
  | { kind: "inventory"; field: ConsumableKind; value: unknown }
  | { kind: "level"; field: BoostKind; value: unknown }
  | { kind: "scene"; value: unknown }
  | { kind: "version"; value: unknown }
  | {
      kind: "shape";
      field: keyof Pick<Progress, "inventory" | "skills" | "levels">;
      value: unknown;
    };

export const invalidSaveMutationArbitrary = fc.oneof(
  fc.record({ kind: fc.constant("wallet" as const), value: invalidCount }),
  fc.record({
    kind: fc.constant("inventory" as const),
    field: fc.constantFrom<ConsumableKind>("headstart", "shield", "doubleCoins", "portal"),
    value: invalidCount,
  }),
  fc.record({ kind: fc.constant("level" as const), field: boost, value: invalidLevel }),
  fc.record({ kind: fc.constant("scene" as const), value: invalidScene }),
  fc.record({
    kind: fc.constant("version" as const),
    value: fc.jsonValue({ maxDepth: 2 }).filter((v) => v !== 1),
  }),
  fc.record({
    kind: fc.constant("shape" as const),
    field: fc.constantFrom("inventory" as const, "skills" as const, "levels" as const),
    value: invalidShape,
  }),
) satisfies fc.Arbitrary<InvalidSaveMutation>;

/** Mutations deliberately return unknown, never pretend damaged data is SaveSnapshot. */
export function mutateSave(snapshot: SaveSnapshot, mutation: InvalidSaveMutation): unknown {
  const source = structuredClone(snapshot);
  switch (mutation.kind) {
    case "wallet":
      return { ...source, progress: { ...source.progress, wallet: mutation.value } };
    case "inventory":
      return {
        ...source,
        progress: {
          ...source.progress,
          inventory: { ...source.progress.inventory, [mutation.field]: mutation.value },
        },
      };
    case "level":
      return {
        ...source,
        progress: {
          ...source.progress,
          levels: { ...source.progress.levels, [mutation.field]: mutation.value },
        },
      };
    case "scene":
      return { ...source, scene: mutation.value };
    case "version":
      return { ...source, version: mutation.value };
    case "shape":
      return { ...source, progress: { ...source.progress, [mutation.field]: mutation.value } };
  }
}

export const invalidSaveArbitrary = fc
  .tuple(validSaveArbitrary, invalidSaveMutationArbitrary)
  .map(([snapshot, mutation]) => ({ snapshot, mutation, invalid: mutateSave(snapshot, mutation) }));

export type ValidInputCommand =
  | { kind: "movement"; action: Action }
  | { kind: "boost"; boost: BoostKind; level: BoostLevel }
  | { kind: "tick"; seconds: number }
  | { kind: "answer"; lane: -1 | 0 | 1 };
export type InputCommand =
  | ValidInputCommand
  | { kind: "invalid-action"; value: unknown }
  | { kind: "invalid-lane"; value: unknown }
  | { kind: "invalid-level"; boost: BoostKind; value: unknown };

export const validInputArbitrary = fc.oneof(
  fc.record({
    kind: fc.constant("movement" as const),
    action: fc.constantFrom<Action>("left", "right", "jump", "slide"),
  }),
  fc.record({ kind: fc.constant("boost" as const), boost, level }),
  fc.record({
    kind: fc.constant("tick" as const),
    seconds: fc.double({ min: 0, max: 0.5, noNaN: true }),
  }),
  fc.record({ kind: fc.constant("answer" as const), lane: fc.constantFrom<-1 | 0 | 1>(-1, 0, 1) }),
) satisfies fc.Arbitrary<ValidInputCommand>;
export const inputCommandArbitrary = fc.oneof(
  validInputArbitrary,
  fc.record({
    kind: fc.constant("invalid-action" as const),
    value: fc
      .jsonValue({ maxDepth: 2 })
      .filter((v) => typeof v !== "string" || !["left", "right", "jump", "slide"].includes(v)),
  }),
  fc.record({
    kind: fc.constant("invalid-lane" as const),
    value: fc.anything({ maxDepth: 2 }).filter((v) => v !== -1 && v !== 0 && v !== 1),
  }),
  fc.record({ kind: fc.constant("invalid-level" as const), boost, value: invalidLevel }),
) satisfies fc.Arbitrary<InputCommand>;
