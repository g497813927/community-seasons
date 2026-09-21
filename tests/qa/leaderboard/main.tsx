import { createRoot } from "react-dom/client";
import { LeaderboardDialog, type LeaderboardEligibility, type LeaderboardPeriod, type LeaderboardPreference, type LeaderboardResult } from "@/components/leaderboard-dialog";
import type { Locale } from "@/lib/game/i18n";
import "@/app/globals.css";

// Only this fixture owns fake requests. No SDK or production page is loaded.
const root = createRoot(document.getElementById("root")!);
const options = {
  locale: (navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en") as Locale,
  open: false, available: true, score: 12345 as number | null,
  eligibility: "ready" as LeaderboardEligibility,
  consented: false,
  preference: "ask" as LeaderboardPreference,
};
let run = 1;
let requestID = 0;
let holdLoads = false;
let submissionCount = 0;
let choiceWrites = 0;
let failChoice = false;
const loadRequests: { id: number; period: LeaderboardPeriod; settled: boolean; resolve: (value: LeaderboardResult) => void; reject: (reason: Error) => void }[] = [];
const submissions: { run: number; explicit: boolean; resolve?: () => void; reject?: (error: Error) => void }[] = [];
const result = (score: number): LeaderboardResult => ({
  entries: [{ rank: 1, score, name: "PRIVATE-FIXTURE-NAME-DO-NOT-DISPLAY", isSelf: false }],
  self: { rank: 7, score: 12345, name: "PRIVATE-SELF-NAME", isSelf: true },
});
function load(period: LeaderboardPeriod): Promise<LeaderboardResult> {
  return new Promise((resolve, reject) => {
    const request = { id: ++requestID, period, settled: !holdLoads, resolve, reject };
    loadRequests.push(request);
    if (!holdLoads) resolve(result(period === "week" ? 76543 : 23456));
  });
}
function settleSubmission(value: "success" | "decline" | "uncertain" | "error") {
  const pending = submissions.shift();
  if (!pending) throw Error("No pending submission");
  if (pending.run === run) {
    options.eligibility = value === "success" ? "submitted" : value === "decline" ? "declined" : value === "error" ? "failed" : "uncertain";
    if (value === "success" && pending.explicit) {
      choiceWrites++;
      if (failChoice) {
        options.preference = "unavailable";
        options.consented = false;
        render();
        pending.reject?.(Object.assign(Error("Fixture preference unavailable"), { code: "preference-unavailable" }));
        return;
      }
      options.consented = true;
      options.preference = "enabled";
    }
  }
  render();
  if (value === "success") pending.resolve?.();
  else pending.reject?.(Error("Fixture submission outcome"));
}
function finishRun() {
  // Simulates the parent receiving a completed run, independently of the dialog.
  if (!options.consented || options.preference !== "enabled") { options.eligibility = "ready"; render(); return; }
  submissionCount++;
  options.eligibility = "pending";
  submissions.push({ run, explicit: false });
  render();
}
function join(): Promise<void> {
  if (options.eligibility === "submitted") return saveChoice(true);
  submissionCount++;
  options.eligibility = "pending";
  return new Promise((resolve, reject) => {
    submissions.push({ run, explicit: true, resolve, reject });
    render();
  });
}
async function saveChoice(enabled: boolean): Promise<void> {
  choiceWrites++;
  if (failChoice) {
    options.preference = "unavailable";
    options.consented = false;
    render();
    throw Object.assign(Error("Fixture preference unavailable"), { code: "preference-unavailable" });
  }
  options.consented = enabled;
  options.preference = enabled ? "enabled" : "disabled";
  render();
}
function render() {
  document.documentElement.lang = options.locale;
  root.render(<main style={{ padding: 24 }}>
    <h1>{options.locale === "en" ? "Isolated leaderboard QA" : "排行榜隔离测试"}</h1>
    <button id="leaderboard-launcher" type="button" onClick={() => { options.open = true; render(); }}
      style={{ padding: 14, border: "1px solid #8db59870", borderRadius: 8 }}>
      {options.locale === "en" ? "Open leaderboard" : "打开排行榜"}
    </button>
    <LeaderboardDialog {...options} load={load} join={join} decline={() => saveChoice(false)}
      onOpenChange={(open) => { options.open = open; render(); }}
      returnFocus={() => document.getElementById("leaderboard-launcher") || false} />
  </main>);
}

Object.assign(window, { __leaderboardQA: Object.freeze({
  id: "leaderboard-v1", storagePrefix: "qa-community-seasons-leaderboard-v1:", cloud: "disabled",
  configure(values: Partial<typeof options>) {
    Object.assign(options, values);
    if ("consented" in values && !("preference" in values)) options.preference = options.consented ? "enabled" : "ask";
    render();
  },
  failChoice(value: boolean) { failChoice = value; },
  newRun(score = 12345) { run++; options.score = score; options.eligibility = "ready"; render(); },
  finishRun,
  holdLoads(value: boolean) { holdLoads = value; },
  settleSubmission,
  settleLoad(id: number, score: number | null) {
    const request = loadRequests.find((entry) => entry.id === id && !entry.settled);
    if (!request) throw Error("No matching pending request");
    request.settled = true;
    if (score === null) request.reject(Error("Fixture load failure"));
    else request.resolve(result(score));
  },
  emptyLoad(id: number) {
    const request = loadRequests.find((entry) => entry.id === id && !entry.settled);
    if (!request) throw Error("No matching pending request");
    request.settled = true;
    request.resolve({ entries: [], self: null });
  },
  snapshot() { return { ...options, run, submissionCount, choiceWrites, requests: loadRequests.map(({ id, period, settled }) => ({ id, period, settled })) }; },
}) });
render();
