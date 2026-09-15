import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "../helpers/compile.mjs";
const { Renderer } = await import("../helpers/compiled/render.mjs");
const { createRun, TURN_DURATION, MAX_SPEED } = await import("../helpers/compiled/engine.mjs");
const noop = () => {};
globalThis.window = { devicePixelRatio: 1 };
function renderer() {
  const fills = [];
  let path = [];
  const gradient = { addColorStop: noop };
  const ctx = new Proxy(
    {
      beginPath() {
        path = [];
      },
      moveTo(x, y) {
        path.push([x, y]);
      },
      lineTo(x, y) {
        path.push([x, y]);
      },
      fill() {
        fills.push({ color: this.fillStyle, points: path.map((p) => [...p]) });
      },
    },
    {
      get: (o, k) =>
        k === "createLinearGradient" || k === "createRadialGradient"
          ? () => gradient
          : (o[k] ?? noop),
      set: (o, k, v) => ((o[k] = v), true),
    },
  );
  const r = new Renderer({
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 390, height: 760 }),
  });
  r.resize();
  return { r, fills };
}
function state(scene = "autumn", dir = 1, speed = 14) {
  return Object.assign(createRun(4182, scene), {
    mode: "running",
    time: 100,
    distance: 980,
    speed,
    x: dir * 1.65,
    lane: dir,
    fork: { at: 980 },
    nextForkAt: 1e9,
    nextRailAt: 1e9,
    nextPortalAt: 1e9,
    obstacles: [],
    pickups: [],
    relics: [],
  });
}
function cross(s, dir) {
  Object.assign(s, {
    lastForkAt: s.fork.at,
    turnDirection: dir,
    turnEntryX: s.x,
    turnRemaining: TURN_DURATION,
    fork: null,
    x: 0,
    lane: 0,
  });
}
function setup(r, s) {
  r.center = 195;
  r.horizon = 193.8;
  r.focal = 684;
  r.configureCamera(s);
  r.forkDepth = s.fork ? s.fork.at - s.distance : null;
}
function rows(r, s) {
  setup(r, s);
  r.faces = [];
  for (const row of [68, 69, 70, 71, 72, 73, 74, 76, 80])
    r.scenery(s.scene, row, row * 14 - s.distance);
  return r.faces.map((f) => ({ color: f.color, points: r.faceView(f) }));
}
function almostGeometry(a, b, tolerance = 1e-7) {
  assert.equal(a.length, b.length, "a landmark wall appeared/disappeared");
  for (let f = 0; f < a.length; f++) {
    assert.equal(a[f].color, b[f].color);
    for (let p = 0; p < a[f].points.length; p++)
      assert.ok(
        Math.hypot(...a[f].points[p].map((n, k) => n - b[f].points[p][k])) < tolerance,
        "landmark changes its world position",
      );
  }
}
function visible(r, face) {
  const pts = r.clipNear(r.faceView(face)).map((p) => r.projectView(p));
  return (
    pts.length >= 3 &&
    !pts.every((p) => p[0] < 0) &&
    !pts.every((p) => p[0] > 390) &&
    !pts.every((p) => p[1] < 0) &&
    !pts.every((p) => p[1] > 760)
  );
}

test("complete scenery templates are independent of the camera pose when first cached", () => {
  for (const scene of ["spring", "summer", "autumn", "winter"]) {
    const straight = renderer().r,
      turning = renderer().r,
      s = state(scene);
    s.fork = null;
    setup(straight, s);
    straight.scenery(scene, 73, 42);
    s.lastForkAt = 980;
    s.turnDirection = -1;
    s.turnEntryX = -1.65;
    s.turnRemaining = 0.7;
    setup(turning, s);
    turning.scenery(scene, 73, 42);
    assert.deepEqual(
      turning.sceneryTemplates,
      straight.sceneryTemplates,
      "cached buildings permanently lose sides based on the first viewed direction",
    );
    const wall = straight.sceneryTemplates.get(`${scene}:1:1`).filter((f) => f.cull);
    assert.ok(wall.length >= 6, "box template does not retain all candidate surfaces");
  }
});

test("both populated streets keep exactly the same landmarks at the fork crossing in every season", () => {
  for (const scene of ["spring", "summer", "autumn", "winter"])
    for (const dir of [-1, 1])
      for (const speed of [14, MAX_SPEED]) {
        const { r } = renderer(),
          s = state(scene, dir, speed),
          before = rows(r, s);
        cross(s, dir);
        const after = rows(r, s);
        almostGeometry(before, after);
      }
});

test("approach and physical lane reversal move each branch continuously instead of reassigning buildings", () => {
  for (const dir of [-1, 1]) {
    const { r } = renderer(),
      s = state("autumn", dir);
    s.distance = 970;
    setup(r, s);
    const sample = () =>
      [-1, 1].flatMap((branch) =>
        [-7, 7].flatMap((x) => [12, 42, 84].map((z) => r.sceneryViewPoint(branch, x, 2, z))),
      );
    const before = sample();
    s.x -= dir * 0.0001;
    s.distance += 0.0001;
    setup(r, s);
    const after = sample();
    assert.ok(
      before.every((p, i) => Math.hypot(...p.map((n, k) => n - after[i][k])) < 0.02),
      "a requested lane change remaps the scenery to another road",
    );
  }
});

test("turn-end landmark coordinates remain continuous, including the curved road behind the camera", () => {
  for (const scene of ["spring", "summer", "autumn", "winter"])
    for (const dir of [-1, 1])
      for (const speed of [14, MAX_SPEED]) {
        const { r } = renderer(),
          s = state(scene, dir, speed);
        setup(r, s);
        cross(s, dir);
        s.distance += speed * TURN_DURATION;
        s.time += TURN_DURATION;
        s.turnRemaining = 1e-10;
        const before = rows(r, s);
        s.turnRemaining = 0;
        const after = rows(r, s);
        almostGeometry(before, after, 1e-6);
        assert.equal(
          r.curveTail,
          true,
          "curve disappears while roadside buildings are still visible",
        );
      }
});

test("the retained arc ends at interpolated actual travel, not the minimum arc length or the previous frame", () => {
  const { r } = renderer(),
    s = state();
  setup(r, s);
  cross(s, 1);
  s.turnRemaining = 0.02;
  s.time = 101.38;
  s.distance = 999.4;
  setup(r, s);
  s.turnRemaining = 0;
  s.time += 0.05;
  s.distance += 0.7;
  setup(r, s);
  assert.ok(Math.abs(r.turnEndDistance - 999.68) < 1e-8);
  assert.ok(Math.abs(r.curveAlong - (24 + 0.42)) < 1e-8);
  s.time += 0.05;
  s.distance += 0.7;
  setup(r, s);
  assert.ok(Math.abs(r.curveAlong - (24 + 1.12)) < 1e-8);
});

test("partially near-clipped walls keep their visible polygon and fully hidden walls are culled", () => {
  const { r } = renderer();
  r.focal = 684;
  r.center = 195;
  r.horizon = 194;
  const wall = [
    [-0.3, 5, -10],
    [-0.3, 5.3, 1],
    [0.3, 5.3, 1],
    [0.3, 5, -10],
  ];
  const clipped = r.clipNear(wall);
  assert.equal(clipped.length, 4);
  assert.ok(clipped.every((p) => p[2] >= -9));
  assert.ok(clipped.some((p) => p[2] === -9));
  assert.ok(
    clipped
      .map((p) => r.projectView(p))
      .some((p) => p[0] > 0 && p[0] < 390 && p[1] > 0 && p[1] < 760),
  );
  assert.deepEqual(r.clipNear(wall.map(([x, y, z]) => [x, y, z - 20])), []);
  for (const delta of [-0.00001, 0.00001]) {
    const p = wall.map(([x, y, z]) => [x, y, z + 1 + delta]);
    const out = r.clipNear(p);
    assert.ok(out.length >= 3, "whole wall disappears when one corner crosses the plane");
  }
});

test("the actual draw loop paints a wall straddling the near plane instead of dropping it", () => {
  const { r, fills } = renderer(),
    s = state();
  cross(s, 1);
  s.turnRemaining = 0.7;
  let inserted = false;
  r.scenery = () => {
    if (inserted) return;
    inserted = true;
    r.faces.push({
      points: [
        [-0.3, 5, -10],
        [-0.3, 5.3, 1],
        [0.3, 5.3, 1],
        [0.3, 5, -10],
      ],
      cameraSpace: true,
      color: "#123456",
      z: -4,
      layer: 20,
    });
  };
  r.render(s, 0);
  const wall = fills.find((f) => f.color === "#123456");
  assert.ok(wall && wall.points.length >= 4, "visible part of the building was discarded");
  assert.ok(
    wall.points.some(([x, y]) => x > 0 && x < 390 && y > 0 && y < 760),
    "clipped wall never reaches the canvas",
  );
});

test("turn scenery stays bounded and reuses twelve templates at first-fork and maximum speed", () => {
  for (const scene of ["spring", "summer", "autumn", "winter"])
    for (const speed of [14, MAX_SPEED]) {
      const { r } = renderer(),
        s = state(scene, 1, speed);
      r.render(s, 0);
      cross(s, 1);
      for (let i = 0; i <= 12; i++) {
        s.turnRemaining = TURN_DURATION * (1 - i / 12);
        s.distance = 980 + (speed * TURN_DURATION * i) / 12;
        s.time = 100 + (TURN_DURATION * i) / 12;
        r.render(s, 0);
        assert.ok(r.faces.length < 3000, `${scene} turn exceeded bounded geometry`);
        assert.equal(r.sceneryTemplates.size, 12);
      }
    }
});

test("rendered walls obey current camera depth while the TV panel keeps all three visible vents", () => {
  for (const dir of [-1, 1]) {
    const { r } = renderer(),
      s = state("autumn", dir);
    setup(r, s);
    cross(s, dir);
    s.turnRemaining = 0.7;
    s.distance += 10;
    r.render(s, 0);
    let previous = Infinity;
    for (const f of r.faces.filter((f) => f.cameraSpace && f.layer === 1)) {
      const depth = r.faceView(f).reduce((sum, p) => sum + p[2], 0) / f.points.length;
      assert.ok(depth <= previous + 1e-8, "roadside walls are sorted by old longitudinal depth");
      previous = depth;
    }
    const panel = r.faces.findIndex((f) => f.color === "#60bfd8"),
      vents = r.faces.flatMap((f, i) =>
        f.color === "#284c60" &&
        Math.max(...f.points.map((p) => p[0])) - Math.min(...f.points.map((p) => p[0])) > 0.4 &&
        Math.max(...f.points.map((p) => p[0])) - Math.min(...f.points.map((p) => p[0])) < 0.5 &&
        Math.max(...f.points.map((p) => p[1])) - Math.min(...f.points.map((p) => p[1])) < 0.05
          ? [i]
          : [],
      );
    assert.ok(panel >= 0 && vents.length >= 3);
    assert.ok(
      vents.every((i) => i > panel),
      "camera depth calculation covers the rear vents",
    );
  }
});

test("distant seasonal panorama does not switch coordinate systems when the turn starts", () => {
  for (const scene of ["spring", "autumn", "winter"])
    for (const dir of [-1, 1]) {
      const { r } = renderer(),
        s = state(scene, dir);
      r.render(s, 0);
      const before = r.faces.filter((f) => f.cameraSpace && f.points.every((p) => p[2] > 90));
      cross(s, dir);
      r.render(s, 0);
      const after = r.faces.filter((f) => f.cameraSpace && f.points.every((p) => p[2] > 90));
      // Only the fixed panorama remains at this camera depth after a right-angle branch.
      for (const face of before.filter((f) => f.points.some((p) => Math.abs(p[0]) > 20)))
        assert.ok(
          after.some(
            (f) =>
              f.color === face.color && JSON.stringify(f.points) === JSON.stringify(face.points),
          ),
          "skyline jumps with the local road coordinate reset",
        );
    }
});

test("export actual clipped renderer frames around both fork crossings and turn endings", () => {
  const groups = [];
  for (const dir of [-1, 1]) {
    const { r } = renderer(),
      s = state("autumn", dir, 14),
      frames = [];
    const add = (label) => {
      r.render(s, 0);
      const polygons = r.faces
        .filter((f) => visible(r, f))
        .map((f) => {
          const points = r.clipNear(r.faceView(f)).map((p) => r.projectView(p));
          return `<polygon points="${points.map((p) => p.join(",")).join(" ")}" fill="${f.color}"/>`;
        })
        .join("");
      frames.push({ label, polygons });
    };
    s.distance = 979.8;
    add("Approaching");
    s.distance = 980;
    add("At the fork");
    cross(s, dir);
    add("Turn begins");
    s.turnRemaining = 0.000001;
    s.distance += 14 * TURN_DURATION;
    s.time += TURN_DURATION;
    add("Turn ending");
    s.turnRemaining = 0;
    add("Turn complete");
    s.time += 0.1;
    s.distance += 1.4;
    add("Continuing");
    groups.push(frames);
  }
  const cell = (frame, x, y) =>
    `<svg x="${x}" y="${y}" width="390" height="760" viewBox="0 0 390 760"><rect width="390" height="760" fill="#ead1aa"/><rect y="220" width="390" height="540" fill="#ae9c70"/>${frame.polygons}<rect width="390" height="34" fill="#0a2b24"/><text x="195" y="23" text-anchor="middle" fill="#f0ddb5" font-family="sans-serif" font-size="17">${frame.label}</text></svg>`;
  let svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="2340" height="1520" viewBox="0 0 2340 1520">';
  groups.forEach((frames, row) =>
    frames.forEach((frame, col) => (svg += cell(frame, col * 390, row * 760))),
  );
  svg += "</svg>";
  fs.writeFileSync(new URL("./fork-scenery-continuity.svg", import.meta.url), svg);
  const html = `<!doctype html><meta charset="utf-8"><title>Fork scenery continuity</title><style>body{margin:0;background:#071e19;color:#f0ddb5;font:16px system-ui}main{display:flex;justify-content:center;gap:12px}svg{width:min(44vw,390px);height:auto}header{text-align:center;padding:14px}button{padding:8px 16px;margin:0 5px} .frame{display:none}.frame.active{display:block}</style><header><button id="play">Pause</button><button id="next">Step</button><span id="caption"></span></header><main>${groups.map((frames) => '<svg viewBox="0 0 390 760">' + frames.map((f, i) => `<g class="frame ${i === 0 ? "active" : ""}" data-index="${i}"><rect width="390" height="760" fill="#ead1aa"/><rect y="220" width="390" height="540" fill="#ae9c70"/>${f.polygons}</g>`).join("") + "</svg>").join("")}</main><script>let index=0,playing=true;const names=${JSON.stringify(groups[0].map((f) => f.label))};function show(){document.querySelectorAll('.frame').forEach(e=>e.classList.toggle('active',+e.dataset.index===index));document.querySelector('#caption').textContent=names[index]+' · left / right';}document.querySelector('#next').onclick=()=>{index=(index+1)%names.length;show()};document.querySelector('#play').onclick=e=>{playing=!playing;e.target.textContent=playing?'Pause':'Play'};setInterval(()=>{if(playing){index=(index+1)%names.length;show()}},700);show();</script>`;
  fs.writeFileSync(new URL("./fork-scenery-continuity.html", import.meta.url), html);
});
