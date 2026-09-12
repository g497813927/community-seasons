import test from "node:test";
import assert from "node:assert/strict";
import "./compile.mjs";
const { Renderer } = await import("./compiled/render.mjs");
const { createRun, TURN_DURATION } = await import("./compiled/engine.mjs");

globalThis.window = { devicePixelRatio: 1 };
const roofColors = (winter) => winter
  ? new Set(["#f0f5ed", "#b6cdd6", "#ffffff"])
  : new Set(["#78596a", "#534754", "#ac7880"]);
const sub = (a, b) => a.map((n, i) => n - b[i]);
const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const center = (points) => [0, 1, 2].map((i) => points.reduce((sum, p) => sum + p[i], 0) / points.length);
function key(face) {
  const vertices = face.points.map((p) => JSON.stringify(p.map((n) => Number(n.toFixed(9)))));
  return JSON.stringify([face.color, vertices.sort()]);
}
function renderer() {
  const noop = () => {};
  const context = new Proxy({}, {
    get: (object, property) => property === "createLinearGradient" || property === "createRadialGradient"
      ? () => ({ addColorStop: noop }) : object[property] ?? noop,
    set: (object, property, value) => ((object[property] = value), true),
  });
  const r = new Renderer({ getContext: () => context, getBoundingClientRect: () => ({ width: 440, height: 752 }) });
  r.resize();
  return r;
}
function captured(winter, variant) {
  return capturedHouse(winter, variant).filter((f) => roofColors(winter).has(f.color));
}
function capturedHouse(winter, variant) {
  const r = renderer();
  r.captureScenery = true;
  r.cottage(0, 0, winter, variant);
  return r.faces;
}
function triangles(face) {
  return face.points.slice(1, -1).map((point, i) => [face.points[0], point, face.points[i + 2]]);
}
// Independent two-sided ray/triangle intersection: visibility is checked
// against the complete solid, not against the renderer's culling predicate.
function hit(triangle, direction) {
  const origin = [0, 5.4, -10];
  const [a, b, c] = triangle;
  const e1 = sub(b, a), e2 = sub(c, a), h = cross(direction, e2);
  const det = dot(e1, h);
  if (Math.abs(det) < 1e-10) return null;
  const inverse = 1 / det, s = sub(origin, a);
  const u = inverse * dot(s, h);
  if (u < -1e-8 || u > 1 + 1e-8) return null;
  const q = cross(s, e1), v = inverse * dot(direction, q);
  if (v < -1e-8 || u + v > 1 + 1e-8) return null;
  const t = inverse * dot(e2, q);
  return t > 0 ? t : null;
}
function intersections(face, direction) {
  return triangles(face).map((triangle) => hit(triangle, direction)).filter((t) => t !== null);
}
function assertPainter(full, drawn, label, targets = full, onlyVisibleTarget = false) {
  assert.ok(full.length >= 5, `${label}: reference roof must include its rear and underside`);
  // This is the actual renderer's painter ordering, rather than sorting by
  // the expected ray depths (which would conceal an ordering regression).
  const painted = [...drawn].sort((a, b) => a.layer - b.layer || b.z - a.z);
  const targetKeys = new Set(targets.map(key));
  let samples = 0;
  for (const face of targets) for (const triangle of triangles(face)) {
    for (const weights of [[0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]]) {
      const point = [0, 1, 2].map((i) => triangle.reduce((sum, p, j) => sum + p[i] * weights[j], 0));
      if (point[2] < -8.5) continue;
      const direction = sub(point, [0, 5.4, -10]);
      const expected = full.flatMap((f) => intersections(f, direction).map((t) => ({ key: key(f), t }))).sort((a, b) => a.t - b.t);
      if (!expected.length) continue;
      // A chimney can legitimately stand in front of this sample. Roof
      // visibility assertions concern pixels whose nearest exterior is roof.
      if (onlyVisibleTarget && !targetKeys.has(expected[0].key)) continue;
      const owner = painted.filter((f) => intersections(f, direction).length).at(-1);
      assert.ok(owner, `${label}: ray sees a hole in the roof`);
      assert.equal(key(owner), expected[0].key, `${label}: a farther roof facet paints over its nearer surface`);
      samples++;
    }
  }
  return samples;
}
function state(scene, pose) {
  const s = Object.assign(createRun(4182, scene), { mode: "running", time: 120, distance: 980, speed: 66 });
  if (pose.startsWith("approach")) {
    const direction = pose.endsWith("left") ? -1 : 1;
    Object.assign(s, { fork: { at: 1000 }, lane: direction, x: direction * 1.65 });
  } else if (pose !== "straight") {
    const direction = pose.startsWith("left") ? -1 : 1;
    Object.assign(s, { lastForkAt: 970, turnDirection: direction, turnEntryX: direction * 1.65, turnRemaining: TURN_DURATION * (pose.endsWith("late") ? 0.15 : 0.65) });
  }
  return s;
}
function configure(r, s) {
  r.configureCamera(s);
  r.forkDepth = s.fork ? s.fork.at - s.distance : null;
}

test("cottage roofs retain a closed outward-facing solid when captured for scenery", () => {
  for (const winter of [false, true]) for (const variant of [0, 1]) {
    const roof = captured(winter, variant);
    const unique = [...new Map(roof.flatMap((f) => f.points).map((p) => [JSON.stringify(p), p])).values()];
    const interior = center(unique);
    const edges = new Map();
    assert.ok(roof.length >= 5 && roof.length <= 8, "roof must close the rear and underside without excessive facets");
    for (const face of roof) {
      assert.equal(face.cull, true, "cached roof visibility must be decided by the current camera");
      const normal = cross(sub(face.points[1], face.points[0]), sub(face.points[2], face.points[0]));
      assert.ok(dot(normal, sub(center(face.points), interior)) > 0, "roof surface winding points into the building");
      face.points.forEach((a, i) => {
        const b = face.points[(i + 1) % face.points.length];
        const ends = [JSON.stringify(a), JSON.stringify(b)];
        const edge = [...ends].sort().join("|");
        const directions = edges.get(edge) ?? [];
        directions.push(ends.join("|"));
        edges.set(edge, directions);
      });
    }
    for (const directions of edges.values()) {
      assert.equal(directions.length, 2, "a roof edge is open or has an overlapping panel");
      assert.notEqual(directions[0], directions[1], "adjacent roof facets must have consistent outward winding");
    }
  }
});

test("direct cottage roofs paint the nearest surface on either roadside throughout approach and turns", (t) => {
  let samples = 0;
  for (const winter of [false, true]) for (const side of [-1, 1]) for (const z of [-3, 2, 8, 24, 70, 130]) {
    for (const pose of ["straight", "approach-left", "approach-right", "left-mid", "right-mid", "left-late", "right-late"]) {
      const r = renderer(), s = state(winter ? "winter" : "autumn", pose);
      configure(r, s);
      r.cottage(side * 7, z, winter, 1);
      const drawn = r.faces.filter((f) => roofColors(winter).has(f.color)).map((f) => ({ ...f, points: r.faceView(f) }));
      const full = captured(winter, 1).map((f) => ({ ...f, points: f.points.map(([x, y, pz]) => r.cameraPoint([x + side * 7, y, pz + z])) }));
      samples += assertPainter(full, drawn, `${winter ? "winter" : "autumn"}/${side}/${z}/${pose}`);
    }
  }
  assert.ok(samples > 1000);
  t.diagnostic(`${samples} two-sided ray samples match the actual cottage painter order`);
});

test("cached roofs remain complete and render identically regardless of the first camera pose", () => {
  for (const scene of ["autumn", "winter"]) {
    const row = scene === "autumn" ? 73 : 72;
    const a = renderer(), b = renderer();
    configure(a, state(scene, "straight"));
    configure(b, state(scene, "left-mid"));
    a.scenery(scene, row, 42);
    b.scenery(scene, row, 42);
    assert.deepEqual(a.sceneryTemplates, b.sceneryTemplates, "first-view culling permanently removes a roof panel from the cache");
    for (const pose of ["straight", "approach-left", "right-mid", "left-late"]) {
      for (const r of [a, b]) {
        configure(r, state(scene, pose));
        r.faces = [];
        r.scenery(scene, row, 18);
      }
      assert.deepEqual(a.faces, b.faces, `${scene}/${pose}: roof appearance depends on when its cache was created`);
      for (const template of a.sceneryTemplates.values()) {
        assert.ok(template.filter((f) => roofColors(scene === "winter").has(f.color) && f.cull).length >= 5);
      }
    }
  }
});

test("scenery rechecks cached roof visibility against each current road and fork camera", (t) => {
  let samples = 0;
  for (const scene of ["autumn", "winter"]) {
    const r = renderer(), row = scene === "autumn" ? 73 : 72;
    configure(r, state(scene, "left-mid"));
    r.scenery(scene, row, 42);
    for (const pose of ["straight", "approach-right", "left-mid", "right-late"]) for (const z of [2, 18, 70]) {
      configure(r, state(scene, pose));
      r.faces = [];
      r.scenery(scene, row, z);
      const drawn = r.faces.filter((f) => roofColors(scene === "winter").has(f.color)).map((f) => ({ ...f, points: r.faceView(f) }));
      for (const side of [-1, 1]) {
        const template = r.sceneryTemplates.get(`${scene}:${row % 6}:${side}`).filter((f) => roofColors(scene === "winter").has(f.color));
        const junction = r.sceneryForkAt;
        const branches = junction !== null && row * 14 - junction > 14 ? [-1, 1] : [side];
        for (const branch of branches) {
          const full = template.map((f) => ({ ...f, points: f.points.map(([x, y, pz]) => junction === null
            ? r.cameraPoint([x, y, pz + z]) : r.sceneryViewPoint(branch, x, y, pz + z)) }));
          const keys = new Set(full.map(key));
          samples += assertPainter(full, drawn.filter((f) => keys.has(key(f))), `${scene}/${side}/${branch}/${z}/${pose}/cached`);
        }
      }
    }
  }
  assert.ok(samples > 1000);
  t.diagnostic(`${samples} cached roof ray samples match nearest-facet visibility after camera changes`);
});

test("cottage body omits its internal horizontal cap underneath the pitched roof", () => {
  for (const winter of [false, true]) for (const variant of [0, 1]) {
    const height = 2.6 + (variant % 2) * 0.6;
    const wallColors = new Set(winter ? ["#a47d6e", "#6f6365", "#caa391"] : ["#c58e73", "#955f58", "#e5b297"]);
    const internalCaps = capturedHouse(winter, variant).filter((f) => wallColors.has(f.color) && f.points.every((p) => Math.abs(p[1] - height) < 1e-9));
    assert.equal(internalCaps.length, 0, "the internal wall cap must not compete with the roof in painter order");
  }
});

test("the complete cottage draw list never paints a wall through a visible roof", (t) => {
  let samples = 0;
  for (const winter of [false, true]) for (const side of [-1, 1]) for (const z of [2, 8, 24, 70]) {
    for (const pose of ["straight", "approach-left", "approach-right", "left-mid", "right-mid"]) {
      const r = renderer(), s = state(winter ? "winter" : "autumn", pose);
      configure(r, s);
      r.cottage(side * 7, z, winter, 1);
      const drawn = r.faces.map((f) => ({ ...f, points: r.faceView(f) }));
      const full = capturedHouse(winter, 1).map((f) => ({ ...f, points: f.points.map(([x, y, pz]) => r.cameraPoint([x + side * 7, y, pz + z])) }));
      const roof = full.filter((f) => roofColors(winter).has(f.color));
      samples += assertPainter(full, drawn, `${winter ? "winter" : "autumn"}/${side}/${z}/${pose}/full-house`, roof, true);
    }
  }
  assert.ok(samples > 1000);
  t.diagnostic(`${samples} roof rays check occlusion against the full cottage, including wall and chimney faces`);
});

test("the frozen 2500m transport scene keeps roof ownership stable before its midpoint", (t) => {
  let samples = 0;
  for (const scene of ["autumn", "winter"]) {
  const winter = scene === "winter", r = renderer();
  const s = Object.assign(createRun(4182, scene), {
    mode: "running", time: 200, distance: 2500, speed: 27, lane: 0,
    nextRow: 1e9, nextRelicAt: 1e9, nextForkAt: 1e9, nextRailAt: 1e9, nextPortalAt: 1e9,
    sceneTransition: 1.9, sceneTransitionFrom: scene, pendingScene: winter ? "spring" : "winter",
  });
  // Reproduce both a remaining lateral offset and near-zero settling values.
  // The transport clock changes its overlay; distance and house geometry stay fixed.
  for (const x of [0.08, 0.02, 0.000001, 0]) {
    s.x = x;
    let firstRoofFrame = null;
    for (const remaining of [1.9, 1.6, 1.1]) {
      s.sceneTransition = remaining;
      r.render(s, 999 - remaining);
      const roofs = r.faces.filter((f) => roofColors(winter).has(f.color)).map((f) => ({ points: r.faceView(f), color: f.color, z: f.z }));
      if (firstRoofFrame) assert.deepEqual(roofs, firstRoofFrame, "stationary transport redraw changes roof geometry or painter order");
      else firstRoofFrame = roofs;
      for (const side of [-1, 1]) {
        // Autumn row 179 is at 2506m (+2m within its template); winter
        // row 180 is at 2520m (+3m). Both are genuine houses in this frame.
        const full = capturedHouse(winter, winter ? 0 : 1).map((f) => ({ ...f, points: f.points.map(([px, y, pz]) => r.cameraPoint([px + side * (winter ? 6.7 : 7), y, pz + (winter ? 23 : 8)])) }));
        const keys = new Set(full.map(key));
        const drawn = r.faces.map((f) => ({ ...f, points: r.faceView(f) })).filter((f) => keys.has(key(f)));
        const roof = full.filter((f) => roofColors(winter).has(f.color));
        samples += assertPainter(full, drawn, `${scene}/2500m/${x}/${remaining}/${side}`, roof, true);
      }
    }
  }
  }
  assert.ok(samples > 200);
  t.diagnostic(`${samples} visible roof samples stay correctly owned across the frozen transport redraws`);
});
