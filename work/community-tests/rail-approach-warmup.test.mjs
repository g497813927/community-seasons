import test from "node:test";
import assert from "node:assert/strict";
import "./compile.mjs";
const { createRun, update, act, activateBoost, generateAhead, RAIL_UNLOCK_TIME } = await import("./compiled/engine.mjs");

// Start at the real beginning rather than setting time >= RAIL_UNLOCK_TIME:
// the original defect accumulated empty road while the locked gate moved.
function firstStation(seed, headstart) {
  const s = createRun(seed);
  s.mode = "running";
  // Contact immunity keeps the deterministic measurement alive. Grace does
  // not affect normal speed, event scheduling, generated rows or pickups.
  s.boosts.grace = 1e9;
  if (headstart) assert.equal(activateBoost(s, "headstart", 3), true);
  let elapsed = 0;
  let lastObstacle = null;
  let lastObstacleTime = null;
  let boarded = null;
  let fadeFrames = 0;
  const insertedRows = [];
  for (let frame = 0; frame < 6000; frame++) {
    if (s.fork && (s.fork.at - s.distance) / s.speed < 2.2 && !s.turnRemaining && s.lane !== -1)
      act(s, "left");
    if (!s.rail && s.time >= RAIL_UNLOCK_TIME && s.railPreparedAt === s.nextRailAt) {
      const seconds = (s.nextRailAt - s.distance) / s.speed;
      if (seconds > 0 && seconds < 1) {
        fadeFrames++;
        for (const [kind, objects] of [["obstacle", s.obstacles], ["coin", s.pickups], ["booster", s.relics]]) {
          assert.equal(objects.some((object) => object.at >= s.distance - 0.22 && object.at <= s.nextRailAt), false,
            `${kind} inside final boarding fade: seed=${seed}, headstart=${headstart}, distance=${s.distance}`);
        }
      }
    }
    if (s.rail?.phase === "question") {
      assert.ok(boarded, "boarding phase was observed");
      assert.ok(Number.isFinite(s.lastForkAt), "the normal opening fork was traversed");
      assert.ok(fadeFrames >= 35, "the normal one-second approach fade was measured");
      assert.ok(boarded.normalTime >= 60, "cart encounter must retain its 60-second warmup");
      assert.ok(Math.abs(elapsed - boarded.elapsed - 2) < 0.03, "boarding remains two seconds before the first question");
      assert.ok(s.rail.duration >= 9 && s.rail.duration <= 11, "question reading time is unchanged");
      assert.ok(lastObstacleTime !== null);
      const emptySeconds = boarded.elapsed - lastObstacleTime;
      assert.ok(emptySeconds >= 1, "the final fade retains a clear approach");
      assert.ok(emptySeconds <= 4.2,
        `too much empty road before boarding: ${emptySeconds.toFixed(3)}s, seed=${seed}, headstart=${headstart}, last=${lastObstacle}, gate=${boarded.distance}`);
      return { seed, headstart, emptySeconds, emptyToQuestionSeconds: elapsed - lastObstacleTime, emptyMeters: boarded.distance - lastObstacle, boardTime: boarded.elapsed, lastObstacle, stationAt: s.nextRailAt, fadeFrames, insertedRows };
    }
    const previousDistance = s.distance;
    const previousObstacles = s.obstacles.map((object) => object.at);
    const previousNextRow = s.nextRow;
    const previousTrailEnd = s.lastTrailEnd;
    const previousLastObstacle = Math.max(...previousObstacles);
    const wasRail = Boolean(s.rail);
    update(s, 0.025);
    elapsed += 0.025;
    const inserted = s.obstacles.filter(object => !previousObstacles.includes(object.at) && object.at < previousNextRow - 0.01);
    if (inserted.length) {
      const at = Math.min(...inserted.map(object => object.at));
      const rowSpeed = Math.min(66, 12 + at * 0.006);
      assert.ok(at - previousDistance >= rowSpeed * 1.3,
        `late approach repair did not leave reaction time: seed=${seed}, at=${at}, distance=${previousDistance}`);
      assert.ok(at - previousLastObstacle >= Math.min(66, 12 + previousLastObstacle * 0.006) * 1.3,
        `approach repair crowded the preceding obstacle: seed=${seed}`);
      assert.ok(previousTrailEnd < at - rowSpeed * 0.46,
        `approach repair overlapped the preceding coin path: seed=${seed}`);
      insertedRows.push({ at, distance: previousDistance });
    }
    for (const at of previousObstacles) {
      if (at >= previousDistance - 0.23 && at <= s.distance + 0.22 && (lastObstacle === null || at > lastObstacle)) {
        lastObstacle = at;
        lastObstacleTime = elapsed;
      }
    }
    if (!wasRail && s.rail) boarded = { elapsed, distance: s.distance, normalTime: s.time };
    assert.equal(s.mode, "running", `measurement unexpectedly stopped: ${s.reason}`);
  }
  assert.fail(`first station never reached, seed=${seed}, headstart=${headstart}`);
}

test("reported seed fits the final safe row after warmup without changing station or boarding timing", (t) => {
  const result = firstStation(1017116225, false);
  assert.ok(result.insertedRows.length > 0, "the pending pre-unlock gap must actually be repaired");
  assert.ok(result.emptySeconds < 2.2, "the reported 4.375-second gap must be shortened, not merely accepted");
  assert.ok(Math.abs(result.stationAt - 1031.6330301672783) < 0.01, "station frequency/location is unchanged");
  assert.ok(Math.abs(result.boardTime - 69.35) < 0.03, "the gate is not moved closer to mask the gap");
  t.diagnostic(`reported seed: last obstacle→boarding ${result.emptySeconds.toFixed(3)}s; →first question ${result.emptyToQuestionSeconds.toFixed(3)}s; last obstacle ${result.lastObstacle.toFixed(3)}m`);
});

test("a station repair never duplicates retained obstacles, overlaps existing coins, or appears too late", () => {
  function boundary({ obstacleAt = 953.5459164150096, coinAt = null, distance = 868 } = {}) {
    const s = createRun(1017116225);
    Object.assign(s, { mode: "running", time: 60.1, distance, speed: 12 + distance * .006,
      nextRailAt: 1031.6330301672783, nextRow: 1002.4932256854081,
      nextForkAt: Infinity, nextPortalAt: Infinity, nextRelicAt: Infinity,
      rows: 39, nextId: 10, lastTrailEnd: -Infinity });
    s.obstacles = [{ id: 1, at: obstacleAt, lane: 0, kind: "arch", resolved: false }];
    s.pickups = coinAt === null ? [] : [{ id: 2, at: coinAt, lane: 0, height: 1, taken: false, route: "guide" }];
    generateAhead(s);
    return s.obstacles.filter(o => o.id !== 1 && o.at < s.nextRailAt);
  }
  assert.ok(boundary().length > 0, "the captured pending-row boundary must be repairable");
  assert.equal(boundary({ obstacleAt: 999.4895326444747 }).length, 0,
    "an existing row just beyond the proposed final row must prevent duplication");
  assert.equal(boundary({ coinAt: 995 }).length, 0,
    "actual retained coins must protect their route even if lastTrailEnd was cleared");
  assert.equal(boundary({ distance: 994 }).length, 0,
    "restoring close to the station must not introduce an obstacle with no reaction time");
});

for (const headstart of [false, true]) {
  test(`natural ${headstart ? "level-three head-start" : "normal"} opening does not accumulate a long empty station approach`, (t) => {
    const rows = Array.from({ length: 32 }, (_, index) => firstStation(index + 1 + Number(process.env.ENGINE_FUZZ_SEED_OFFSET ?? 0), headstart));
    const gaps = rows.map((row) => row.emptySeconds);
    const mean = gaps.reduce((total, gap) => total + gap, 0) / gaps.length;
    t.diagnostic(`${rows.length} natural openings: last obstacle→boarding ${Math.min(...gaps).toFixed(3)}–${Math.max(...gaps).toFixed(3)}s, mean ${mean.toFixed(3)}s; unchanged 2s boarding follows.`);
  });
}

test("widely distributed deterministic seeds keep natural station approaches short and clear", (t) => {
  let seed = 3231321585;
  const seeds = [];
  for (let i = 0; i < 256; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    seeds.push(seed);
  }
  const results = seeds.flatMap(seed => [firstStation(seed, false), firstStation(seed, true)]);
  for (const headstart of [false, true]) {
    const selected = results.filter(result => result.headstart === headstart);
    const gaps = selected.map(result => result.emptySeconds);
    t.diagnostic(`${selected.length} ${headstart ? "head-start" : "normal"} seeded openings: ${Math.min(...gaps).toFixed(3)}–${Math.max(...gaps).toFixed(3)}s; average ${(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(3)}s; repaired ${selected.filter(result => result.insertedRows.length).length}`);
  }
});
