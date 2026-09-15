import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../helpers/compile.mjs';

const { Renderer } = await import('../helpers/compiled/render.mjs');
const { createRun, act, update, EDGE_STUMBLE_DURATION, LANE_WIDTH } = await import('../helpers/compiled/engine.mjs');

function state(direction, extra = {}) {
  return Object.assign(createRun(4182, 'summer'), {
    mode: 'running', time: 30, x: direction * LANE_WIDTH, lane: direction,
    nextRow: 1e9, nextRailAt: 1e9, nextPortalAt: 1e9, nextForkAt: 1e9,
    obstacles: [], pickups: [], relics: [], ...extra,
  });
}
function draw(s, time = 0) {
  const renderer = new Renderer({ getContext: () => ({}) });
  renderer.runner(s, time);
  return renderer;
}
const distance = (a, b) => Math.hypot(...a.map((n, i) => n - b[i]));
const points = (renderer) => renderer.faces.flatMap(face => face.points);

function assertRigidFaces(before, after) {
  assert.ok(after.faces.length >= before.faces.length);
  for (const [i, face] of before.faces.entries()) {
    const next = after.faces[i];
    assert.equal(next.color, face.color);
    for (let a = 0; a < face.points.length; a++) for (let b = a + 1; b < face.points.length; b++) {
      assert.ok(Math.abs(distance(face.points[a], face.points[b]) - distance(next.points[a], next.points[b])) < 1e-10,
        `face ${i} stretches at corners ${a}/${b}`);
    }
  }
  // Vents must remain attached to the casing, not simply stay rectangular.
  const shell = before.faces.findIndex(face => face.color === '#72d0e7');
  const panel = before.faces.findIndex(face => face.color === '#60bfd8');
  assert.ok(Math.abs(distance(before.faces[shell].points[0], before.faces[panel].points[0]) -
    distance(after.faces[shell].points[0], after.faces[panel].points[0])) < 1e-10);
}

test('edge recoil preserves every TV face and attached rear panel throughout both impacts', () => {
  for (const direction of [-1, 1]) for (const t of [0, .1, .3]) {
    const normal = draw(state(direction), t);
    for (let step = 0; step <= 65; step++) {
      const recoil = draw(state(direction, {
        edgeStumble: EDGE_STUMBLE_DURATION * (1 - step / 65), edgeStumbleDirection: direction,
      }), t);
      assertRigidFaces(normal, recoil);
      assert.ok(points(recoil).every(p => p.every(Number.isFinite)));
      assert.ok(Math.min(...points(recoil).map(p => p[1])) >= .029999);
      const mascot = recoil.faces.filter(face => face.color !== '#ffdf95').flatMap(face => face.points);
      assert.ok(Math.max(...mascot.map(p => Math.abs(p[0]))) < 2.48, 'TV moves beyond the road edge');
    }
  }
});

test('ordinary lane steering also preserves rigid shared box corners', () => {
  for (const direction of [-1, 1]) for (const x of [0, .5, 1.2]) {
    const s = state(direction, { x: direction * x });
    const still = draw({ ...s, lane: s.x / LANE_WIDTH });
    assertRigidFaces(still, draw(s));
    assertRigidFaces(still, draw({ ...s, edgeStumble: .4, edgeStumbleDirection: direction }));
  }
});

test('recoil braces inward and finishes at the exact running pose without a pop', () => {
  for (const direction of [-1, 1]) {
    const normal = draw(state(direction));
    const recoil = draw(state(direction, { edgeStumble: .4, edgeStumbleDirection: direction }));
    const back = recoil.faces.find(face => face.color === '#60bfd8').points;
    assert.ok(back.reduce((sum, p) => sum + p[0], 0) / back.length * direction < LANE_WIDTH - .12);
    const settling = draw(state(direction, { edgeStumble: 1e-8, edgeStumbleDirection: direction }));
    const settled = draw(state(direction, { edgeStumble: 0, edgeStumbleDirection: direction }));
    assert.deepEqual(settled.faces, normal.faces);
    for (let i = 0; i < normal.faces.length; i++) for (let p = 0; p < normal.faces[i].points.length; p++) {
      assert.ok(distance(normal.faces[i].points[p], settling.faces[i].points[p]) < 1e-6);
    }
  }
});

test('visual recoil does not alter the half-second protection or punish a repeated margin input', () => {
  for (const direction of [-1, 1]) {
    const s = state(direction), action = direction < 0 ? 'left' : 'right';
    act(s, action);
    assert.equal(s.boosts.grace, .5);
    assert.equal(s.edgeStumble, EDGE_STUMBLE_DURATION);
    update(s, .1);
    const saved = structuredClone(s);
    draw(s);
    assert.deepEqual(s, saved, 'renderer mutates gameplay');
    act(s, action);
    assert.equal(s.mode, 'running');
    assert.equal(s.stumbles, 1);
    assert.equal(s.boosts.grace, saved.boosts.grace);
    assert.equal(s.edgeStumble, saved.edgeStumble);
  }
});

test('export both intact recoil animations as a pose contact sheet', () => {
  const moments = [['Contact', .04], ['Brace', .2], ['Recover', .46], ['Running', .65]];
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="960" viewBox="0 0 1400 960">';
  for (const [row, direction] of [-1, 1].entries()) for (const [column, [label, elapsed]] of moments.entries()) {
    const r = draw(state(direction, { edgeStumble: Math.max(0, EDGE_STUMBLE_DURATION - elapsed), edgeStumbleDirection: direction }));
    r.center = 175; r.horizon = -15; r.focal = 780; r.cameraShift = direction * LANE_WIDTH;
    svg += `<svg x="${column * 350}" y="${row * 480}" width="350" height="480"><rect width="350" height="480" fill="#83bdc2"/>`;
    const road = [[-2.48, 0, -4], [2.48, 0, -4], [2.48, 0, 18], [-2.48, 0, 18]];
    svg += `<polygon points="${road.map(p => r.project(p).join(',')).join(' ')}" fill="#cec095"/>`;
    for (const lane of [-.825, .825]) svg += `<path d="M${r.project([lane, 0, -4]).join(' ')} L${r.project([lane, 0, 18]).join(' ')}" stroke="#a39470" stroke-width="2"/>`;
    r.faces.sort((a, b) => a.layer - b.layer || b.z - a.z);
    for (const face of r.faces) svg += `<polygon points="${face.points.map(p => r.project(p).join(',')).join(' ')}" fill="${face.color}"/>`;
    svg += `<rect width="350" height="50" fill="#14393a"/><text x="175" y="31" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#f4dda6">${direction < 0 ? 'Left' : 'Right'} edge · ${label}</text></svg>`;
  }
  fs.writeFileSync(new URL('./edge-recoil-poses.svg', import.meta.url), svg + '</svg>');
});
