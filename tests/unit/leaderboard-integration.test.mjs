import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { compileGameModules } from "../helpers/compile-game-modules.mjs";

compileGameModules(new URL("../helpers/compiled/", import.meta.url), { entries: ["leaderboard", "engine"] });
const { createRun, update, finishReview } = await import("../helpers/compiled/engine.mjs");
const { beginRankedRun, getRankedRunReceipt } = await import("../helpers/compiled/ranked-run.mjs");
const { createLeaderboardClient, createLeaderboardParticipation, LEADERBOARD_CONSENT_KEY } = await import("../helpers/compiled/leaderboard.mjs");
const source = fs.readFileSync(new URL("../../src/app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let observe;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "observeCompletedRun") observe = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(observe);
const compiled = ts.transpileModule(observe, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

function completedRun(t) {
  let clock = 1000;
  t.mock.method(performance, "now", () => clock);
  const run = createRun(4182);
  run.mode = "running";
  beginRankedRun(run);
  for (let i = 0; i < 1500 && run.mode !== "over"; i++) {
    if (run.review) finishReview(run);
    clock += 100;
    update(run, 0.1);
  }
  finishReview(run);
  assert.ok(getRankedRunReceipt(run));
  return run;
}
function harness(run, consented) {
  const writes = [];
  let storedReads = 0, selectedReceipt, status;
  let enabled = consented;
  const sdk = {
    async isSupport() { return true; },
    async submitScore(request) { writes.push(request); return { score: request.score }; },
    async getCloudStorage(keys) {
      assert.deepEqual(keys, [LEADERBOARD_CONSENT_KEY]);
      return { [LEADERBOARD_CONSENT_KEY]: JSON.stringify({ version: 1, enabled }) };
    },
    async setCloudStorage(items) {
      assert.deepEqual(Object.keys(items), [LEADERBOARD_CONSENT_KEY]);
      enabled = JSON.parse(items[LEADERBOARD_CONSENT_KEY]).enabled;
    },
  };
  const client = createLeaderboardClient(async () => sdk);
  const participation = createLeaderboardParticipation(client, {
    loadSdk: async () => sdk,
    onStatus(receipt, next) { if (receipt === selectedReceipt) status = next; },
  });
  const c = {
    onToy: true, game: { current: run },
    // These poisoned saved/display values must never become submission input.
    localStorage: { getItem() { storedReads++; return "999999999999999"; } },
    bestRef: { current: 999_999_999_999_999 },
    observedCompletions: { current: new WeakSet() },
    rankedReceiptRef: { current: null },
    setRankedReceipt(value) { selectedReceipt = value; },
    setRankEligibility(value) { status = value; },
    getRankedRunReceipt, leaderboardParticipation: { current: participation },
  };
  vm.createContext(c);
  vm.runInContext(compiled, c);
  return { c, writes, participation, observe: () => c.observeCompletedRun(),
    get receipt() { return selectedReceipt; }, get status() { return status; },
    get storedReads() { return storedReads; },
    setCloudChoice(value) { enabled = value; } };
}

test("actual page completion observer rejects a forged stored last run of 999,999,999,999,999", async () => {
  const fake = Object.assign(createRun(), { mode: "over", score: 999_999_999_999_999 });
  const h = harness(fake, true);
  h.observe();
  await Promise.resolve();
  assert.equal(h.status, "invalid");
  assert.equal(h.receipt, null);
  assert.deepEqual(h.writes, []);
  assert.equal(h.storedReads, 0);
});

test("the actual page observes a fresh result without posting until one-time consent", async (t) => {
  const run = completedRun(t);
  const h = harness(run, false);
  for (let i = 0; i < 20; i++) h.observe();
  await Promise.resolve();
  assert.equal(h.status, "ready");
  assert.deepEqual(h.writes, []);
  assert.equal(h.receipt.score, run.score);
  await h.participation.join(h.receipt);
  assert.deepEqual(h.writes, [{ board: 2, score: run.score }]);
  assert.equal(h.storedReads, 0);
});

test("automatic posting waits for the fatal lesson and submits only the sealed live score", async (t) => {
  const run = completedRun(t);
  run.review = { id: 1, kind: "pillar", shielded: false };
  const h = harness(run, true);
  h.observe();
  assert.deepEqual(h.writes, []);
  finishReview(run);
  for (let i = 0; i < 20; i++) h.observe();
  await h.participation.observe(h.receipt);
  assert.deepEqual(h.writes, [{ board: 2, score: run.score }]);
  assert.equal(h.storedReads, 0);
  h.c.game.current = createRun();
  h.observe();
  assert.equal(h.writes.length, 1, "home or a restored save cannot replay a completion");
});

test("a choice changed on another device does not leave the page claiming a post is pending", async (t) => {
  const run = completedRun(t);
  const h = harness(run, true);
  await h.participation.refresh();
  assert.equal(h.participation.hasConsent(), true);
  h.setCloudChoice(false);
  h.observe();
  await h.participation.observe(h.receipt);
  assert.equal(h.participation.hasConsent(), false);
  assert.equal(h.status, "ready");
  assert.deepEqual(h.writes, []);
});
