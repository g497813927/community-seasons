import { loadToySdk, type ToySdk } from "./toy-sdk";
import { isRankedRunReceipt, type RankedRunReceipt } from "./ranked-run";

// A new board isolates this difficulty revision from any earlier/default board.
// Bump to an unused Toy board when scoring or difficulty changes incompatibly.
export const LEADERBOARD_BOARD = 2;
export const LEADERBOARD_LIMIT = 50;
export const MAX_RANKED_SCORE = 16_777_215;
export type LeaderboardPeriod = "day" | "week";
export interface LeaderboardEntry { rank: number; score: number; name: null; isSelf: boolean }
export interface LeaderboardResult { entries: LeaderboardEntry[]; self: LeaderboardEntry | null }
export type SubmissionStatus = "ready" | "pending" | "submitted" | "uncertain";

export class LeaderboardError extends Error {
  constructor(readonly code: "unsupported" | "unavailable" | "invalid-run" | "user-denied" | "uncertain" | "busy" | "preference-unavailable") {
    super(`Leaderboard: ${code}`);
    this.name = "LeaderboardError";
  }
}

function bounded<T>(action: () => Promise<T>, milliseconds = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new LeaderboardError("unavailable")), milliseconds);
    Promise.resolve().then(action).then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}

function validScore(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= MAX_RANKED_SCORE;
}

function entry(value: unknown, isSelf = false): LeaderboardEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!Number.isSafeInteger(row.rank) || (row.rank as number) < 1 || !validScore(row.score)) return null;
  // Deliberately discard all names, avatars and any unexpected profile fields
  // at the service boundary. They never enter React state, storage or logs.
  return { rank: row.rank as number, score: row.score, name: null, isSelf };
}

export function createLeaderboardClient(load: () => Promise<ToySdk | null> = loadToySdk) {
  const submissions = new WeakMap<RankedRunReceipt, SubmissionStatus>();
  let writing = false;
  async function supported(ability: "getRankList" | "getMyRank" | "submitScore") {
    const sdk = await bounded(load);
    if (!sdk || typeof sdk[ability] !== "function" || !(await bounded(() => sdk.isSupport(ability))))
      throw new LeaderboardError("unsupported");
    return sdk;
  }
  return {
    submissionStatus(receipt: RankedRunReceipt): SubmissionStatus {
      return submissions.get(receipt) ?? "ready";
    },
    async read(period: LeaderboardPeriod): Promise<LeaderboardResult> {
      // Runtime allowlist matters: Toy otherwise defaults to the all-time board.
      if (period !== "day" && period !== "week") throw new LeaderboardError("unsupported");
      const sdk = await supported("getRankList");
      const [rows, mine] = await Promise.all([
        bounded(() => sdk.getRankList!({ board: LEADERBOARD_BOARD, period, limit: LEADERBOARD_LIMIT })),
        // A guest can read the public list even when their own rank is unavailable.
        (async () => {
          try {
            if (!sdk.getMyRank || !(await bounded(() => sdk.isSupport("getMyRank")))) return null;
            return await bounded(() => sdk.getMyRank!({ board: LEADERBOARD_BOARD, period }));
          } catch { return null; }
        })(),
      ]);
      if (!Array.isArray(rows)) throw new LeaderboardError("unavailable");
      const seen = new Set<number>();
      const entries = rows.slice(0, LEADERBOARD_LIMIT).flatMap((row) => {
        const normalized = entry(row);
        if (!normalized || seen.has(normalized.rank)) return [];
        seen.add(normalized.rank);
        return [normalized];
      }).sort((a, b) => a.rank - b.rank);
      // Keep the platform's ranks when a malformed row is omitted.
      return { entries, self: mine?.ranked === true ? entry(mine, true) : null };
    },
    async submit(receipt: RankedRunReceipt): Promise<void> {
      if (!isRankedRunReceipt(receipt) || !validScore(receipt.score)) throw new LeaderboardError("invalid-run");
      const status = submissions.get(receipt);
      if (status === "submitted") return;
      if (status === "uncertain") throw new LeaderboardError("uncertain");
      if (writing || status === "pending") throw new LeaderboardError("busy");
      writing = true;
      submissions.set(receipt, "pending");
      let dispatched = false;
      try {
        const sdk = await supported("submitScore");
        // Only a sealed score from this page's completed run is sent. Never use
        // the best score, wallet, cloud save, UI text or a caller-supplied number.
        dispatched = true;
        await bounded(() => sdk.submitScore!({ board: LEADERBOARD_BOARD, score: receipt.score }), 60000);
        // The response is Toy's all-time best; intentionally ignore it.
        submissions.set(receipt, "submitted");
      } catch (error) {
        const failure = error && typeof error === "object" ? error as { type?: unknown; code?: unknown } : null;
        const denied = failure?.type === "user_denied";
        const rejected = denied || failure?.type === "not_logged_in" ||
          failure?.type === "invalid_param" || failure?.type === "unsupported" ||
          (failure?.type === "http_error" && failure.code === 307044);
        // A timed-out write may still complete. Never automatically replay it,
        // or allow the same run to be posted again in a later day/week.
        submissions.set(receipt, dispatched && !rejected ? "uncertain" : "ready");
        if (denied) throw new LeaderboardError("user-denied");
        if (dispatched && !rejected) throw new LeaderboardError("uncertain");
        throw error instanceof LeaderboardError ? error : new LeaderboardError("unavailable");
      } finally { writing = false; }
    },
  };
}

export type AutomaticSubmissionStatus = SubmissionStatus | "declined" | "failed";
export type LeaderboardPreferenceState = "checking" | "ask" | "enabled" | "disabled" | "unavailable";
export const LEADERBOARD_CONSENT_KEY = "community-seasons-leaderboard-consent-v1";
export interface LeaderboardParticipationOptions {
  loadSdk?: () => Promise<ToySdk | null>;
  onPreference?: (state: LeaderboardPreferenceState) => void;
  onStatus?: (receipt: RankedRunReceipt, status: AutomaticSubmissionStatus) => void;
}
export interface LeaderboardParticipation {
  refresh(): Promise<void>;
  observe(receipt: RankedRunReceipt): Promise<void>;
  join(receipt: RankedRunReceipt): Promise<void>;
  decline(): Promise<void>;
  hasConsent(): boolean;
  submissionStatus(receipt: RankedRunReceipt): AutomaticSubmissionStatus;
}

function submissionFailureStatus(error: unknown): AutomaticSubmissionStatus {
  return error instanceof LeaderboardError && error.code === "user-denied"
    ? "declined"
    : error instanceof LeaderboardError && error.code === "uncertain"
      ? "uncertain"
      : "failed";
}

function decodePreference(values: unknown): "ask" | "enabled" | "disabled" {
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw new LeaderboardError("preference-unavailable");
  if (!Object.prototype.hasOwnProperty.call(values, LEADERBOARD_CONSENT_KEY)) return "ask";
  const value = (values as Record<string, unknown>)[LEADERBOARD_CONSENT_KEY];
  if (typeof value !== "string") throw new LeaderboardError("preference-unavailable");
  const decoded: unknown = JSON.parse(value);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded))
    throw new LeaderboardError("preference-unavailable");
  const choice = decoded as Record<string, unknown>;
  if (Object.keys(choice).length !== 2 || choice.version !== 1 || typeof choice.enabled !== "boolean")
    throw new LeaderboardError("preference-unavailable");
  return choice.enabled ? "enabled" : "disabled";
}

/** Toy cloud is authoritative; cached state is only for presenting the current choice. */
export function createLeaderboardParticipation(
  client: Pick<ReturnType<typeof createLeaderboardClient>, "submit">,
  options: LeaderboardParticipationOptions = {},
): LeaderboardParticipation {
  const load = options.loadSdk ?? loadToySdk;
  let preference: LeaderboardPreferenceState = "checking";
  let queue: Promise<void> = Promise.resolve();
  let choiceRevision = 0;
  let desiredChoice: boolean | null = null;
  let outstandingWrite: Promise<void> | null = null;
  // A failed opt-out write must not let an older enabled cloud value post again.
  // This is a pending cloud change, never a device preference or stored score.
  let pendingDisabled = false;
  const observed = new WeakMap<RankedRunReceipt, Promise<void>>();
  const joining = new WeakMap<RankedRunReceipt, Promise<void>>();
  const explicitReceipts = new WeakSet<RankedRunReceipt>();
  const statuses = new WeakMap<RankedRunReceipt, AutomaticSubmissionStatus>();

  function notify(action: () => void) {
    void Promise.resolve().then(action).catch(() => {
      // UI failures cannot repeat a score, consent prompt, or preference write.
    });
  }
  function setPreference(next: LeaderboardPreferenceState) {
    if (preference === next) return;
    preference = next;
    notify(() => options.onPreference?.(next));
  }
  function publish(receipt: RankedRunReceipt, status: AutomaticSubmissionStatus) {
    statuses.set(receipt, status);
    notify(() => options.onStatus?.(receipt, status));
  }
  function enqueue(action: () => Promise<void>): Promise<void> {
    const operation = queue.then(action);
    queue = operation.catch(() => {});
    return operation;
  }
  async function cloudSdk(ability: "getCloudStorage" | "setCloudStorage") {
    const sdk = await bounded(load);
    if (!sdk || typeof sdk[ability] !== "function" || !(await bounded(() => sdk.isSupport(ability))))
      throw new LeaderboardError("preference-unavailable");
    return sdk;
  }
  async function awaitOutstandingWrite() {
    // Timing out the caller does not cancel Toy's request. Keep later cloud
    // operations behind its actual settlement, with a bounded wait for the UI.
    if (outstandingWrite) await bounded(() => outstandingWrite!);
  }
  async function readPreference(): Promise<LeaderboardPreferenceState> {
    const revision = choiceRevision;
    if (!pendingDisabled) setPreference("checking");
    try {
      await awaitOutstandingWrite();
      const sdk = await cloudSdk("getCloudStorage");
      const value = decodePreference(await bounded(() => sdk.getCloudStorage!([LEADERBOARD_CONSENT_KEY])));
      if (revision !== choiceRevision) return preference;
      if (pendingDisabled && value !== "disabled") {
        setPreference("unavailable");
        return "unavailable";
      }
      if (value === "disabled") pendingDisabled = false;
      setPreference(value);
      return value;
    } catch {
      if (revision === choiceRevision) setPreference("unavailable");
      throw new LeaderboardError("preference-unavailable");
    }
  }
  async function writePreference(enabled: boolean, revision: number) {
    try {
      await awaitOutstandingWrite();
      const sdk = await cloudSdk("setCloudStorage");
      const request = Promise.resolve().then(() => {
        if (revision !== choiceRevision) return;
        return sdk.setCloudStorage!({
          [LEADERBOARD_CONSENT_KEY]: JSON.stringify({ version: 1, enabled }),
        });
      });
      // The settlement barrier absorbs rejection, while the caller still sees
      // the actual outcome through request. Never release it on a timeout.
      const settled = request.then(() => {}, () => {});
      outstandingWrite = settled;
      void settled.then(() => {
        if (outstandingWrite === settled) outstandingWrite = null;
        if (enabled && desiredChoice === false && pendingDisabled && revision !== choiceRevision) {
          // A late accepted opt-in must not overwrite a newer opt-out. If the
          // queued decline already saved false this guarded recovery is a no-op.
          void enqueue(async () => {
            if (desiredChoice !== false || !pendingDisabled) return;
            try { await writePreference(false, choiceRevision); } catch {
              // Keep unavailable/pending opt-out if reconciliation also fails.
            }
          });
        }
      });
      await bounded(() => request);
      if (revision === choiceRevision) {
        pendingDisabled = false;
        setPreference(enabled ? "enabled" : "disabled");
      }
    } catch {
      if (revision === choiceRevision) setPreference("unavailable");
      throw new LeaderboardError("preference-unavailable");
    }
  }
  async function rejectParticipation() {
    const revision = ++choiceRevision;
    desiredChoice = false;
    pendingDisabled = true;
    setPreference("disabled");
    try { await writePreference(false, revision); } catch {
      // Score rejection remains the visible result. The failed preference write
      // stays unavailable and blocks queued attempts against stale cloud consent.
    }
  }

  return {
    hasConsent: () => preference === "enabled",
    submissionStatus(receipt) {
      if (!isRankedRunReceipt(receipt)) return "failed";
      return statuses.get(receipt) ?? "ready";
    },
    refresh() {
      return enqueue(async () => {
        try { await readPreference(); } catch { /* The preference reports unavailable. */ }
      });
    },
    observe(receipt): Promise<void> {
      // Guard before queuing, loading Toy, or reading any cloud data.
      if (!isRankedRunReceipt(receipt) || explicitReceipts.has(receipt)) return Promise.resolve();
      const existing = observed.get(receipt);
      if (existing) return existing;
      const attempt = enqueue(async () => {
        try {
          const revision = choiceRevision;
          const current = await readPreference();
          if (current !== "enabled" || pendingDisabled || revision !== choiceRevision) return;
          publish(receipt, "pending");
          try {
            await client.submit(receipt);
            publish(receipt, "submitted");
          } catch (error) {
            publish(receipt, submissionFailureStatus(error));
            if (error instanceof LeaderboardError && error.code === "user-denied")
              await rejectParticipation();
          }
        } catch {
          // Observation is fire-and-forget. Unreadable consent never posts.
        }
      });
      observed.set(receipt, attempt);
      return attempt;
    },
    join(receipt): Promise<void> {
      if (!isRankedRunReceipt(receipt)) return Promise.reject(new LeaderboardError("invalid-run"));
      const existing = joining.get(receipt);
      if (existing) return existing;
      explicitReceipts.add(receipt);
      const revision = ++choiceRevision;
      desiredChoice = true;
      const attempt = enqueue(async () => {
        try {
          if (statuses.get(receipt) !== "submitted") publish(receipt, "pending");
          try {
            // Explicit Join alone may invoke Toy's consent/login prompt. Only
            // the sealed run is posted; preference persistence follows acceptance.
            await client.submit(receipt);
            publish(receipt, "submitted");
          } catch (error) {
            const failure = error instanceof LeaderboardError ? error : new LeaderboardError("unavailable");
            publish(receipt, submissionFailureStatus(failure));
            if (failure.code === "user-denied") await rejectParticipation();
            throw failure;
          }
          // A later explicit opt-out supersedes this in-flight Join.
          if (revision !== choiceRevision) return;
          // If this fails, the run stays submitted. Retrying Join asks the client
          // for the same receipt (already deduplicated), then only saves consent.
          await writePreference(true, revision);
        } finally {
          joining.delete(receipt);
        }
      });
      joining.set(receipt, attempt);
      return attempt;
    },
    decline(): Promise<void> {
      const revision = ++choiceRevision;
      desiredChoice = false;
      pendingDisabled = true;
      setPreference("disabled");
      return enqueue(() => writePreference(false, revision));
    },
  };
}
