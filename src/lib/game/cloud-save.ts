import { isSceneKind, type SceneKind } from "./scenes";
import { readProgress, type Progress } from "./store";
import { DEFAULT_SKIN, isSkinId } from "./skins";
import { COSMETIC_SLOTS, isAccessoryId, isAccessoryForSlot } from "./cosmetics";

export const CLOUD_SAVE_KEY = "community-seasons-save-v1";
export const CLOUD_SYNC_KEY = "community-seasons-cloud-sync-v1";

export interface SaveSnapshot {
  version: 1;
  progress: Progress;
  best: number;
  scene: SceneKind;
}

export interface ToyCloudSdk {
  isSupport(ability: string): Promise<boolean>;
  getCloudStorage(keys?: string[]): Promise<Record<string, string>>;
  setCloudStorage(items: Record<string, string>): Promise<void>;
}

export type CloudSaveChoice = "use-cloud" | "use-local" | "local-only";
export interface CloudSaveConflict {
  reason: "migration" | "diverged" | "cloud-missing";
  local: SaveSnapshot;
  cloud: SaveSnapshot | null;
}
export interface CloudSaveState {
  status:
    | "local"
    | "checking"
    | "synced"
    | "queued"
    | "saving"
    | "conflict"
    | "error"
    | "unsupported"
    | "pending";
  conflict: CloudSaveConflict | null;
  error: "unavailable" | "invalid-save" | "too-large" | null;
}

interface CloudEnvelope {
  version: 1 | 2 | 3;
  revision: string;
  payload: SaveSnapshot;
}
interface Baseline {
  revision: string | null;
  payload: string;
}
interface SyncMetadata {
  version: 1;
  mode: "cloud" | "local";
  baseline: Baseline | null;
  dirty: boolean;
}
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
interface CloudSaveOptions {
  getSdk(): Promise<ToyCloudSdk | null>;
  storage: StorageLike;
  readLocal(): SaveSnapshot;
  writeLocal(snapshot: SaveSnapshot): void;
  hasLocalData(): boolean;
  /** Must stay false while a run or any editor of the local save is open. */
  canApply(): boolean;
  onChange?(state: CloudSaveState): void;
  debounceMs?: number;
  timeoutMs?: number;
  revision?(): string;
  timers?: {
    set(callback: () => void, delay: number): unknown;
    clear(timer: unknown): void;
  };
}

class SaveError extends Error {
  constructor(readonly kind: "unavailable" | "invalid-save" | "too-large") {
    super(kind);
  }
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Reject damaged/newer cloud saves instead of silently turning them into defaults. */
export function normalizeSaveSnapshot(value: unknown): SaveSnapshot {
  // Local progress and stored sync baselines predate envelope versioning.
  return normalizeSnapshot(value, 1);
}

function normalizeSnapshot(value: unknown, envelopeVersion: CloudEnvelope["version"]): SaveSnapshot {
  if (!isRecord(value) || value.version !== 1 || !isCount(value.best) || !isSceneKind(value.scene))
    throw new SaveError("invalid-save");
  const p = value.progress;
  if (
    !isRecord(p) ||
    p.version !== 1 ||
    !isCount(p.wallet) ||
    !isRecord(p.inventory) ||
    !isRecord(p.skills) ||
    !isRecord(p.levels)
  )
    throw new SaveError("invalid-save");
  const { inventory, skills, levels } = p;
  if (
    !["shield", "headstart", "portal", "doubleCoins"].every((key) => isCount(inventory[key])) ||
    !["shield", "magnet", "rush"].every(
      (key) => isRecord(skills[key]) && typeof skills[key].unlocked === "boolean",
    ) ||
    !["shield", "magnet", "rush", "headstart", "doubleCoins", "portal"].every(
      (key) =>
        Number.isInteger(levels[key]) && Number(levels[key]) >= 1 && Number(levels[key]) <= 3,
    ) ||
    !(
      p.equippedSkill === null ||
      (typeof p.equippedSkill === "string" &&
        ["shield", "magnet", "rush"].includes(p.equippedSkill))
    ) ||
    !(p.portalDestination === null || isSceneKind(p.portalDestination))
  )
    throw new SaveError("invalid-save");
  if (
    Number(inventory.portal) > 1 ||
    levels.portal !== 1 ||
    (inventory.portal === 1) !== (p.portalDestination !== null) ||
    (p.equippedSkill !== null &&
      !(p.skills[String(p.equippedSkill)] as Record<string, unknown>).unlocked)
  )
    throw new SaveError("invalid-save");
  // Skins are required from envelope v2. Only older envelopes may omit the
  // entire pair; a partial pair is damaged data in every version.
  if (envelopeVersion >= 2 || "ownedSkins" in p || "equippedSkin" in p) {
    if (
      !Array.isArray(p.ownedSkins) ||
      !p.ownedSkins.every(isSkinId) ||
      !p.ownedSkins.includes(DEFAULT_SKIN) ||
      new Set(p.ownedSkins).size !== p.ownedSkins.length ||
      !isSkinId(p.equippedSkin) ||
      !p.ownedSkins.includes(p.equippedSkin)
    )
      throw new SaveError("invalid-save");
  }
  // Accessories are required from envelope v3. Older envelopes may omit
  // both fields, but present data must always form a complete owned outfit.
  if (envelopeVersion >= 3 || "ownedAccessories" in p || "outfit" in p) {
    if (
      !Array.isArray(p.ownedAccessories) ||
      !p.ownedAccessories.every(isAccessoryId) ||
      new Set(p.ownedAccessories).size !== p.ownedAccessories.length ||
      !isRecord(p.outfit) ||
      Object.keys(p.outfit).length !== COSMETIC_SLOTS.length
    )
      throw new SaveError("invalid-save");
    const { outfit, ownedAccessories } = p;
    for (const slot of COSMETIC_SLOTS) {
      const selected = outfit[slot];
      if (selected !== null && (!isAccessoryForSlot(slot, selected) || !ownedAccessories.includes(selected)))
        throw new SaveError("invalid-save");
    }
  }
  return {
    version: 1,
    progress: readProgress(JSON.stringify(p)),
    best: value.best,
    scene: value.scene,
  };
}

function snapshotText(value: SaveSnapshot): string {
  return JSON.stringify(normalizeSaveSnapshot(value));
}

export function encodeCloudSave(payload: SaveSnapshot, revision: string): string {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(revision)) throw new SaveError("invalid-save");
  // Older clients reject this envelope before they can discard purchased accessories.
  // Keep the storage key stable so those clients cannot overwrite a newer save.
  const text = JSON.stringify({ version: 3, revision, payload: normalizeSnapshot(payload, 3) });
  if (new TextEncoder().encode(text).byteLength > 1024) throw new SaveError("too-large");
  return text;
}

export function decodeCloudSave(text: string): CloudEnvelope {
  try {
    if (new TextEncoder().encode(text).byteLength > 1024) throw new SaveError("too-large");
    const value: unknown = JSON.parse(text);
    if (
      !isRecord(value) ||
      (value.version !== 1 && value.version !== 2 && value.version !== 3) ||
      typeof value.revision !== "string" ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(value.revision)
    )
      throw new SaveError("invalid-save");
    return { version: value.version, revision: value.revision, payload: normalizeSnapshot(value.payload, value.version) };
  } catch (error) {
    throw error instanceof SaveError ? error : new SaveError("invalid-save");
  }
}

function readMetadata(storage: StorageLike): SyncMetadata {
  const blank: SyncMetadata = { version: 1, mode: "cloud", baseline: null, dirty: false };
  try {
    const value = JSON.parse(storage.getItem(CLOUD_SYNC_KEY) ?? "null");
    if (!isRecord(value) || value.version !== 1 || !["local", "cloud"].includes(String(value.mode)))
      return blank;
    let baseline: Baseline | null = null;
    if (isRecord(value.baseline)) {
      const { revision, payload } = value.baseline;
      if ((revision === null || typeof revision === "string") && typeof payload === "string")
        baseline = { revision, payload: snapshotText(normalizeSaveSnapshot(JSON.parse(payload))) };
    }
    return {
      version: 1,
      mode: value.mode as "local" | "cloud",
      baseline,
      dirty: value.dirty === true,
    };
  } catch {
    return blank;
  }
}

/**
 * Toy has no compare-and-swap operation. Read-before-write and unique revisions
 * detect observed conflicts, but simultaneous writes from two devices between
 * their last reads and writes can still race. We never use device clocks to
 * decide which save wins, and keep the browser copy on every network failure.
 */
export function createCloudSaveController(options: CloudSaveOptions) {
  const timers = options.timers ?? {
    set: (callback: () => void, delay: number) => setTimeout(callback, delay),
    clear: (timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  };
  const metadata = readMetadata(options.storage);
  const initialLocalText = snapshotText(options.readLocal());
  let state: CloudSaveState = { status: "local", conflict: null, error: null };
  let sdk: ToyCloudSdk | null = null;
  let disposed = false;
  let generation = 0;
  let timer: unknown = null;
  let queue: Promise<void> = Promise.resolve();
  let queuedFlush: Promise<void> | null = null;
  let outstandingWrite: Promise<void> | null = null;
  let reviewedCloud: CloudEnvelope | null = null;
  let dirty = metadata.dirty;

  function notify(
    status: CloudSaveState["status"],
    conflict: CloudSaveConflict | null = null,
    error: CloudSaveState["error"] = null,
  ) {
    if (disposed) return;
    state = { status, conflict, error };
    options.onChange?.(state);
  }
  function saveMetadata() {
    metadata.dirty = dirty;
    try {
      options.storage.setItem(CLOUD_SYNC_KEY, JSON.stringify(metadata));
    } catch {
      // The controller still keeps a session baseline when browser storage is unavailable.
    }
  }
  function cancelTimer() {
    if (timer !== null) timers.clear(timer);
    timer = null;
  }
  function isCurrent(token: number) {
    return !disposed && token === generation && metadata.mode === "cloud";
  }
  function bounded<T>(promise: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = timers.set(
        () => reject(new SaveError("unavailable")),
        options.timeoutMs ?? 8000,
      );
      promise.then(
        (value) => {
          timers.clear(timeout);
          resolve(value);
        },
        (error) => {
          timers.clear(timeout);
          reject(error);
        },
      );
    });
  }
  function enqueue(operation: (token: number) => Promise<void>): Promise<void> {
    const token = generation;
    const next = queue.then(async () => {
      if (!isCurrent(token)) return;
      try {
        // A timed-out SDK write may still reach Toy. Never overlap another
        // operation with it; once it settles, reconciliation reads its result.
        if (outstandingWrite) await bounded(outstandingWrite.catch(() => {}));
        if (!isCurrent(token)) return;
        await operation(token);
      } catch (error) {
        if (!isCurrent(token)) return;
        cancelTimer();
        notify("error", state.conflict, error instanceof SaveError ? error.kind : "unavailable");
      }
    });
    queue = next;
    return next;
  }
  async function connect(token: number): Promise<boolean> {
    if (sdk) return true;
    const candidate = await bounded(options.getSdk());
    if (!isCurrent(token)) return false;
    if (!candidate) {
      notify("unsupported");
      return false;
    }
    const support = await bounded(
      Promise.all([candidate.isSupport("getCloudStorage"), candidate.isSupport("setCloudStorage")]),
    );
    if (!isCurrent(token)) return false;
    if (!support.every(Boolean)) {
      notify("unsupported");
      return false;
    }
    sdk = candidate;
    return true;
  }
  async function readCloud(): Promise<CloudEnvelope | null> {
    const result = await bounded(sdk!.getCloudStorage([CLOUD_SAVE_KEY]));
    if (!isRecord(result)) throw new SaveError("invalid-save");
    if (!(CLOUD_SAVE_KEY in result)) return null;
    if (typeof result[CLOUD_SAVE_KEY] !== "string") throw new SaveError("invalid-save");
    return decodeCloudSave(result[CLOUD_SAVE_KEY]);
  }
  function matches(remote: CloudEnvelope | null, baseline: Baseline | null): boolean {
    return (
      !!baseline &&
      (remote?.revision ?? null) === baseline.revision &&
      (!remote || snapshotText(remote.payload) === baseline.payload)
    );
  }
  function sameRemote(a: CloudEnvelope | null, b: CloudEnvelope | null): boolean {
    return a === null
      ? b === null
      : b !== null &&
          a.revision === b.revision &&
          snapshotText(a.payload) === snapshotText(b.payload);
  }
  function accept(remote: CloudEnvelope | null, local: SaveSnapshot) {
    metadata.baseline = {
      revision: remote?.revision ?? null,
      payload: snapshotText(remote?.payload ?? local),
    };
    dirty = false;
    saveMetadata();
    notify("synced");
  }
  function conflict(
    remote: CloudEnvelope | null,
    local: SaveSnapshot,
    reason: CloudSaveConflict["reason"],
  ) {
    cancelTimer();
    reviewedCloud = remote;
    notify("conflict", { reason, local, cloud: remote?.payload ?? null });
  }
  function apply(remote: CloudEnvelope, local: SaveSnapshot) {
    if (!options.canApply()) {
      notify("pending");
      return;
    }
    if (snapshotText(remote.payload) !== snapshotText(local)) options.writeLocal(remote.payload);
    accept(remote, remote.payload);
  }
  async function write(expected: CloudEnvelope | null, token: number, reviewedLocal?: string) {
    const latest = await readCloud();
    if (!isCurrent(token)) return;
    const local = normalizeSaveSnapshot(options.readLocal());
    if (reviewedLocal !== undefined && snapshotText(local) !== reviewedLocal) {
      conflict(latest, local, latest ? "diverged" : "cloud-missing");
      return;
    }
    if (reviewedLocal !== undefined && !options.canApply()) {
      notify("pending");
      return;
    }
    if (!sameRemote(latest, expected)) {
      conflict(latest, local, latest ? "diverged" : "cloud-missing");
      return;
    }
    if (latest && snapshotText(latest.payload) === snapshotText(local)) {
      accept(latest, local);
      return;
    }
    const revision = options.revision?.() ?? globalThis.crypto.randomUUID();
    const encoded = encodeCloudSave(local, revision);
    notify("saving", state.conflict);
    const request = sdk!.setCloudStorage({ [CLOUD_SAVE_KEY]: encoded });
    outstandingWrite = request;
    void request.then(
      () => {
        if (outstandingWrite === request) outstandingWrite = null;
      },
      () => {
        if (outstandingWrite === request) outstandingWrite = null;
      },
    );
    await bounded(request);
    if (!isCurrent(token)) return;
    metadata.baseline = { revision, payload: snapshotText(local) };
    dirty = snapshotText(options.readLocal()) !== metadata.baseline.payload;
    saveMetadata();
    notify(dirty ? "queued" : "synced");
    if (dirty) schedule();
  }
  async function reconcile(token: number) {
    const remote = await readCloud();
    if (!isCurrent(token)) return;
    const local = normalizeSaveSnapshot(options.readLocal());
    const localText = snapshotText(local);
    if (remote && snapshotText(remote.payload) === localText) {
      accept(remote, local);
      return;
    }
    const baseline = metadata.baseline;
    if (
      remote &&
      ((!baseline && !options.hasLocalData() && localText === initialLocalText) ||
        (baseline && localText === baseline.payload))
    ) {
      apply(remote, local);
      return;
    }
    if (matches(remote, baseline)) {
      if (localText === baseline!.payload) {
        accept(remote, local);
        return;
      }
      await write(remote, token);
      return;
    }
    if (!remote && !baseline && !options.hasLocalData()) {
      if (localText !== initialLocalText) {
        metadata.baseline = { revision: null, payload: initialLocalText };
        dirty = true;
        saveMetadata();
        await write(null, token);
      } else accept(null, local);
      return;
    }
    conflict(remote, local, baseline ? (remote ? "diverged" : "cloud-missing") : "migration");
  }
  function schedule() {
    if (
      disposed ||
      metadata.mode === "local" ||
      timer !== null ||
      !sdk ||
      !["synced", "queued", "saving"].includes(state.status)
    )
      return;
    timer = timers.set(() => {
      timer = null;
      void flush();
    }, options.debounceMs ?? 3000);
  }
  function markDirty() {
    if (disposed) return;
    if (!dirty) {
      dirty = true;
      saveMetadata();
    }
    if (state.status === "synced") notify("queued");
    schedule();
  }
  function refresh(): Promise<void> {
    if (disposed || metadata.mode === "local") return Promise.resolve();
    cancelTimer();
    return enqueue(async (token) => {
      notify("checking", state.conflict);
      if (await connect(token)) await reconcile(token);
    });
  }
  function flush(): Promise<void> {
    cancelTimer();
    if (
      disposed ||
      metadata.mode === "local" ||
      !sdk ||
      ["conflict", "error", "unsupported", "pending"].includes(state.status)
    )
      return Promise.resolve();
    if (queuedFlush) return queuedFlush;
    queuedFlush = enqueue(reconcile).finally(() => {
      queuedFlush = null;
    });
    return queuedFlush;
  }
  function resolve(choice: CloudSaveChoice): Promise<void> {
    if (choice === "local-only") {
      generation++;
      cancelTimer();
      metadata.mode = "local";
      saveMetadata();
      notify("local");
      return Promise.resolve();
    }
    if (!state.conflict || !options.canApply()) return Promise.resolve();
    const decision = state.conflict;
    const reviewed = reviewedCloud;
    const localText = snapshotText(state.conflict.local);
    return enqueue(async (token) => {
      notify("checking", decision);
      const current = await readCloud();
      if (!isCurrent(token)) return;
      const local = normalizeSaveSnapshot(options.readLocal());
      if (!sameRemote(current, reviewed) || snapshotText(local) !== localText) {
        conflict(current, local, current ? "diverged" : "cloud-missing");
        return;
      }
      if (!options.canApply()) {
        notify("pending");
        return;
      }
      if (choice === "use-cloud") {
        if (current) apply(current, local);
        else conflict(current, local, "cloud-missing");
      } else await write(current, token, localText);
    });
  }
  function retry(): Promise<void> {
    metadata.mode = "cloud";
    saveMetadata();
    sdk = null;
    return refresh();
  }
  return {
    start: refresh,
    refresh,
    retry,
    markDirty,
    flush,
    resolve,
    getState: () => state,
    dispose() {
      disposed = true;
      generation++;
      cancelTimer();
    },
  };
}

export type CloudSaveController = ReturnType<typeof createCloudSaveController>;
