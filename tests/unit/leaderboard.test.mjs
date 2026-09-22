import test from "node:test";
import assert from "node:assert/strict";
import { compileGameModules } from "../helpers/compile-game-modules.mjs";

compileGameModules(new URL("../helpers/compiled/", import.meta.url), { entries: ["leaderboard", "engine"] });
const { createLeaderboardClient, createLeaderboardParticipation, normalizeLeaderboardAvatar, LEADERBOARD_CONSENT_KEY, LEADERBOARD_BOARD, LEADERBOARD_LIMIT, MAX_RANKED_SCORE } =
  await import("../helpers/compiled/leaderboard.mjs");
const { createRun, update, finishReview } = await import("../helpers/compiled/engine.mjs");
const { beginRankedRun, getRankedRunReceipt } = await import("../helpers/compiled/ranked-run.mjs");

function sealedReceipt(t, seed = 4182) {
  let now = 1000;
  t.mock.method(performance, "now", () => now);
  const run = createRun(seed);
  run.mode = "running";
  assert.equal(beginRankedRun(run), true);
  for (let frame = 0; frame < 1500 && run.mode !== "over"; frame++) {
    if (run.review) finishReview(run);
    now += 100;
    update(run, 0.1);
  }
  const receipt = getRankedRunReceipt(run);
  assert.ok(receipt, "the test result must be sealed by actual engine completion");
  return receipt;
}

function fakeSdk(overrides = {}) {
  const calls = { support: [], reads: [], mine: [], writes: [], loads: 0 };
  const sdk = {
    async isSupport(ability) { calls.support.push(ability); return true; },
    async getRankList(request) { calls.reads.push(request); return []; },
    async getMyRank(request) { calls.mine.push(request); return { ranked: false, rank: 0, score: 0 }; },
    async submitScore(request) { calls.writes.push(request); return { score: MAX_RANKED_SCORE }; },
    ...overrides,
  };
  return { calls, sdk, client: createLeaderboardClient(async () => { calls.loads++; return sdk; }) };
}

function code(expected) {
  return (error) => error?.name === "LeaderboardError" && error.code === expected;
}

test("public and personal reads always select the new board and an explicit day/week", async () => {
  const { calls, client } = fakeSdk();
  assert.equal(LEADERBOARD_BOARD, 3);
  for (const period of ["day", "week"]) assert.deepEqual(await client.read(period), { entries: [], self: null });
  assert.deepEqual(calls.reads, [
    { board: 3, period: "day", limit: LEADERBOARD_LIMIT },
    { board: 3, period: "week", limit: LEADERBOARD_LIMIT },
  ]);
  assert.deepEqual(calls.mine, [{ board: 3, period: "day" }, { board: 3, period: "week" }]);
  assert.deepEqual(calls.support, ["getRankList", "getMyRank", "getRankList", "getMyRank"]);
  const previousLoads = calls.loads;
  for (const invalid of [undefined, null, "all", "month", "", 0]) {
    await assert.rejects(client.read(invalid), code("unsupported"));
  }
  assert.equal(calls.loads, previousLoads, "invalid periods are rejected before SDK access");
});

test("read preserves bounded Toy public profiles and filters invalid scores without renumbering ranks", async () => {
  const { client } = fakeSdk({
    async getRankList() {
      return [
        { rank: 4, score: 150, nickname: "  River TV  ", avatar: "https://i0.hdslb.com/bfs/face/river.jpg", extra: "private field" },
        { rank: 1, score: MAX_RANKED_SCORE, nickname: "春日同学", avatar: "//i1.hdslb.com/bfs/face/spring.jpg" },
        { rank: 4, score: 200, nickname: "duplicate" },
        { rank: 2, score: MAX_RANKED_SCORE + 1 },
        { rank: 3, score: 0 },
        { rank: 5, score: -10 },
        { rank: 6, score: 1.5 },
        { rank: 7, score: "900" },
        { rank: 8, score: NaN },
        { rank: 9, score: Infinity },
        { rank: 0, score: 100 },
        { rank: -1, score: 100 },
        { rank: 1.5, score: 100 },
        { rank: "10", score: 100 },
        { rank: Number.MAX_SAFE_INTEGER + 1, score: 100 },
        {}, null, "profile",
      ];
    },
    async getMyRank() {
      return { ranked: true, rank: 12, score: 90, nickname: "my private name", avatar: "my photo", account: 123 };
    },
  });
  const result = await client.read("day");
  assert.deepEqual(result, {
    entries: [
      { rank: 1, score: MAX_RANKED_SCORE, name: "春日同学", avatar: "https://i1.hdslb.com/bfs/face/spring.jpg", isSelf: false },
      { rank: 4, score: 150, name: "River TV", avatar: "https://i0.hdslb.com/bfs/face/river.jpg", isSelf: false },
    ],
    self: { rank: 12, score: 90, name: null, avatar: null, isSelf: true },
  });
  assert.doesNotMatch(JSON.stringify(result), /private|nickname|account|my photo|extra/);
});

test("public names remain bounded Unicode text and cannot add profile metadata or infer self identity", async () => {
  const nicknames = [
    "<img src=x onerror=alert(1)>", "  春日📺  ", "📺".repeat(80),
    "\u202eA\u0000da\u2069", "\u0000\n\u202e", "", null, 123, "x".repeat(1025),
  ];
  const { client } = fakeSdk({
    async getRankList() {
      return nicknames.map((nickname, i) => ({
        rank: i + 1, score: 100, nickname, avatar: "https://attacker.invalid/profile.png", account: "private id",
      }));
    },
    async getMyRank() {
      return { ranked: true, rank: 1, score: 100, nickname: "not in this endpoint", avatar: "https://i0.hdslb.com/face.png" };
    },
  });
  const result = await client.read("week");
  assert.deepEqual(result.entries.map(({ name }) => name), [
    "<img src=x onerror=alert(1)>", "春日📺", "📺".repeat(64), "Ada", null, null, null, null, null,
  ]);
  assert.ok(result.entries.every(({ avatar, isSelf }) => avatar === null && isSelf === false));
  assert.deepEqual(result.self, { rank: 1, score: 100, name: null, avatar: null, isSelf: true });
  assert.doesNotMatch(JSON.stringify(result), /private id|account|not in this endpoint/);
});

test("avatars only use normalized HTTPS Bilibili CDN URLs", () => {
  for (const [source, expected] of [
    ["https://p0.hdslb.com/bfs/face/toy-normalized.jpg", "https://p0.hdslb.com/bfs/face/toy-normalized.jpg"],
    ["https://i0.hdslb.com/bfs/face/a.jpg", "https://i0.hdslb.com/bfs/face/a.jpg"],
    ["//i1.hdslb.com/bfs/face/a.jpg", "https://i1.hdslb.com/bfs/face/a.jpg"],
    ["http://i2.hdslb.com/bfs/face/a.jpg", "https://i2.hdslb.com/bfs/face/a.jpg"],
    ["http://hdslb.com:80/a.png", "https://hdslb.com/a.png"],
    ["https://I0.HDSLB.COM:443/a.png?size=96#ignored", "https://i0.hdslb.com/a.png?size=96"],
    [" https://hdslb.com/a.png ", "https://hdslb.com/a.png"],
  ]) assert.equal(normalizeLeaderboardAvatar(source), expected, source);
  for (const source of [
    null, undefined, 12, {}, "", " ", "x".repeat(2049),
    "javascript:alert(1)", "data:image/svg+xml,<svg/>", "blob:https://hdslb.com/id", "file:///avatar.png",
    "https://evil.invalid/a.png", "https://hdslb.com.evil.invalid/a.png", "https://evilhdslb.com/a.png",
    "//evil.invalid/a.png", "https://user:password@i0.hdslb.com/a.png", "https://@i0.hdslb.com/a.png",
    "https://i0.hdslb.com:8443/a.png", "https://i0.hdslb.com:80/a.png", "http://i0.hdslb.com:443/a.png",
    "https://i0.hdslb.com\\evil/a.png", "https://i0.hdslb.com/white space.png", "https://i0.hdslb.com/\na.png",
    "/bfs/face/a.jpg", "https:hdslb.com/a.png", "https:/hdslb.com/a.png", "https:///hdslb.com/a.png",
    "///hdslb.com/a.png", "https://hdslb.com./a.png", "ftp://i0.hdslb.com/a.png",
    "https://i0.hdslb.com/" + "春".repeat(700),
  ]) assert.equal(normalizeLeaderboardAvatar(source), null, String(source));
});

test("read limits displayed entries and rejects a non-list SDK response", async () => {
  const { client } = fakeSdk({
    async getRankList() {
      return Array.from({ length: LEADERBOARD_LIMIT + 10 }, (_, index) => ({ rank: index + 1, score: 500 }));
    },
  });
  assert.equal((await client.read("week")).entries.length, LEADERBOARD_LIMIT);
  for (const rows of [null, {}, "unavailable"]) {
    const { client: malformed } = fakeSdk({ async getRankList() { return rows; } });
    await assert.rejects(malformed.read("day"), code("unavailable"));
  }
});

test("personal rank requires ranked=true and valid numeric fields", async () => {
  for (const mine of [
    { ranked: false, rank: 1, score: 100 },
    { ranked: "true", rank: 1, score: 100 },
    { rank: 1, score: 100 },
    { ranked: true, rank: 0, score: 100 },
    { ranked: true, rank: 1, score: MAX_RANKED_SCORE + 1 },
    { ranked: true, rank: 1, score: "100" },
    null,
  ]) {
    const { client } = fakeSdk({ async getMyRank() { return mine; } });
    assert.equal((await client.read("day")).self, null);
  }
});

test("guest denial or unsupported personal rank still permits reading the public list", async () => {
  for (const overrides of [
    { async getMyRank() { throw { type: "user_denied", privateData: "must not leak" }; } },
    { async isSupport(ability) { return ability !== "getMyRank"; } },
    { getMyRank: undefined },
  ]) {
    const { client } = fakeSdk({
      async getRankList() { return [{ rank: 1, score: 100 }]; },
      ...overrides,
    });
    assert.deepEqual(await client.read("week"), {
      entries: [{ rank: 1, score: 100, name: null, avatar: null, isSelf: false }], self: null,
    });
  }
});

test("forged or copied receipts are rejected before the SDK is loaded", async (t) => {
  const receipt = sealedReceipt(t);
  const { calls, client } = fakeSdk();
  for (const invalid of [null, {}, { score: 999999 }, { ...receipt }, structuredClone(receipt)]) {
    await assert.rejects(client.submit(invalid), code("invalid-run"));
  }
  assert.equal(calls.loads, 0);
  assert.deepEqual(calls.writes, []);
});

test("submission sends exactly the sealed score to board 3, ignores all-time response, and deduplicates success", async (t) => {
  const receipt = sealedReceipt(t);
  const { calls, client } = fakeSdk();
  assert.equal(client.submissionStatus(receipt), "ready");
  assert.equal(await client.submit(receipt), undefined);
  assert.deepEqual(calls.writes, [{ board: 3, score: receipt.score }]);
  assert.equal(client.submissionStatus(receipt), "submitted");
  assert.equal(await client.submit(receipt), undefined);
  assert.equal(calls.loads, 1);
  assert.equal(calls.writes.length, 1);
});

test("concurrent requests cannot open multiple write prompts or post the same result twice", async (t) => {
  const receipt = sealedReceipt(t);
  const otherReceipt = sealedReceipt(t, 513);
  let resolveWrite;
  let started;
  const writeStarted = new Promise((resolve) => { started = resolve; });
  let writeCount = 0;
  const { client } = fakeSdk({
    submitScore() {
      writeCount++;
      started();
      return new Promise((resolve) => { resolveWrite = resolve; });
    },
  });
  const first = client.submit(receipt);
  await writeStarted;
  assert.equal(client.submissionStatus(receipt), "pending");
  await assert.rejects(client.submit(receipt), code("busy"));
  await assert.rejects(client.submit(otherReceipt), code("busy"));
  assert.equal(client.submissionStatus(otherReceipt), "ready");
  resolveWrite({ score: MAX_RANKED_SCORE });
  await first;
  await client.submit(receipt);
  assert.equal(writeCount, 1);
});

test("an explicit user denial preserves ready status and allows a later deliberate retry", async (t) => {
  const receipt = sealedReceipt(t);
  let attempts = 0;
  const { client } = fakeSdk({
    async submitScore() {
      if (++attempts === 1) throw { type: "user_denied", message: "private SDK details" };
      return { score: receipt.score };
    },
  });
  await assert.rejects(client.submit(receipt), code("user-denied"));
  assert.equal(client.submissionStatus(receipt), "ready");
  await client.submit(receipt);
  assert.equal(client.submissionStatus(receipt), "submitted");
  assert.equal(attempts, 2);
});

test("an ambiguous dispatched failure locks that run against accidental replay", async (t) => {
  const receipt = sealedReceipt(t);
  let attempts = 0;
  const { calls, client } = fakeSdk({
    async submitScore() { attempts++; throw new Error("Response lost after server accepted write"); },
  });
  await assert.rejects(client.submit(receipt), code("uncertain"));
  assert.equal(client.submissionStatus(receipt), "uncertain");
  await assert.rejects(client.submit(receipt), code("uncertain"));
  assert.equal(calls.loads, 1);
  assert.equal(attempts, 1);
});

test("definitive Toy login, parameter, capability and rate-limit rejections allow an explicit retry", async (t) => {
  const receipt = sealedReceipt(t);
  for (const failure of [
    { type: "not_logged_in" }, { type: "invalid_param" }, { type: "unsupported" },
    { type: "http_error", code: 307044 },
  ]) {
    let attempts = 0;
    const { client } = fakeSdk({
      async submitScore() {
        if (++attempts === 1) throw failure;
        return { score: receipt.score };
      },
    });
    await assert.rejects(client.submit(receipt), code("unavailable"));
    assert.equal(client.submissionStatus(receipt), "ready");
    await client.submit(receipt);
    assert.equal(attempts, 2);
    assert.equal(client.submissionStatus(receipt), "submitted");
  }
});

test("a timed-out write cannot be replayed even if Toy later resolves it", async (t) => {
  const receipt = sealedReceipt(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let complete, began;
  const started = new Promise((resolve) => { began = resolve; });
  let attempts = 0;
  const { client } = fakeSdk({
    submitScore() {
      attempts++;
      began();
      return new Promise((resolve) => { complete = resolve; });
    },
  });
  const pending = client.submit(receipt);
  await started;
  const rejection = assert.rejects(pending, code("uncertain"));
  t.mock.timers.tick(60000);
  await rejection;
  complete({ score: receipt.score });
  await Promise.resolve();
  assert.equal(client.submissionStatus(receipt), "uncertain");
  await assert.rejects(client.submit(receipt), code("uncertain"));
  assert.equal(attempts, 1);
});

test("unavailable SDK or unsupported submit never dispatches and leaves the result ready", async (t) => {
  const receipt = sealedReceipt(t);
  for (const overrides of [
    { async isSupport() { return false; } },
    { submitScore: undefined },
  ]) {
    const { calls, client } = fakeSdk(overrides);
    await assert.rejects(client.submit(receipt), code("unsupported"));
    assert.equal(client.submissionStatus(receipt), "ready");
    assert.deepEqual(calls.writes, []);
  }
  for (const [load, expected] of [
    [async () => null, "unsupported"],
    [async () => { throw new Error("SDK unavailable"); }, "unavailable"],
  ]) {
    const client = createLeaderboardClient(load);
    await assert.rejects(client.submit(receipt), code(expected));
    assert.equal(client.submissionStatus(receipt), "ready");
  }
});

function cloudHarness(initial = undefined) {
  const values = { "community-seasons-save-v1": "untouched player save" };
  if (initial !== undefined) values[LEADERBOARD_CONSENT_KEY] = initial;
  function device(overrides = {}) {
    const calls = { loads: 0, support: [], reads: [], writes: [], scores: [], order: [] };
    const preferences = [];
    const statuses = [];
    const sdk = {
      async isSupport(ability) {
        calls.support.push(ability);
        return overrides.support ? overrides.support(ability) : true;
      },
      async getCloudStorage(keys) {
        calls.reads.push(keys);
        calls.order.push("read");
        if (overrides.read) return overrides.read(keys, values);
        return Object.fromEntries(keys.filter((key) => Object.hasOwn(values, key)).map((key) => [key, values[key]]));
      },
      async setCloudStorage(items) {
        calls.writes.push(items);
        calls.order.push("preference");
        if (overrides.write) await overrides.write(items, values);
        else Object.assign(values, items);
      },
      async submitScore(request) {
        calls.scores.push(request);
        calls.order.push("score");
        return overrides.submit ? overrides.submit(request) : { score: MAX_RANKED_SCORE };
      },
    };
    const load = async () => { calls.loads++; return sdk; };
    const client = createLeaderboardClient(load);
    const participation = createLeaderboardParticipation(client, {
      loadSdk: load,
      onPreference(state) { preferences.push(state); },
      onStatus(run, status) { statuses.push({ run, status }); },
    });
    return { calls, preferences, statuses, participation, sdk };
  }
  return { values, device };
}
const cloudChoice = (enabled) => JSON.stringify({ version: 2, enabled });

test("missing account choice asks once without posting; observation never opens score consent by itself", async (t) => {
  const receipt = sealedReceipt(t);
  const { values, device } = cloudHarness();
  const { calls, preferences, statuses, participation } = device();
  assert.equal(LEADERBOARD_CONSENT_KEY, "community-seasons-leaderboard-consent-v2");
  for (let render = 0; render < 20; render++) await participation.observe(receipt);
  assert.equal(participation.hasConsent(), false);
  assert.equal(participation.submissionStatus(receipt), "ready");
  assert.equal(preferences.at(-1), "ask");
  assert.deepEqual(statuses, []);
  assert.deepEqual(calls.scores, []);
  assert.deepEqual(calls.reads, [[LEADERBOARD_CONSENT_KEY]]);
  assert.deepEqual(calls.writes, []);
  assert.equal(values["community-seasons-save-v1"], "untouched player save");
  await participation.refresh();
  assert.equal(calls.reads.length, 2);
});

test("explicit join posts its authentic score before persisting enabled account participation", async (t) => {
  const receipt = sealedReceipt(t);
  const { values, device } = cloudHarness();
  let release, started;
  const firstStarted = new Promise((resolve) => { started = resolve; });
  const { calls, statuses, participation } = device({
    submit() { started(); return new Promise((resolve) => { release = resolve; }); },
  });
  const joined = participation.join(receipt);
  assert.equal(participation.join(receipt), joined, "double-clicking Join cannot duplicate a consent prompt");
  await firstStarted;
  assert.equal(participation.hasConsent(), false);
  assert.equal(participation.submissionStatus(receipt), "pending");
  assert.deepEqual(calls.writes, [], "no opt-in may be saved before Toy accepts the score");
  release({ score: MAX_RANKED_SCORE });
  await joined;
  assert.equal(participation.hasConsent(), true);
  assert.equal(participation.submissionStatus(receipt), "submitted");
  assert.deepEqual(calls.order, ["score", "preference"]);
  assert.deepEqual(calls.scores, [{ board: 3, score: receipt.score }]);
  assert.deepEqual(calls.writes, [{ [LEADERBOARD_CONSENT_KEY]: cloudChoice(true) }]);
  assert.equal(values[LEADERBOARD_CONSENT_KEY], cloudChoice(true));
  assert.equal(values["community-seasons-save-v1"], "untouched player save");
  await participation.observe(receipt);
  assert.equal(calls.scores.length, 1);
  assert.deepEqual(statuses.map(({ status }) => status), ["pending", "submitted"]);
});

test("account opt-in and opt-out propagate between devices without reading or replacing the game save", async (t) => {
  const firstReceipt = sealedReceipt(t);
  const secondReceipt = sealedReceipt(t, 513);
  const thirdReceipt = sealedReceipt(t, 723);
  const { values, device } = cloudHarness();
  const a = device(), b = device();
  await a.participation.join(firstReceipt);
  await b.participation.refresh();
  assert.equal(b.participation.hasConsent(), true);
  await b.participation.observe(secondReceipt);
  assert.deepEqual(b.calls.scores, [{ board: 3, score: secondReceipt.score }]);
  const declined = a.participation.decline();
  assert.equal(a.participation.hasConsent(), false, "explicit opt-out blocks this page immediately");
  await declined;
  assert.equal(values[LEADERBOARD_CONSENT_KEY], cloudChoice(false));
  await b.participation.observe(thirdReceipt);
  assert.equal(b.participation.hasConsent(), false);
  assert.equal(b.preferences.at(-1), "disabled");
  assert.equal(b.calls.scores.length, 1, "a cached earlier opt-in cannot override the account's current opt-out");
  for (const calls of [a.calls, b.calls]) {
    assert.ok(calls.reads.every((keys) => keys.length === 1 && keys[0] === LEADERBOARD_CONSENT_KEY));
    assert.ok(calls.writes.every((items) => Object.keys(items).length === 1 && Object.hasOwn(items, LEADERBOARD_CONSENT_KEY)));
  }
  assert.equal(values["community-seasons-save-v1"], "untouched player save");
});

test("each new automatic result re-reads enabled cloud consent and only posts once", async (t) => {
  const firstReceipt = sealedReceipt(t);
  const secondReceipt = sealedReceipt(t, 513);
  const { device } = cloudHarness(cloudChoice(true));
  const { participation, calls, statuses } = device();
  await participation.refresh();
  assert.equal(calls.reads.length, 1);
  const pending = participation.observe(firstReceipt);
  assert.equal(participation.observe(firstReceipt), pending);
  assert.deepEqual(statuses, [], "status callbacks are asynchronous");
  await pending;
  await participation.observe(firstReceipt);
  await participation.observe(secondReceipt);
  assert.equal(calls.reads.length, 3, "refresh cannot replace the fresh read required for each run");
  assert.deepEqual(calls.scores, [{ board: 3, score: firstReceipt.score }, { board: 3, score: secondReceipt.score }]);
  assert.deepEqual(statuses.filter(({ status }) => status === "submitted").map(({ run }) => run), [firstReceipt, secondReceipt]);
});

test("a queued result sees a cross-device opt-out that happened during the previous submission", async (t) => {
  const firstReceipt = sealedReceipt(t);
  const secondReceipt = sealedReceipt(t, 513);
  const { values, device } = cloudHarness(cloudChoice(true));
  let release, started;
  const firstStarted = new Promise((resolve) => { started = resolve; });
  const { participation, calls } = device({
    submit() { started(); return new Promise((resolve) => { release = resolve; }); },
  });
  const first = participation.observe(firstReceipt);
  await firstStarted;
  const second = participation.observe(secondReceipt);
  values[LEADERBOARD_CONSENT_KEY] = cloudChoice(false);
  release({ score: firstReceipt.score });
  await Promise.all([first, second]);
  assert.equal(calls.reads.length, 2);
  assert.equal(calls.scores.length, 1);
  assert.equal(participation.hasConsent(), false);
  assert.equal(participation.submissionStatus(secondReceipt), "ready");
});

test("corrupt, unsupported-version and non-boolean cloud choices fail closed", async (t) => {
  const receipt = sealedReceipt(t);
  for (const value of [
    "", "not json", "null", "[]", "true", "{}", "1", null, 1,
    JSON.stringify({ version: 1, enabled: true }),
    JSON.stringify({ version: 3, enabled: true }),
    JSON.stringify({ version: 2, enabled: "true" }),
    JSON.stringify({ version: 2, enabled: 1 }),
    JSON.stringify({ version: 2, enabled: true, privateName: "ignored" }),
  ]) {
    const { device } = cloudHarness(value);
    const { participation, calls, preferences } = device();
    await assert.doesNotReject(participation.observe(receipt));
    assert.equal(participation.hasConsent(), false);
    assert.equal(preferences.at(-1), "unavailable", String(value));
    assert.deepEqual(calls.scores, []);
    assert.deepEqual(calls.writes, [], "invalid stored data is not silently overwritten");
  }
});

test("failed, malformed or unsupported cloud reads cannot use a cached opt-in", async (t) => {
  const receipt = sealedReceipt(t);
  for (const overrides of [
    { read: async () => { throw new Error("private SDK details"); } },
    { read: async () => null }, { read: async () => [] },
    { support: (ability) => ability !== "getCloudStorage" },
  ]) {
    const { device } = cloudHarness(cloudChoice(true));
    const { participation, calls, preferences } = device(overrides);
    await participation.refresh();
    await assert.doesNotReject(participation.observe(receipt));
    assert.equal(participation.hasConsent(), false);
    assert.equal(preferences.at(-1), "unavailable");
    assert.deepEqual(calls.scores, []);
    assert.doesNotMatch(JSON.stringify(preferences), /private/);
  }
  let submitted = 0;
  for (const loadSdk of [async () => null, async () => { throw new Error("offline"); }]) {
    const participation = createLeaderboardParticipation({ async submit() { submitted++; } }, { loadSdk });
    await assert.doesNotReject(participation.observe(receipt));
    assert.equal(participation.hasConsent(), false);
  }
  assert.equal(submitted, 0);
});

test("cloud-write failure after accepted score keeps submitted status and retries only preference persistence", async (t) => {
  const receipt = sealedReceipt(t);
  let attempts = 0;
  const { values, device } = cloudHarness();
  const { participation, calls, preferences } = device({
    async write(items, state) {
      if (++attempts === 1) throw new Error("offline after Toy accepted score");
      Object.assign(state, items);
    },
  });
  await assert.rejects(participation.join(receipt), code("preference-unavailable"));
  assert.equal(participation.submissionStatus(receipt), "submitted");
  assert.equal(participation.hasConsent(), false);
  assert.equal(preferences.at(-1), "unavailable");
  assert.equal(calls.scores.length, 1);
  assert.equal(Object.hasOwn(values, LEADERBOARD_CONSENT_KEY), false);
  await participation.observe(receipt);
  assert.equal(calls.scores.length, 1);
  await participation.join(receipt);
  assert.equal(calls.scores.length, 1, "saving the choice again must not repost an accepted score");
  assert.equal(calls.writes.length, 2);
  assert.equal(participation.hasConsent(), true);
  assert.equal(values[LEADERBOARD_CONSENT_KEY], cloudChoice(true));
});

test("declining renewed Toy permission saves account opt-out before another queued result can post", async (t) => {
  const firstReceipt = sealedReceipt(t);
  const secondReceipt = sealedReceipt(t, 513);
  const { values, device } = cloudHarness(cloudChoice(true));
  let rejectFirst, started;
  const firstStarted = new Promise((resolve) => { started = resolve; });
  const a = device({ submit() { started(); return new Promise((resolve, reject) => { rejectFirst = reject; }); } });
  const first = a.participation.observe(firstReceipt);
  await firstStarted;
  const second = a.participation.observe(secondReceipt);
  rejectFirst({ type: "user_denied", nickname: "private user" });
  await Promise.all([first, second]);
  assert.equal(a.participation.hasConsent(), false);
  assert.equal(a.participation.submissionStatus(firstReceipt), "declined");
  assert.equal(a.calls.scores.length, 1);
  assert.equal(values[LEADERBOARD_CONSENT_KEY], cloudChoice(false));
  const b = device();
  await b.participation.observe(secondReceipt);
  assert.equal(b.participation.hasConsent(), false);
  assert.deepEqual(b.calls.scores, []);
  assert.doesNotMatch(JSON.stringify(a.statuses), /private user|nickname/);
});

test("failed opt-out persistence blocks stale enabled cloud state and never repeats permission prompts", async (t) => {
  const firstReceipt = sealedReceipt(t);
  const secondReceipt = sealedReceipt(t, 513);
  const { values, device } = cloudHarness(cloudChoice(true));
  const a = device({
    async submit() { throw { type: "user_denied" }; },
    async write() { throw new Error("cloud is read-only right now"); },
  });
  await a.participation.observe(firstReceipt);
  assert.equal(values[LEADERBOARD_CONSENT_KEY], cloudChoice(true), "fixture retains the old cloud value after a failed write");
  await a.participation.observe(secondReceipt);
  await a.participation.refresh();
  assert.equal(a.participation.hasConsent(), false);
  assert.equal(a.preferences.at(-1), "unavailable");
  assert.equal(a.calls.scores.length, 1);
  assert.equal(a.calls.writes.length, 1);
});

test("explicit decline is immediate, throws sanitized save errors, and blocks posting against old cloud consent", async (t) => {
  const receipt = sealedReceipt(t);
  const { device } = cloudHarness(cloudChoice(true));
  const { participation, calls, preferences } = device({ async write() { throw new Error("private failure details"); } });
  await participation.refresh();
  assert.equal(participation.hasConsent(), true);
  const declined = participation.decline();
  assert.equal(participation.hasConsent(), false);
  await assert.rejects(declined, (error) => code("preference-unavailable")(error) && !error.message.includes("private"));
  await participation.observe(receipt);
  assert.equal(participation.hasConsent(), false);
  assert.equal(preferences.at(-1), "unavailable");
  assert.deepEqual(calls.scores, []);
});

test("a later explicit decline supersedes an in-flight Join without briefly writing enabled consent", async (t) => {
  const receipt = sealedReceipt(t);
  const { values, device } = cloudHarness();
  let release, started;
  const firstStarted = new Promise((resolve) => { started = resolve; });
  const { participation, calls } = device({ submit() { started(); return new Promise((resolve) => { release = resolve; }); } });
  const joined = participation.join(receipt);
  await firstStarted;
  const declined = participation.decline();
  release({ score: receipt.score });
  await Promise.all([joined, declined]);
  assert.equal(participation.hasConsent(), false);
  assert.equal(participation.submissionStatus(receipt), "submitted");
  assert.deepEqual(calls.writes, [{ [LEADERBOARD_CONSENT_KEY]: cloudChoice(false) }]);
  assert.equal(values[LEADERBOARD_CONSENT_KEY], cloudChoice(false));
});

test("an in-flight cloud read cannot override an explicit decline or dispatch a stale-consent score", async (t) => {
  const receipt = sealedReceipt(t);
  const { device } = cloudHarness(cloudChoice(true));
  let release, started;
  const readStarted = new Promise((resolve) => { started = resolve; });
  const { participation, calls } = device({ read() { started(); return new Promise((resolve) => { release = resolve; }); } });
  const observed = participation.observe(receipt);
  await readStarted;
  const declined = participation.decline();
  release({ [LEADERBOARD_CONSENT_KEY]: cloudChoice(true) });
  await Promise.all([observed, declined]);
  assert.equal(participation.hasConsent(), false);
  assert.deepEqual(calls.scores, []);
  assert.deepEqual(calls.writes, [{ [LEADERBOARD_CONSENT_KEY]: cloudChoice(false) }]);
});

test("explicit join denial persists refusal while a later deliberate Join can succeed", async (t) => {
  const receipt = sealedReceipt(t);
  const { values, device } = cloudHarness();
  let submissions = 0;
  const { participation, calls } = device({
    async submit(request) {
      if (++submissions === 1) throw { type: "user_denied" };
      return { score: request.score };
    },
  });
  await assert.rejects(participation.join(receipt), code("user-denied"));
  assert.equal(participation.hasConsent(), false);
  assert.equal(values[LEADERBOARD_CONSENT_KEY], cloudChoice(false));
  await participation.observe(receipt);
  assert.equal(calls.scores.length, 1);
  await participation.join(receipt);
  assert.equal(participation.hasConsent(), true);
  assert.equal(values[LEADERBOARD_CONSENT_KEY], cloudChoice(true));
  assert.equal(calls.scores.length, 2);
});

test("an ambiguous Join does not persist enabled preference or replay a possibly accepted result", async (t) => {
  const receipt = sealedReceipt(t);
  const { device } = cloudHarness();
  const { participation, calls } = device({ async submit() { throw new Error("Lost response"); } });
  await assert.rejects(participation.join(receipt), code("uncertain"));
  await assert.rejects(participation.join(receipt), code("uncertain"));
  assert.equal(participation.hasConsent(), false);
  assert.equal(participation.submissionStatus(receipt), "uncertain");
  assert.equal(calls.scores.length, 1);
  assert.deepEqual(calls.writes, []);
});

test("cloud consent and posting ignore huge localStorage values and reject forged receipts before all SDK access", async (t) => {
  const huge = 999_999_999_999_999;
  const receipt = sealedReceipt(t);
  const stored = {
    "community-seasons-best": String(huge),
    "community-seasons-last-run": JSON.stringify({ ...receipt, score: huge }),
    "community-seasons-leaderboard-consent-v2": cloudChoice(true),
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let storageReads = 0;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem(key) { storageReads++; return stored[key] ?? null; } },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  });
  const { device } = cloudHarness();
  const { participation, calls } = device();
  for (const fake of [null, { score: huge }, JSON.parse(stored["community-seasons-last-run"]), { ...receipt }, structuredClone(receipt)]) {
    await participation.observe(fake);
    await assert.rejects(participation.join(fake), code("invalid-run"));
  }
  assert.equal(calls.loads, 0);
  assert.deepEqual(calls.reads, []);
  assert.deepEqual(calls.scores, []);
  await participation.observe(receipt);
  assert.equal(participation.hasConsent(), false, "a forged local opt-in cannot replace the missing account choice");
  assert.deepEqual(calls.scores, []);
  await participation.join(receipt);
  assert.deepEqual(calls.scores, [{ board: 3, score: receipt.score }]);
  assert.ok(receipt.score < huge);
  assert.equal(storageReads, 0);
});

test("cloud read timeout fails closed even when a late enabled response arrives", async (t) => {
  const receipt = sealedReceipt(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { device } = cloudHarness(cloudChoice(true));
  let release, started;
  const readStarted = new Promise((resolve) => { started = resolve; });
  const { participation, calls, preferences } = device({ read() { started(); return new Promise((resolve) => { release = resolve; }); } });
  const observed = participation.observe(receipt);
  await readStarted;
  t.mock.timers.tick(8000);
  await assert.doesNotReject(observed);
  release({ [LEADERBOARD_CONSENT_KEY]: cloudChoice(true) });
  await Promise.resolve();
  assert.equal(participation.hasConsent(), false);
  assert.equal(preferences.at(-1), "unavailable");
  assert.deepEqual(calls.scores, []);
});

test("a timed-out enable write cannot overtake a newer opt-out, and unresolved writes never hang UI operations", async (t) => {
  const firstReceipt = sealedReceipt(t);
  const nextReceipt = sealedReceipt(t, 513);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { values, device } = cloudHarness();
  let releaseEnable, beganEnable, finishedDisable;
  const enableStarted = new Promise((resolve) => { beganEnable = resolve; });
  const disabledSaved = new Promise((resolve) => { finishedDisable = resolve; });
  const { participation, calls, preferences } = device({
    write(items, state) {
      const enabled = JSON.parse(items[LEADERBOARD_CONSENT_KEY]).enabled;
      if (enabled) {
        beganEnable();
        return new Promise((resolve) => {
          releaseEnable = () => { Object.assign(state, items); resolve(); };
        });
      }
      Object.assign(state, items);
      finishedDisable();
    },
  });
  const joined = participation.join(firstReceipt);
  await enableStarted;
  const joinRejected = assert.rejects(joined, code("preference-unavailable"));
  t.mock.timers.tick(8000);
  await joinRejected;
  assert.equal(participation.submissionStatus(firstReceipt), "submitted");
  assert.equal(participation.hasConsent(), false);

  const declined = participation.decline();
  const declineRejected = assert.rejects(declined, code("preference-unavailable"));
  await new Promise(setImmediate);
  assert.equal(calls.writes.length, 1, "false must wait until the earlier raw true request actually settles");
  t.mock.timers.tick(8000);
  await declineRejected;
  assert.equal(participation.hasConsent(), false);

  const refreshed = participation.refresh();
  await new Promise(setImmediate);
  t.mock.timers.tick(8000);
  await assert.doesNotReject(refreshed);
  assert.equal(preferences.at(-1), "unavailable");
  assert.deepEqual(calls.reads, [], "no stale cloud read may leapfrog the unresolved write");

  releaseEnable();
  await disabledSaved;
  // Queue behind the recovery operation to observe its confirmed final state.
  await participation.refresh();
  assert.deepEqual(calls.writes, [
    { [LEADERBOARD_CONSENT_KEY]: cloudChoice(true) },
    { [LEADERBOARD_CONSENT_KEY]: cloudChoice(false) },
  ]);
  assert.equal(values[LEADERBOARD_CONSENT_KEY], cloudChoice(false));
  assert.equal(preferences.at(-1), "disabled");
  await participation.observe(nextReceipt);
  assert.equal(participation.hasConsent(), false);
  assert.equal(calls.scores.length, 1, "a late accepted true write must never reactivate automatic posting");
});

test("opt-out waiting behind a timed-out write saves once when the raw request settles before its next deadline", async (t) => {
  const receipt = sealedReceipt(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { values, device } = cloudHarness();
  let release, began;
  const started = new Promise((resolve) => { began = resolve; });
  const { participation, calls } = device({
    write(items, state) {
      if (JSON.parse(items[LEADERBOARD_CONSENT_KEY]).enabled) {
        began();
        return new Promise((resolve) => { release = () => { Object.assign(state, items); resolve(); }; });
      }
      Object.assign(state, items);
    },
  });
  const joined = participation.join(receipt);
  await started;
  const rejected = assert.rejects(joined, code("preference-unavailable"));
  t.mock.timers.tick(8000);
  await rejected;
  const declined = participation.decline();
  await new Promise(setImmediate);
  release();
  await declined;
  await participation.refresh();
  assert.equal(participation.hasConsent(), false);
  assert.equal(values[LEADERBOARD_CONSENT_KEY], cloudChoice(false));
  assert.equal(calls.writes.length, 2, "the recovery task recognizes that the queued decline already saved false");
  assert.equal(calls.scores.length, 1);
});

test("hidden-name board participation never migrates to public-profile board 3", async (t) => {
  const receipt = sealedReceipt(t);
  const oldKey = "community-seasons-leaderboard-consent-v1";
  for (const priorChoice of [true, false]) {
    const { values, device } = cloudHarness();
    const oldValue = JSON.stringify({ version: 1, enabled: priorChoice });
    values[oldKey] = oldValue;
    const { participation, calls, preferences } = device();
    await participation.refresh();
    await participation.observe(receipt);
    assert.equal(participation.hasConsent(), false);
    assert.equal(preferences.at(-1), "ask", "public profile display requires a new explicit account choice");
    assert.deepEqual(calls.scores, []);
    assert.deepEqual(calls.writes, [], "old consent is never silently migrated");
    assert.ok(calls.reads.every((keys) => keys.length === 1 && keys[0] === "community-seasons-leaderboard-consent-v2"));
    await participation.join(receipt);
    assert.deepEqual(calls.scores, [{ board: 3, score: receipt.score }]);
    assert.deepEqual(calls.writes, [{ [LEADERBOARD_CONSENT_KEY]: JSON.stringify({ version: 2, enabled: true }) }]);
    assert.equal(values[oldKey], oldValue, "the previous hidden-profile account choice is left intact");
  }
});

test("an immediate opt-out cancels a queued explicit Join before any score dispatch", async (t) => {
  const receipt = sealedReceipt(t);
  const { values, device } = cloudHarness();
  const { participation, calls, statuses } = device();
  const joined = participation.join(receipt);
  const declined = participation.decline();
  await Promise.all([joined, declined]);
  assert.deepEqual(calls.scores, []);
  assert.equal(participation.submissionStatus(receipt), "ready");
  assert.ok(statuses.every(({ status }) => status !== "submitted" && status !== "declined"));
  assert.equal(participation.hasConsent(), false);
  assert.equal(values[LEADERBOARD_CONSENT_KEY], cloudChoice(false));
});

test("an opt-out cancels a Join queued behind an outstanding cloud read", async (t) => {
  const receipt = sealedReceipt(t);
  const { values, device } = cloudHarness();
  let releaseRead, began;
  const readStarted = new Promise((resolve) => { began = resolve; });
  const { participation, calls } = device({
    read() { began(); return new Promise((resolve) => { releaseRead = resolve; }); },
  });
  const refreshed = participation.refresh();
  await readStarted;
  const joined = participation.join(receipt);
  const declined = participation.decline();
  releaseRead({});
  await Promise.all([refreshed, joined, declined]);
  assert.deepEqual(calls.scores, []);
  assert.equal(participation.submissionStatus(receipt), "ready");
  assert.equal(participation.hasConsent(), false);
  assert.equal(values[LEADERBOARD_CONSENT_KEY], cloudChoice(false));
});

for (const automatic of [false, true]) {
  test(`opt-out cancels ${automatic ? "automatic posting" : "explicit Join"} while SDK capability checking waits`, async (t) => {
    const receipt = sealedReceipt(t);
    const { values, device } = cloudHarness(automatic ? cloudChoice(true) : undefined);
    let releaseSupport, began;
    const supportStarted = new Promise((resolve) => { began = resolve; });
    const { participation, calls, statuses } = device({
      support(ability) {
        if (ability !== "submitScore") return true;
        began();
        return new Promise((resolve) => { releaseSupport = resolve; });
      },
    });
    const pending = automatic ? participation.observe(receipt) : participation.join(receipt);
    await supportStarted;
    assert.equal(participation.submissionStatus(receipt), "pending");
    const declined = participation.decline();
    assert.equal(participation.hasConsent(), false);
    releaseSupport(true);
    await Promise.all([pending, declined]);
    assert.deepEqual(calls.scores, [], "SDK method must not be called after opt-out while its prerequisites were loading");
    assert.equal(participation.submissionStatus(receipt), "ready");
    assert.ok(statuses.every(({ status }) => status !== "submitted" && status !== "declined"));
    assert.equal(values[LEADERBOARD_CONSENT_KEY], cloudChoice(false));
    assert.deepEqual(calls.writes, [{ [LEADERBOARD_CONSENT_KEY]: cloudChoice(false) }]);
  });
}
