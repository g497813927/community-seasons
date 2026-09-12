import test from 'node:test';
import assert from 'node:assert/strict';
import './compile.mjs';
const { Renderer } = await import('./compiled/render.mjs');
const { createRun, LANE_WIDTH, TURN_DURATION } = await import('./compiled/engine.mjs');
const noop = () => {};
globalThis.window = { devicePixelRatio: 1 };
function canvas() {
  const fills = [];
  let points = [];
  const context = new Proxy({
    beginPath() { points = []; },
    moveTo(x, y) { points.push([x, y]); },
    lineTo(x, y) { points.push([x, y]); },
    fill() { fills.push({ color: this.fillStyle, points: [...points] }); },
  }, {
    get: (target, key) => key === 'createLinearGradient' || key === 'createRadialGradient'
      ? () => ({ addColorStop: noop }) : target[key] ?? noop,
    set: (target, key, value) => (target[key] = value, true),
  });
  return { getContext: () => context, getBoundingClientRect: () => ({ width: 390, height: 760 }), ownerDocument: { createElement: canvas }, fills };
}
function renderer() { const r = new Renderer(canvas()); r.resize(); return r; }
function state(extra = {}) {
  return Object.assign(createRun(4182, 'summer'), {
    mode: 'running', time: 120, distance: 140, speed: 14,
    nextForkAt: Infinity, nextRailAt: Infinity, nextPortalAt: Infinity,
    obstacles: [], pickups: [], relics: [], ...extra,
  });
}
const near = (a, b) => Math.abs(a - b) < 1e-8;
const isPadTop = (f) => f.boardwalk && f.points.every((p) => near(p[1], -.02));
test('every summer lamp stands on a wooden pad joined to the road and outer rail deck', () => {
  const r = renderer();
  for (let row = 0; row < 6; row++) r.scenery('summer', row, row * 14);
  for (let variant = 0; variant < 6; variant++) for (const side of [-1, 1]) {
    const template = r.sceneryTemplates.get(`summer:${variant}:${side}`);
    const top = template.find(isPadTop);
    assert.ok(top, `missing lamp platform for variant ${variant} / side ${side}`);
    const xs = top.points.map(p => p[0] * side);
    const zs = top.points.map(p => p[2]);
    assert.ok(Math.min(...xs) <= LANE_WIDTH + .72, 'pad leaves a water gap beside the outer rail deck');
    assert.ok(Math.min(...xs) > LANE_WIDTH + .49, 'pad covers the rail running surface or missing-track gap');
    assert.ok(Math.min(...xs) < LANE_WIDTH * 1.5, 'pad is detached from normal road');
    assert.ok(Math.min(...xs) < 3.12 && Math.max(...xs) > 3.12 && Math.min(...zs) < 1 && Math.max(...zs) > 1, 'lamp foot has no deck beneath it');
    assert.ok(top.layer < 0, 'pad could paint over the road or railway');
    assert.ok(template.some(f => f.boardwalk && f.points.some(p => p[1] < -.8)), 'deck has no wooden pilings');
  }
});
test('summer pad inner edges follow narrow branches before and after left/right turns', () => {
  for (const direction of [-1, 1]) for (const crossing of [false, true]) {
    const r = renderer(), s = state({ distance: 0, fork: { at: 0 }, lane: direction, x: direction * LANE_WIDTH });
    r.configureCamera(s); r.forkDepth = 0;
    if (crossing) {
      Object.assign(s, { fork: null, lastForkAt: 0, turnDirection: direction, turnEntryX: s.x, turnRemaining: TURN_DURATION, x: 0, lane: 0 });
      r.configureCamera(s); r.forkDepth = null;
    }
    r.sceneryForkAt = 0;
    for (const z of [0, 5, 12, 20, 35]) {
      r.faces = []; r.scenery('summer', 6, z);
      const topPoints = r.faces.filter(isPadTop).flatMap(f => f.points);
      for (const side of [-1, 1]) for (const depth of [z - .1, z + 2.1]) {
        const expected = r.roadPoint(direction, side * 2.32, -.02, depth);
        assert.ok(topPoints.some(p => p.every((n, i) => near(n, expected[i]))), `platform separates from the curved deck: direction=${direction} crossing=${crossing} z=${z}`);
      }
    }
  }
});
test('summer supports stay cached and bounded in a run and railway ride', () => {
  const r = renderer(), s = state();
  r.render(s, 0);
  assert.ok(r.faces.length < 1300, `summer face count ${r.faces.length}`);
  const templates = [...r.sceneryTemplates.values()];
  assert.equal(templates.length, 12);
  for (let frame = 0; frame < 12; frame++) { s.distance += .7; r.render(s, 0); }
  assert.deepEqual([...r.sceneryTemplates.values()], templates);
  s.rail = { phase: 'question', questions: ['respectful-disagreement'], index: 0, remaining: 5, duration: 10, elapsed: 3, optionOrder: [0, 1, 2], answerLane: null, correct: null, correctCount: 0, failure: null, reward: 0 };
  r.render(s, 0);
  assert.ok(r.faces.some(isPadTop), 'railway loses its summer lamp supports');
  assert.equal(r.sceneryTemplates.size, 12);
});
test('actual cached destination previews include wooden summer supports', () => {
  const r = renderer();
  for (const mode of ['run', 'rail']) {
    const preview = r.journeyPreview('summer', mode);
    assert.ok(preview, `missing ${mode} preview`);
    assert.ok(preview.fills.some(f => f.color === '#b69b71' && f.points.length === 4), 'preview omits the boardwalk timber');
    assert.equal(r.journeyPreview('summer', mode), preview, 'preview should reuse its canvas');
  }
});
