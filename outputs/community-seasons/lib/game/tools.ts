import type { Action, RunState } from "./engine";
import { currentRailQuestion } from "./railway";
import {
  BOOSTERS,
  PERMANENT_SKILLS,
  UPGRADE_BOOSTERS,
  isBoostKind,
  isSkillKind,
  type BoostKind,
  type SkillKind,
} from "./boosts";
import type { Progress, StoreResult } from "./store";
import { SCENES, isSceneKind, type SceneKind } from "./scenes";
interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean };
  execute: (input: unknown) => unknown;
}
interface ModelContext {
  registerTool: (tool: Tool, options: { signal: AbortSignal }) => void | Promise<void>;
}
interface StoreAccess {
  read: () => Progress;
  isOpen: () => boolean;
  open: (open: boolean) => void;
  buy: (kind: BoostKind, destination?: SceneKind) => StoreResult;
  use: (kind: BoostKind) => StoreResult | undefined;
  unlock: (kind: BoostKind) => StoreResult;
  triggerSkill: (kind: BoostKind) => StoreResult | undefined;
  equip: (kind: BoostKind) => StoreResult;
  upgrade: (kind: BoostKind) => StoreResult;
  setupOpen: () => boolean;
  begin: (kind: SkillKind | null) => void;
  home: () => void;
}
const actions = [
  "start",
  "home",
  "pause",
  "resume",
  "left",
  "right",
  "jump",
  "slide",
  "open_store",
  "close_store",
] as const;
export function registerGameTools(
  read: () => RunState,
  start: () => void,
  move: (action: Action) => void,
  pause: () => void,
  store: StoreAccess,
) {
  const context = (document as Document & { modelContext?: ModelContext }).modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const snapshot = () => {
    const s = read(),
      p = store.read();
    return {
      mode: s.mode,
      lessonOpen: !!s.review,
      reviewedPosts: s.reviewedPosts,
      scene: s.scene,
      availableScenes: SCENES.map(({ id, name }) => ({ id, name })),
      score: s.score,
      distance: Math.floor(s.distance),
      coins: s.coins,
      lane: s.lane,
      motion: { jump: s.jump, slide: s.slide, x: s.x },
      wallet: p.wallet,
      inventory: { ...p.inventory },
      portalDestination: p.portalDestination,
      nextPortalAt: s.nextPortalAt,
      portalLane: s.portalLane,
      milestone: s.milestone,
      pendingScene: s.pendingScene,
      sceneTransition: s.sceneTransition,
      fork: s.fork ? { ...s.fork } : null,
      turnDirection: s.turnDirection,
      turnRemaining: s.turnRemaining,
      railway: s.rail
        ? {
            phase: s.rail.phase,
            questionNumber: s.rail.index + 1,
            totalQuestions: s.rail.questions.length,
            secondsRemaining: s.rail.remaining,
            prompt: currentRailQuestion(s)?.prompt,
            answers: s.rail.optionOrder.map((optionIndex, index) => ({
              lane: index - 1,
              text: currentRailQuestion(s)?.options[optionIndex].label,
            })),
            correctCount: s.rail.correctCount,
          }
        : null,
      boosts: { ...s.boosts },
      levels: { ...p.levels },
      unlockedSkills: PERMANENT_SKILLS.filter(({ id }) => p.skills[id].unlocked).map(
        ({ id }) => id,
      ),
      selectedForNextRun: p.equippedSkill,
      permanentSkill: s.permanentSkill,
      skillCharge: s.skillCharge,
      chaseSeconds: s.chase,
      stumbles: s.stumbles,
      storeOpen: store.isOpen(),
      setupOpen: store.setupOpen(),
    };
  };
  const afterRender = async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return snapshot();
  };
  const tools: Tool[] = [
    {
      name: "read_run_state",
      description:
        "Read the current run, coin bank, inventory, levels, equipped skill and its per-run charge, active effects, and open dialogs.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => snapshot(),
    },
    {
      name: "control_run",
      description:
        "The start action opens skill selection before a new run; use begin_run next. Pause or resume the game, move the runner, or open/close the store. Shopping pauses a live run; closing leaves it paused. The home action ends the run, saves earned coins and best score, and returns to the home screen.",
      inputSchema: {
        type: "object",
        properties: { action: { type: "string", enum: actions } },
        required: ["action"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      async execute(input: unknown) {
        if (
          !input ||
          typeof input !== "object" ||
          Object.keys(input).length !== 1 ||
          !("action" in input) ||
          typeof input.action !== "string" ||
          !(actions as readonly string[]).includes(input.action)
        )
          throw new Error("Provide one valid action.");
        const action = input.action;
        if (store.setupOpen() && action !== "open_store" && action !== "home")
          throw new Error("Choose a skill with begin_run before controlling the run.");
        if (action === "home") store.home();
        else if (action === "open_store") store.open(true);
        else if (action === "close_store") store.open(false);
        else {
          if (store.isOpen()) throw new Error("Close the store before controlling the run.");
          if (action === "start") start();
          else if (action === "pause") {
            if (read().mode !== "running") throw new Error("The run is not active.");
            pause();
          } else if (action === "resume") {
            if (read().mode !== "paused") throw new Error("The run is not paused.");
            pause();
          } else {
            if (read().mode !== "running") throw new Error("Start or resume the run first.");
            move(action as Action);
          }
        }
        return afterRender();
      },
    },
  ];
  tools.push({
    name: "begin_run",
    description:
      "Begin a new run from skill selection in the last reached world. Choose one unlocked permanent skill, or null for none. Worlds change through optional portals every 2500m whose lane is shown as they approach or a purchased Season Pass booster; there is no free scene selection.",
    inputSchema: {
      type: "object",
      properties: {
        skill: {
          type: ["string", "null"],
          enum: [null, ...PERMANENT_SKILLS.map((b) => b.id)],
        },
      },
      required: ["skill"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    async execute(input: unknown) {
      if (
        !input ||
        typeof input !== "object" ||
        Object.keys(input).length !== 1 ||
        !("skill" in input) ||
        (input.skill !== null && !isSkillKind(input.skill))
      )
        throw new Error("Choose shield, magnet, rush, or null.");
      if (!store.setupOpen() || store.isOpen())
        throw new Error("Open skill selection with the start action first.");
      if (input.skill && !store.read().skills[input.skill].unlocked)
        throw new Error("Unlock this skill in the store first.");
      store.begin(input.skill);
      return afterRender();
    },
  });
  const operations = [
    {
      name: "buy_booster",
      shop: true,
      run: store.buy,
      description: "Spend banked game coins on one booster. The store must be open.",
    },
    {
      name: "activate_booster",
      shop: false,
      run: store.use,
      description:
        "Consume one owned Fresh Start or Season Pass (first 5 seconds only), Shield, or Shared Rewards booster in a live run. All dialogs must be closed.",
    },
    {
      name: "unlock_permanent_skill",
      shop: true,
      run: store.unlock,
      description:
        "Spend banked game coins to unlock a reusable permanent skill. The store must be open.",
    },
    {
      name: "equip_permanent_skill",
      shop: true,
      run: store.equip,
      description:
        "Remember an unlocked skill for the next run selection. Does not change the current run skill. The store must be open.",
    },
    {
      name: "upgrade_booster",
      shop: true,
      run: store.upgrade,
      description:
        "Spend banked coins to increase a booster one level, up to level 3. Improves future purchased, collected, and matching skill activations. The store must be open.",
    },
    {
      name: "activate_permanent_skill",
      shop: false,
      run: store.triggerSkill,
      description:
        "Use the equipped skill when its charge is full from coins collected this run. Does not use inventory. All dialogs must be closed.",
    },
  ];
  for (const operation of operations) {
    const allowedKinds = (
      operation.name === "upgrade_booster"
        ? UPGRADE_BOOSTERS
        : operation.name.includes("permanent_skill")
          ? PERMANENT_SKILLS
          : BOOSTERS
    ).map((b) => b.id);
    tools.push({
      name: operation.name,
      description: operation.description,
      inputSchema: {
        type: "object",
        properties: {
          kind: { type: "string", enum: allowedKinds },
          ...(operation.name === "buy_booster"
            ? {
                destination: {
                  type: "string",
                  enum: SCENES.map(({ id }) => id),
                },
              }
            : {}),
        },
        required: ["kind"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      async execute(input: unknown) {
        if (
          !input ||
          typeof input !== "object" ||
          Object.keys(input).some(
            (key) => key !== "kind" && !(key === "destination" && operation.name === "buy_booster"),
          ) ||
          !("kind" in input) ||
          !isBoostKind(input.kind) ||
          !allowedKinds.includes(input.kind)
        )
          throw new Error(`Choose one of: ${allowedKinds.join(", ")}.`);
        if ("destination" in input && (input.kind !== "portal" || !isSceneKind(input.destination)))
          throw new Error("A valid destination is only available for Season Pass.");
        if (
          operation.name === "buy_booster" &&
          input.kind === "portal" &&
          (!("destination" in input) ||
            !isSceneKind(input.destination) ||
            input.destination === read().scene)
        )
          throw new Error("Choose a Season Pass destination other than your current world.");
        if (operation.shop && !store.isOpen()) throw new Error("Open the store first.");
        if (!operation.shop && (store.isOpen() || store.setupOpen() || read().mode !== "running"))
          throw new Error("Close dialogs and start or resume the run first.");
        const result =
          operation.name === "buy_booster"
            ? store.buy(
                input.kind,
                "destination" in input ? (input.destination as SceneKind) : undefined,
              )
            : operation.run(input.kind);
        if (!result?.ok) throw new Error(result?.message ?? "The booster could not be used.");
        return afterRender();
      },
    });
  }
  for (const tool of tools) {
    try {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(
        () => {},
      );
    } catch {}
  }
  return () => lifecycle.abort();
}
