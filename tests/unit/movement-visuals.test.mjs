import test from "node:test";
import assert from "node:assert/strict";
import "../helpers/compile.mjs";
const {
  createRun,
  update,
  act,
  generateAhead,
  advancePreview,
  monsterPresence,
  finishReview,
  MAX_SPEED,
  INITIAL_SPEED,
  JUMP_DURATION,
  SLIDE_DURATION,
  LANE_WIDTH,
  CHASE_APPROACH_DURATION,
  CHASE_DURATION,
  MONSTER_INTRO_DURATION,
} = await import("../helpers/compiled/engine.mjs");
const { Renderer } = await import("../helpers/compiled/render.mjs");
const { getLesson } = await import("../helpers/compiled/community.mjs");
const { createProgress, bankRunRewards } = await import("../helpers/compiled/store.mjs");
const { createRailRide } = await import("../helpers/compiled/railway.mjs");
function run(distance = 9000) {
  const s = createRun();
  Object.assign(s, {
    mode: "running",
    time: 120,
    distance,
    nextRow: 1e9,
    nextPortalAt: 1e9,
    nextForkAt: Infinity,
    nextRailAt: Infinity,
    speed: MAX_SPEED,
  });
  return s;
}
function advance(s, seconds, step = 1 / 120) {
  while (seconds > 1e-8) {
    const dt = Math.min(seconds, step);
    update(s, dt);
    seconds -= dt;
  }
}
function source(seed, time = 120) {
  const s = createRun(seed);
  Object.assign(s, { distance: 16000, time, nextForkAt: Infinity, nextRailAt: Infinity });
  generateAhead(s);
  return s;
}
function groups(s) {
  const g = new Map();
  for (const c of s.pickups) {
    const coins = g.get(c.trailAt) || [];
    coins.push(c);
    g.set(c.trailAt, coins);
  }
  return g;
}

test("speed reaches66, exactly5.5x opening speed, and protection boosts keep their multipliers", () => {
  assert.equal(MAX_SPEED, 66);
  assert.equal(MAX_SPEED / INITIAL_SPEED, 5.5);
  for (const [effect, factor] of [
    [null, 1],
    ["rush", 1.65],
    ["headstart", 2],
    ["portal", 2],
  ])
    for (const step of [1 / 30, 1 / 60, 1 / 144, 0.25]) {
      const s = run();
      if (effect) s.boosts[effect] = 3;
      advance(s, 1, step);
      assert.equal(s.speed, 66 * factor);
      assert.ok(Math.abs(s.distance - 9000 - 66 * factor) < 1e-7);
    }
});

test("generated choices put simultaneous variable-length trails in multiple traversable lanes", () => {
  let multiple = 0,
    three = 0,
    openChoices = 0;
  const counts = new Set();
  for (const seed of [3, 17, 4182, 8911]) {
    const s = source(seed),
      same = source(seed);
    assert.deepEqual(s.pickups, same.pickups);
    assert.deepEqual(s.obstacles, same.obstacles);
    const ids = [...s.obstacles, ...s.pickups, ...s.relics].map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const [at, coins] of groups(s)) {
      const local = coins.filter((c) => c.route !== "connector");
      const lanes = [...new Set(local.map((c) => c.lane))];
      assert.ok(local.some((c) => c.route === "guide"));
      assert.ok(lanes.every((l) => [-1, 0, 1].includes(l)));
      for (const lane of lanes) counts.add(local.filter((c) => c.lane === lane).length);
      if (lanes.length < 2) continue;
      multiple++;
      if (lanes.length === 3) three++;
      const row = s.obstacles.filter((o) => o.at === at);
      if (row.length < 3) openChoices++;
      for (const lane of lanes) {
        const route = local.filter((c) => c.lane === lane);
        const obstacle = row.find((o) => o.lane === lane);
        assert.ok(
          Math.min(...route.map((c) => c.at)) < at && Math.max(...route.map((c) => c.at)) > at,
          "trails must overlap longitudinally",
        );
        if (obstacle) {
          assert.equal(row.length, 3);
          assert.ok(row.every((o) => o.kind === obstacle.kind));
          assert.ok(["block", "arch"].includes(obstacle.kind));
          if (obstacle.kind === "arch") assert.ok(route.every((c) => c.height === 0.6));
          else assert.ok(route.some((c) => c.height > 2));
        }
      }
    }
  }
  assert.ok(multiple > 100, `only ${multiple} multi-lane rows`);
  assert.ok(three > 10);
  assert.ok(openChoices > 30);
  assert.ok([...counts].some((n) => n < 5) && [...counts].some((n) => n > 5));
});

test("optional trails preserve blank rows and never cross blocked corridors or portal landing space", () => {
  let blanks = 0;
  for (const seed of [1, 3, 17, 4182]) {
    const s = source(seed, 0),
      g = groups(s),
      primary = [];
    for (const at of [...new Set(s.obstacles.map((o) => o.at))].sort((a, b) => a - b)) {
      const prior = primary.at(-1);
      if (prior === undefined || at - prior > 0.31 * Math.min(MAX_SPEED, 12 + prior * 0.006))
        primary.push(at);
    }
    for (const [i, at] of primary.entries())
      if (!g.has(at)) {
        blanks++;
        assert.equal(
          s.pickups.some((c) => Math.abs(c.at - at) < 0.3 * Math.min(MAX_SPEED, 12 + at * 0.006)),
          false,
        );
        const next = g.get(primary[i + 1]);
        if (next)
          assert.equal(
            next.some((c) => c.route === "connector"),
            false,
          );
      }
    for (const c of s.pickups.filter((c) => c.route !== "connector")) {
      for (const o of s.obstacles.filter((o) => Math.abs(o.at - c.at) < 0.9 && o.lane === c.lane))
        assert.notEqual(o.kind, "pillar");
    }
    for (const o of s.obstacles) {
      const portal = Math.round(o.at / 2500) * 2500;
      if (portal > 0) assert.ok(Math.abs(o.at - portal) >= 24);
    }
  }
  assert.ok(blanks > 50);
});

test("every generated guide and optional lane is playable and its coins collectible with normal physics", () => {
  const s = source(3);
  let checked = 0,
    maxSpeedRoutes = 0;
  for (const [at, all] of groups(s))
    for (const lane of new Set(all.filter((c) => c.route !== "connector").map((c) => c.lane))) {
      const coins = structuredClone(all.filter((c) => c.route !== "connector" && c.lane === lane));
      const speed = Math.min(MAX_SPEED, 12 + at * 0.006);
      const state = run(Math.min(...coins.map((c) => c.at)));
      state.lane = lane;
      state.x = lane * LANE_WIDTH;
      state.pickups = coins;
      state.obstacles = structuredClone(
        s.obstacles.filter((o) => o.at >= at && o.at <= at + 0.3 * speed + 1e-8),
      );
      state.relics = structuredClone(s.relics.filter((r) => r.at === at && r.lane === lane));
      const relics = [...state.relics];
      if (coins.some((c) => c.height > 1.5)) act(state, "jump");
      else if (coins.some((c) => c.height < 0.9)) act(state, "slide");
      while (state.mode === "running" && state.distance < Math.max(...coins.map((c) => c.at)) + 1)
        update(state, 1 / 120);
      assert.equal(state.mode, "running", `row ${at}, lane${lane}: ${state.reason}`);
      assert.equal(state.stumbles, 0);
      assert.equal(state.shieldAbsorbed, 0);
      assert.ok(
        coins.every((c) => c.taken),
        `missed route coins at${at}/${lane}`,
      );
      assert.ok(relics.every((r) => r.taken));
      checked++;
      if (speed === 66) maxSpeedRoutes++;
    }
  assert.ok(checked > 200);
  assert.ok(maxSpeedRoutes > 20);
});

test("66-speed collisions, jumps, slides and shield reviews stay consistent across slow frames", () => {
  for (const step of [1 / 30, 1 / 60, 1 / 144, 0.25])
    for (const [kind, action] of [
      ["block", "jump"],
      ["arch", "slide"],
      ["roots", "jump"],
      ["pillar", "right"],
    ]) {
      const s = run();
      s.obstacles = [{ id: 1, lane: 0, at: s.distance + 66 * 0.32, kind, resolved: false }];
      act(s, action);
      advance(s, 0.6, step);
      assert.equal(s.mode, "running", `${kind}/${step}`);
      assert.equal(s.review, null);
      assert.equal(s.stumbles, 0);
      const hit = run();
      hit.obstacles = [{ id: 1, lane: 0, at: hit.distance + 1, kind, resolved: false }];
      advance(hit, 0.25, step);
      assert.ok(hit.review);
      assert.equal(hit.mode, kind === "roots" ? "paused" : "over");
      const frozen = structuredClone(hit);
      advance(hit, 1, step);
      assert.deepEqual(hit, frozen);
      finishReview(hit);
      assert.equal(hit.mode, kind === "roots" ? "running" : "over");
    }
});

test("repeated jump inputs preserve one complete jump arc without queuing another jump", () => {
  for (const step of [1 / 30, 1 / 60, 1 / 144, 0.25]) {
    const single = run();
    single.obstacles = [{ id: 1, lane: 0, at: single.distance + single.speed * 0.32, kind: "block", resolved: false }];
    const repeated = structuredClone(single);
    assert.equal(act(single, "jump"), true);
    assert.equal(act(repeated, "jump"), true);
    let elapsed = 0;
    while (elapsed < JUMP_DURATION - 0.001 - 1e-8) {
      for (let press = 0; press < 3; press++) {
        assert.equal(act(repeated, "jump"), false, "extra jump inputs are ignored while airborne");
      }
      assert.deepEqual(repeated, single, "extra inputs must preserve the original jump and run state");
      const poses = [single, repeated].map((s) => {
        const renderer = new Renderer({ getContext: () => ({}) });
        renderer.runner(s, elapsed);
        return renderer.faces;
      });
      assert.deepEqual(poses[1], poses[0], "repeated jumps must follow the same rendered arc as one jump");
      const dt = Math.min(step, JUMP_DURATION - 0.001 - elapsed);
      advance(single, dt, step);
      advance(repeated, dt, step);
      elapsed += dt;
    }
    assert.ok(repeated.jump > 0 && repeated.jump <= 0.001 + 1e-8);
    assert.equal(act(repeated, "jump"), false, "an input just before landing must still be ignored");
    advance(single, 0.1, step);
    advance(repeated, 0.1, step);
    assert.deepEqual(repeated, single, "ignored inputs must not extend or queue a jump");
    assert.equal(repeated.jump, 0);
    assert.equal(repeated.mode, "running");
    assert.equal(repeated.review, null);
    assert.equal(act(repeated, "jump"), true, "a fresh input after landing starts the next jump");
    assert.equal(repeated.jump, JUMP_DURATION);
  }
});

test("explicit repeated slide inputs still restart the slide", () => {
  const s = run();
  assert.equal(act(s, "slide"), true);
  advance(s, SLIDE_DURATION / 3);
  assert.equal(act(s, "slide"), true);
  assert.equal(s.slide, SLIDE_DURATION);
  assert.equal(s.jump, 0);
  advance(s, SLIDE_DURATION + 0.05);
  assert.equal(s.slide, 0);
});

test("switching between jump and slide cancels the previous motion", () => {
  for (const [motion, other, duration] of [
    ["jump", "slide", JUMP_DURATION],
    ["slide", "jump", SLIDE_DURATION],
  ]) {
    const s = run();
    assert.equal(act(s, motion), true);
    advance(s, duration / 3);
    assert.ok(s[motion] > 0 && s[motion] < duration);
    assert.equal(act(s, other), true);
    assert.equal(s[motion], 0, `${other}: switching must cancel the previous motion`);
    assert.ok(s[other] > 0);
    assert.equal(act(s, motion), true);
    assert.equal(s[motion], duration);
    assert.equal(s[other], 0);
    advance(s, duration + 0.05);
    assert.equal(s[motion], 0, `${motion}: motion must finish after the last explicit input`);
  }
});

test("motion input repeats remain blocked outside a running road segment", () => {
  const states = ["ready", "paused", "over"].map((mode) => {
    const s = run();
    act(s, "jump");
    advance(s, 0.2);
    s.mode = mode;
    return [mode, s];
  });
  for (const phase of ["boarding", "question", "feedback", "falling", "complete"]) {
    const s = run();
    s.rail = createRailRide(() => 0.5);
    s.rail.phase = phase;
    states.push([`rail-${phase}`, s]);
  }
  for (const [label, s] of states) {
    const frozen = structuredClone(s);
    for (const motion of ["jump", "jump", "slide", "slide"]) {
      assert.equal(act(s, motion), false, `${label}: ${motion} was accepted`);
      assert.deepEqual(s, frozen, `${label}: a blocked input changed the run`);
    }
  }
});

test("132-speed dashes do not tunnel, double-credit coins or skip later unprotected reviews", () => {
  for (const step of [1 / 30, 1 / 60, 1 / 144, 0.25]) {
    const s = run();
    s.boosts.headstart = 0.3;
    s.permanentSkill = "shield";
    s.obstacles = ["pillar", "block", "arch", "roots"].map((kind, id) => ({
      id,
      lane: 0,
      at: 9000 + 0.5 + id * 0.9,
      kind,
      resolved: false,
    }));
    const coins = Array.from({ length: 12 }, (_, id) => ({
      id: id + 100,
      lane: 0,
      at: 9000 + 0.3 + id * 0.9,
      height: 1,
      taken: false,
    }));
    s.pickups = coins;
    advance(s, 0.25, step);
    assert.equal(s.mode, "running");
    assert.equal(s.review, null);
    assert.ok(s.obstacles.every((o) => o.resolved));
    assert.equal(s.coins, 12);
    let p = createProgress();
    p.skills.shield.unlocked = true;
    p = bankRunRewards(s, p);
    assert.equal(p.wallet, 12);
    assert.equal(s.skillCharge, 12);
    assert.equal(bankRunRewards(s, p), p);
    advance(s, 0.8, step);
    s.obstacles = [{ id: 1000, lane: 0, at: s.distance + 0.5, kind: "pillar", resolved: false }];
    advance(s, 0.2, step);
    assert.equal(s.mode, "over");
    assert.equal(s.review.kind, "pillar");
    assert.equal(s.coins, 12);
  }
});

test("chasers enter smoothly while outer-edge mistakes recover without instant failures", () => {
  assert.equal(CHASE_APPROACH_DURATION, 1.1);
  for (const chase of [false, true]) {
    const s = run(0);
    const values = [];
    for (const elapsed of [0, 0.01, 0.2, 0.55, 1.1]) {
      s.time = chase ? 30 : elapsed;
      s.chase = chase ? CHASE_DURATION - elapsed : 0;
      values.push(monsterPresence(s));
    }
    assert.equal(values[0], 0);
    assert.ok(values[1] < 0.001);
    assert.equal(values.at(-1), 1);
    assert.ok(values.every((v, i) => i === 0 || v > values[i - 1]));
  }
  for (const time of [0, 0.2, MONSTER_INTRO_DURATION - 0.01]) {
    const s = run(0);
    s.time = time;
    s.lane = -1;
    s.x = -LANE_WIDTH;
    act(s, "left");
    assert.equal(s.mode, "running", "outer-edge mistakes recover even during the opening");
    assert.ok(s.edgeStumble > 0);
    assert.ok(s.boosts.grace >= 0.5);
  }
  const s = run(0);
  s.lane = -1;
  s.x = -LANE_WIDTH;
  act(s, "left");
  assert.equal(s.mode, "running");
  assert.equal(s.chase, 6);
  assert.equal(monsterPresence(s), 0);
  act(s, "left");
  assert.equal(s.mode, "running", "quick repeated edge inputs remain recoverable");
  assert.equal(s.stumbles, 1);
});

test("preview completes obstacle and relic motions without restarting them every simulation step", () => {
  for (const target of ["block", "roots", "arch", "relic"]) {
    const s = run();
    const at = s.distance + s.speed * 0.3;
    if (target === "relic") {
      s.relics = [{ id: 1, lane: 0, at, kind: "magnet", taken: false }];
    } else {
      s.obstacles = [-1, 0, 1].map((lane, id) => ({
        id, lane, at, kind: target, resolved: false,
      }));
    }
    const targets = [...s.obstacles, ...s.relics];
    const motion = target === "arch" ? "slide" : "jump";
    const duration = motion === "slide" ? SLIDE_DURATION : JUMP_DURATION;
    advancePreview(s, 0.05);
    const remaining = s[motion];
    assert.ok(remaining > 0 && remaining < duration, `${target}: preview did not begin its motion`);
    advancePreview(s, 0.05);
    assert.ok(
      Math.abs(remaining - s[motion] - 0.05) < 1e-8,
      `${target}: autopilot restarted an active ${motion}`,
    );
    advancePreview(s, 0.25);
    assert.equal(s.mode, "running", `${target}: preview failed at its target`);
    assert.equal(s.review, null);
    assert.equal(s.stumbles, 0);
    assert.equal(s.shieldAbsorbed, 0);
    assert.ok(targets.every((item) => target === "relic" ? item.taken : item.resolved));
    for (let i = 0; i < 4; i++) advancePreview(s, 0.25);
    assert.equal(s[motion], 0, `${target}: preview motion did not finish`);
  }
});

test("preview follows guide trails and survives sustained maximum-speed running without shield masking", () => {
  for (const step of [1 / 30, 1 / 144, 0.25]) {
    const s = run(9000);
    s.nextRow = 9060;
    s.rows = 150;
    for (let i = 0; i < 1000; i++) {
      s.relics = [];
      const before = s.distance;
      advancePreview(s, step);
      assert.equal(s.mode, "running");
      assert.ok(s.distance >= before, "preview secretly reset");
      assert.equal(s.stumbles, 0);
      assert.equal(s.shieldAbsorbed, 0);
    }
    assert.equal(s.speed, 66);
  }
});

const noop = () => {};
globalThis.window = { devicePixelRatio: 1 };
function renderer(width = 1280, height = 720) {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get: (target, key) => {
        if (key === "createLinearGradient" || key === "createRadialGradient")
          return () => ({ addColorStop: noop });
        if (key === "fillText")
          return (text, ...args) =>
            calls.push({ text, args, font: target.font, alpha: target.globalAlpha ?? 1 });
        return target[key] ?? noop;
      },
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    },
  );
  const r = new Renderer({
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width, height }),
  });
  r.resize();
  return { r, calls };
}

test("seasonal landmarks survive scenery recycling until their own geometry leaves the camera", () => {
  for (const scene of ["spring", "summer", "autumn", "winter"])
    for (const boundary of [14, 42, 98, 994]) {
      const collect = (distance) => {
        const { r } = renderer();
        const s = run(distance);
        s.scene = scene;
        r.render(s, 0);
        return r.faces.filter((f) =>
          f.points.every((p) => Math.abs(p[0]) > 2.8 && p[1] > 0.1 && p[2] > -7 && p[2] < 30),
        );
      };
      const before = boundary - 0.01,
        after = boundary + 0.01;
      const a = collect(before),
        b = collect(after);
      const key = (f, d) =>
        JSON.stringify([
          f.color,
          f.points.map(([x, y, z]) => [x, y, z + d].map((n) => Math.round(n * 1e6) / 1e6)),
        ]);
      const afterKeys = new Set(b.map((f) => key(f, after)));
      assert.ok(a.length > 0);
      for (const face of a.filter((f) => f.points.every((p) => p[2] > -6.9 && p[2] < 29.9)))
        assert.ok(afterKeys.has(key(face, before)), `${scene} landmark vanished at ${boundary}`);
    }
});

test("original category and action wording stays identical near and far on the obstacle material", () => {
  for (const width of [390, 1280])
    for (const locale of ["en", "zh-CN"])
      for (const kind of ["block", "arch", "pillar", "roots"]) {
        const strings = [];
        for (const distance of [8, 25, 100]) {
          const { r, calls } = renderer(width, 720);
          const state = run();
          let id = 1;
          while (getLesson({ id, kind }).id !== "scam") id++;
          state.obstacles = [{ id, lane: 0, at: state.distance + distance, kind, resolved: false }];
          r.render(state, 0, false, locale);
          assert.equal(typeof r.postNotices, "undefined");
          const faces = r.faces.filter((f) => f.text?.emphasis);
          assert.ok(faces.length > 0);
          assert.ok(
            faces.every((f) => f.color === "#f0d9cc"),
            "label material differs from obstacle front",
          );
          assert.ok(
            faces.every((f) =>
              f.points.every(
                (p) => Math.abs(p[0]) < 0.8 && p[2] > distance - 1 && p[2] < distance + 0.1,
              ),
            ),
            "text detached from physical surface",
          );
          const values = faces.map((f) => f.text.value).sort();
          strings.push(values);
          const title = getLesson(state.obstacles[0]).label[locale === "en" ? "en" : "zh"];
          assert.ok(values.includes(title));
          const action =
            kind === "block"
              ? locale === "en"
                ? "↑ JUMP"
                : "↑ 跳过"
              : kind === "arch"
                ? locale === "en"
                  ? "↓ SLIDE"
                  : "↓ 下滑"
                : kind === "pillar"
                  ? locale === "en"
                    ? "← DODGE →"
                    : "← 换道 →"
                  : null;
          if (action) assert.ok(values.includes(action));
          if (distance === 25 && kind === "pillar")
            assert.ok(
              calls.some(
                (c) =>
                  ["SCAM", "BAIT", "诈骗诱导"].includes(c.text) &&
                  Number.parseFloat(c.font.split(" ")[1]) >= 5,
              ),
              "full category should use larger on-surface lettering before close range",
            );
        }
        assert.deepEqual(strings[0], strings[1]);
        assert.deepEqual(strings[1], strings[2]);
      }
});

test("pursuer geometry advances continuously into the camera from behind on both approaches", () => {
  for (const chase of [false, true]) {
    const { r } = renderer();
    const z = [];
    for (const age of [0.11, 0.55, 1.1]) {
      const boxes = [];
      r.box = (...args) => boxes.push(args);
      r.label = noop;
      const s = run(0);
      s.time = chase ? 30 : age;
      s.chase = chase ? 6 - age : 0;
      r.commenters(s, age, "en");
      const tvCase = boxes.find((a) => a[3] === 1.04 && a[4] === 0.88);
      assert.ok(tvCase);
      z.push(tvCase[2]);
    }
    assert.ok(z[0] < -8);
    assert.ok(z[0] < z[1] && z[1] < z[2]);
    assert.ok(z[2] < 0);
  }
});

test("early and late jumps collect the intended arc at opening and maximum speed without reaching other lanes", () => {
  for (const center of [12, 9000])
    for (const offset of [-0.15, 0, 0.15])
      for (const step of [1 / 30, 1 / 144]) {
        const speed = Math.min(66, 12 + center * 0.006),
          start = center - 0.46 * speed;
        const state = run(start - Math.max(0, -offset) * speed);
        const coins = Array.from({ length: 9 }, (_, i) => ({
          id: i,
          lane: 0,
          at: start + (0.92 * speed * i) / 8,
          height: 1 + Math.sin((Math.PI * i) / 8) * 2.15,
          taken: false,
        }));
        const other = coins.map((c) => ({ ...c, id: c.id + 100, lane: 1 }));
        state.pickups = [...coins, ...other];
        const jumpAt = start + offset * speed;
        let jumped = false;
        while (state.distance < center + 0.46 * speed + 2) {
          if (!jumped && state.distance >= jumpAt - 1e-8) {
            act(state, "jump");
            jumped = true;
          }
          update(state, step);
        }
        assert.ok(
          coins.every((c) => c.taken),
          `missed arc at speed${speed},offset${offset},step${step}`,
        );
        assert.equal(
          other.some((c) => c.taken),
          false,
        );
        assert.equal(state.coins, 9);
      }
  for (const motion of [null, "slide"]) {
    const s = run();
    if (motion) act(s, motion);
    s.pickups = [{ id: 1, lane: 0, at: s.distance + 0.1, height: 3.15, taken: false }];
    s.relics = [
      { id: 2, lane: 0, at: s.distance + 0.1, height: 3.1, kind: "shield", taken: false },
    ];
    update(s, 0.2);
    assert.equal(s.coins, 0);
    assert.equal(s.collectedRelics.shield, 0);
  }
});
