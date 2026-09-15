import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../helpers/compile.mjs';
const { Renderer } = await import('../helpers/compiled/render.mjs');
const { createRun, act, update, JUMP_DURATION } = await import('../helpers/compiled/engine.mjs');

function draw(s, t = 0) {
  const renderer = new Renderer({ getContext: () => ({}) });
  renderer.runner(s, t);
  return renderer;
}
function run(extra = {}) {
  return Object.assign(createRun(), { mode: 'running', time: 10, nextRow: 1e9 }, extra);
}

test('TV body, feet and aerials remain above the path throughout every slide phase and stride', () => {
  for (let phase = 0; phase <= 80; phase++) for (const x of [-1.65, 0, 1.65]) for (const t of [0, .1, .3]) {
    const renderer = draw(run({ x, slide: phase / 100 }), t);
    const minimum = Math.min(...renderer.faces.flatMap(face => face.points.map(point => point[1])));
    assert.ok(minimum >= .029, `floor penetration at slide=${phase / 100}, x=${x}, t=${t}: ${minimum}`);
    assert.ok(renderer.faces.length <= 34, 'mascot exceeds its lighter geometry budget');
  }
});

test('the forward-running TV shows rear vents rather than a backward-facing expression in every pose', () => {
  for (const slide of [0, .1, .4, .7]) for (const jump of [0, JUMP_DURATION / 2]) {
    const renderer = draw(run({ slide, jump }));
    renderer.faces.sort((a, b) => b.z - a.z);
    const panel = renderer.faces.findIndex(face => face.color === '#60bfd8');
    assert.ok(panel >= 0);
    assert.equal(renderer.faces.filter(face => face.color === '#e7fbff').length, 0, 'forward screen must not show through the case');
    assert.equal(renderer.faces.slice(panel + 1).filter(face => face.color === '#284c60').length, 3, 'rear panel keeps its three vent slots');
    assert.ok(renderer.faces.slice(0, panel).some(face => face.color === '#72d0e7'));
  }
});

test('disruptor TVs face forward with cloak-covered backs and preserve the approach from behind', () => {
  for (const chase of [false, true]) {
    const depths = [];
    for (const age of [.11, .55, 1.1]) {
      const state = run({ time: chase ? 30 : age, chase: chase ? 6 - age : 0 });
      const renderer = new Renderer({ getContext: () => ({}) });
      const bodies = [];
      const box = renderer.box.bind(renderer);
      renderer.box = (...args) => { if (args[3] === 1.04 && args[4] === .88) bodies.push(args); box(...args); };
      renderer.commenters(state, age, 'en');
      assert.equal(bodies.length, 2);
      depths.push(bodies[0][2]);
      if (age === 1.1) {
        assert.equal(renderer.faces.filter(f => f.color === '#5a344e' || f.color === '#f4e3d8').length, 0, 'forward-facing screens cannot show through the cloaks');
        const labels = renderer.faces.filter(f => f.text);
        assert.equal(labels.length, 2);
        assert.ok(labels.every(f => /SPAM|BAIT/.test(f.text.value)));
        assert.ok(labels.every(f => ['#39334f', '#583644'].includes(f.color)), 'labels use the cloak fabric, not a separate sign or screen');
        assert.ok(labels.every(f => f.points.every(p => p[1] < 1.05 && p[1] > .65)), 'warning stays on the cloak-covered back');
        assert.equal(renderer.faces.filter(f => ['#39334f', '#583644'].includes(f.color) &&
          Math.max(...f.points.map(p => p[1])) > 1.39 && Math.min(...f.points.map(p => p[1])) < .25).length, 2,
          'a continuous cloak covers the entire rear of each TV case');
      }
    }
    assert.ok(depths[0] < -8);
    assert.ok(depths[0] < depths[1] && depths[1] < depths[2] && depths[2] < 0);
  }
});

test('interrupting jump with slide updates the TV pose immediately without mutating physics during drawing', () => {
  const s = run();
  act(s, 'jump');
  update(s, .25);
  const jumped = draw(s).faces;
  act(s, 'slide');
  update(s, .12);
  const saved = structuredClone(s);
  const sliding = draw(s).faces;
  assert.deepEqual(s, saved, 'rendering cannot change the run state');
  assert.equal(s.jump, 0);
  assert.ok(Math.max(...sliding.flatMap(f => f.points.map(p => p[1]))) < 1.25);
  assert.ok(Math.max(...jumped.flatMap(f => f.points.map(p => p[1]))) > 3);
  act(s, 'jump');
  assert.equal(s.slide, 0);
  assert.equal(s.jump, JUMP_DURATION);
});

test('generate a contact sheet from actual sorted mascot polygons for visual review', () => {
  const poses = [
    ['Running', run(), .1],
    ['Jumping', run({ jump: JUMP_DURATION / 2 }), 0],
    ['Sliding', run({ slide: .4 }), 0],
    ['Changing lane', run({ x: .55 }), .3],
    ['Disruptor TV', run({ chase: 5 }), 0],
  ];
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1750" height="580" viewBox="0 0 1750 580">';
  for (const [index, [label, state, t]] of poses.entries()) {
    let renderer = draw(state, t);
    if (index === 4) {
      renderer.faces = [];
      renderer.commenters(state, t, 'en');
      renderer.faces = renderer.faces.filter(f => f.points.every(p => p[0] < 0));
      for (const face of renderer.faces) {
        face.points = face.points.map(([x, y, z]) => [x + 1.55, y, z + 2.93]);
        face.z += 2.93;
      }
    }
    renderer.center = 175; renderer.focal = 1000; renderer.horizon = -30;
    renderer.faces.sort((a, b) => a.layer - b.layer || b.z - a.z);
    svg += `<g transform="translate(${index * 350} 0)"><rect width="349" height="580" fill="#d3e5df"/><text x="175" y="36" text-anchor="middle" fill="#284c60" font-size="22" font-family="sans-serif">${label}</text><path d="M60 150 H290 L350 550 H0Z" fill="#b1c5b8"/><path d="M175 150 V550" stroke="#d3e5df" stroke-width="2"/><ellipse cx="${175 + state.x * 100}" cy="514" rx="60" ry="9" fill="#476754" opacity=".2"/>`;
    for (const face of renderer.faces) {
      const points = face.points.map(p => renderer.project(p).join(',')).join(' ');
      svg += `<polygon points="${points}" fill="${face.color}"/>`;
      if (face.text) {
        const projected = face.points.map(p => renderer.project(p));
        const x = projected.reduce((sum, p) => sum + p[0], 0) / projected.length;
        const y = projected.reduce((sum, p) => sum + p[1], 0) / projected.length;
        svg += `<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="15" font-family="sans-serif" fill="${face.text.color}">${face.text.value}</text>`;
      }
    }
    svg += '</g>';
  }
  svg += '</svg>';
  fs.writeFileSync(new URL('./tv-mascot-poses.svg', import.meta.url), svg);
});
