import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import './compile.mjs';
const {
  createRun, update, act, togglePause, finishReview, activateBoost,
  advancePreview, LANE_WIDTH, MONSTER_INTRO_DURATION,
} = await import('./compiled/engine.mjs');
const {
  createProgress, readProgress, bankRunRewards, buyBooster, activateOwnedBooster,
  activatePermanentSkill, PROGRESS_KEY,
} = await import('./compiled/store.mjs');
const { SCENES, isSceneKind, nextScene } = await import('./compiled/scenes.mjs');
const { BOOSTERS } = await import('./compiled/boosts.mjs');
const { getLesson, LESSONS, localized } = await import('./compiled/community.mjs');

function run(scene = 'spring') {
  const s = createRun(4182, scene);
  Object.assign(s, { mode: 'running', time: MONSTER_INTRO_DURATION + 1, nextRow: 1e9 });
  return s;
}
function obstacle(s, kind, ahead = .8) {
  const o = { id: s.nextId++, lane: 0, at: s.distance + ahead, kind, resolved: false };
  s.obstacles.push(o);
  return o;
}
function advance(s, seconds, fps = 120) {
  while (seconds > 1e-8) {
    const dt = Math.min(seconds, 1 / fps);
    update(s, dt);
    seconds -= dt;
  }
}
function funded() {
  const p = createProgress();
  p.wallet = 2000;
  p.inventory = { shield: 1, headstart: 1, doubleCoins: 1, portal: 1 };
  p.portalDestination = 'summer';
  p.skills.magnet.unlocked = true;
  p.equippedSkill = 'magnet';
  return p;
}

for (const kind of ['block', 'arch', 'pillar']) {
  test(`${kind}: a fatal post collision opens one review and dismissal cannot revive the run`, () => {
    for (const fps of [30, 60, 144]) {
      const s = run();
      const o = obstacle(s, kind);
      advance(s, .3, fps);
      assert.equal(s.mode, 'over');
      assert.deepEqual(s.review, { id: o.id, kind, shielded: false });
      assert.equal(s.reviewedPosts, 0);
      const frozen = structuredClone(s);
      advance(s, 20, fps);
      togglePause(s);
      assert.equal(act(s, 'jump'), false);
      assert.deepEqual(s, frozen);
      assert.equal(finishReview(s), true);
      assert.equal(s.mode, 'over');
      assert.equal(s.review, null);
      assert.equal(s.reviewedPosts, 1);
      assert.equal(finishReview(s), false);
      assert.equal(s.reviewedPosts, 1);
      const stopped = structuredClone(s);
      update(s, .25);
      assert.deepEqual(s, stopped);
    }
  });
}

test('a first roots post pauses a safe runner and freezes movement, chase and all effects until reviewed', () => {
  const s = run();
  activateBoost(s, 'doubleCoins');
  activateBoost(s, 'magnet');
  s.milestoneRemaining = 3;
  const o = obstacle(s, 'roots');
  update(s, .25);
  assert.equal(s.mode, 'paused');
  assert.equal(s.stumbles, 1);
  assert.equal(s.chase, 6);
  assert.deepEqual(s.review, { id: o.id, kind: 'roots', shielded: false });
  assert.ok(s.distance < 1, 'the rest of a long frame must stop at the post');
  const frozen = structuredClone(s);
  for (let i = 0; i < 20; i++) {
    update(s, .25);
    togglePause(s);
    for (const action of ['jump', 'slide', 'left', 'right']) assert.equal(act(s, action), false);
  }
  assert.deepEqual(s, frozen);
  assert.equal(finishReview(s), true);
  assert.equal(s.mode, 'running');
  assert.equal(s.reviewedPosts, 1);
  assert.equal(s.distance, frozen.distance);
  assert.equal(s.time, frozen.time);
  assert.equal(s.chase, frozen.chase);
  assert.ok(s.boosts.grace >= 1.2);
  advance(s, .3);
  assert.ok(s.distance > frozen.distance);
  assert.ok(s.boosts.doubleCoins < frozen.boosts.doubleCoins);
  assert.equal(s.review, null);
});

test('roots during the opening chase or a later active chase remain fatal after their lesson', () => {
  for (const opening of [false, true]) {
    const s = run();
    if (opening) s.time = 0;
    else s.chase = 4;
    obstacle(s, 'roots');
    advance(s, .2);
    assert.equal(s.mode, 'over');
    assert.equal(s.review.kind, 'roots');
    assert.equal(s.review.shielded, false);
    finishReview(s);
    assert.equal(s.mode, 'over');
    assert.equal(s.reviewedPosts, 1);
  }
});

test('Shield intercepts each kind, opens a shielded review, then grants a safe resumption', () => {
  for (const kind of ['block', 'arch', 'pillar', 'roots']) {
    const s = run();
    activateBoost(s, 'shield', 2);
    const o = obstacle(s, kind);
    obstacle(s, 'pillar', .9);
    advance(s, .25);
    assert.equal(s.mode, 'paused');
    assert.equal(s.shieldAbsorbed, 1);
    assert.equal(s.boosts.shield, 1);
    assert.equal(s.stumbles, 0);
    assert.deepEqual(s.review, { id: o.id, kind, shielded: true });
    const frozen = structuredClone(s);
    advance(s, 15);
    assert.deepEqual(s, frozen);
    finishReview(s);
    advance(s, .3);
    assert.equal(s.mode, 'running');
    assert.equal(s.review, null, 'the overlapping post should be covered by resumption grace');
    assert.equal(s.shieldAbsorbed, 1);
    assert.equal(s.reviewedPosts, 1);
  }
});

test('Rush, Head Start, Portal Travel and grace pass posts without opening reviews or consuming Shield', () => {
  for (const boost of ['rush', 'headstart', 'portal', 'grace']) for (const kind of ['block', 'arch', 'pillar', 'roots']) {
    const s = run();
    s.boosts[boost] = 2;
    activateBoost(s, 'shield');
    obstacle(s, kind);
    advance(s, .2);
    assert.equal(s.mode, 'running', `${boost}, ${kind}`);
    assert.equal(s.review, null);
    assert.equal(s.reviewedPosts, 0);
    assert.equal(s.shieldAbsorbed, 0);
    assert.equal(s.boosts.shield, 1);
  }
});

test('successful jumps, slides and lane changes never interrupt the run for a lesson', () => {
  for (const [kind, action] of [['block', 'jump'], ['roots', 'jump'], ['arch', 'slide'], ['pillar', 'right']]) {
    const s = run();
    obstacle(s, kind, 3.6);
    act(s, action);
    advance(s, .5);
    assert.equal(s.mode, 'running', kind);
    assert.equal(s.review, null);
    assert.equal(s.reviewedPosts, 0);
  }
});

test('a review cannot be bypassed by pause, store activation or permanent skill activation', () => {
  const s = run();
  const p = funded();
  s.permanentSkill = 'magnet';
  s.skillCharge = 100;
  obstacle(s, 'roots');
  advance(s, .2);
  const before = structuredClone({ s, p });
  togglePause(s);
  assert.equal(activateBoost(s, 'shield'), false);
  assert.equal(activateOwnedBooster(s, p, 'shield').ok, false);
  assert.equal(activatePermanentSkill(s, p, 'magnet').ok, false);
  assert.deepEqual({ s, p }, before);
});

test('coin, score, wallet, inventory and skill charge survive fatal and nonfatal reviews without double credit', () => {
  for (const kind of ['roots', 'pillar']) {
    const s = run();
    let p = funded();
    s.permanentSkill = 'magnet';
    s.skillCharge = 8;
    activateBoost(s, 'doubleCoins');
    s.pickups = [{ id: s.nextId++, lane: 0, at: .8, height: 1, taken: false }];
    obstacle(s, kind);
    update(s, .25);
    assert.ok(s.review);
    assert.equal(s.coins, 2);
    assert.equal(s.score, Math.floor(s.distance * 10) + 100);
    const inventory = structuredClone(p.inventory);
    p = bankRunRewards(s, p);
    assert.equal(p.wallet, 2002);
    assert.equal(s.skillCharge, 10);
    const beforeDismiss = { distance: s.distance, time: s.time, coins: s.coins, score: s.score, skillCharge: s.skillCharge };
    finishReview(s);
    for (const [key, value] of Object.entries(beforeDismiss)) assert.equal(s[key], value, key);
    assert.equal(bankRunRewards(s, p), p);
    assert.deepEqual(p.inventory, inventory);
    assert.deepEqual(readProgress(JSON.stringify(p)), p);
  }
});

test('active permanent effects still block coin recharge across a shielded lesson and resume', () => {
  const s = run();
  let p = funded();
  s.permanentSkill = 'magnet';
  s.skillCharge = 100;
  p = activatePermanentSkill(s, p, 'magnet').progress;
  activateBoost(s, 'shield');
  s.pickups = [{ id: s.nextId++, lane: 0, at: .8, height: 1, taken: false }];
  obstacle(s, 'pillar');
  update(s, .25);
  p = bankRunRewards(s, p);
  assert.equal(p.wallet, 2001);
  assert.equal(s.skillCharge, 0);
  assert.equal(s.review.shielded, true);
  const magnetTime = s.boosts.magnet;
  advance(s, 30);
  assert.equal(s.boosts.magnet, magnetTime);
  finishReview(s);
  assert.equal(s.skillCharge, 0);
  assert.equal(bankRunRewards(s, p), p);
});

test('preview dismisses nonfatal reviews and restarts fatal reviews without getting stuck', () => {
  for (const kind of ['roots', 'pillar']) {
    const s = run();
    obstacle(s, kind);
    update(s, .25);
    assert.ok(s.review);
    let priorDistance = s.distance;
    let moved = false;
    for (let i = 0; i < 180; i++) {
      advancePreview(s, 1 / 60);
      if (s.distance > priorDistance + 1) moved = true;
    }
    assert.equal(s.mode, 'running');
    assert.equal(s.review, null);
    assert.ok(moved);
    assert.ok(s.time > 1);
  }
});

test('autoplay stays in its starting season across portal intervals and after restarting', () => {
  for (const { id } of SCENES) {
    const s = run(id);
    for (const distance of [2499, 4999, 7499]) {
      s.distance = distance;
      s.nextPortalAt = distance + 1;
      s.lane = s.portalLane;
      s.x = s.portalLane * LANE_WIDTH;
      for (let i = 0; i < 180; i++) advancePreview(s, 1 / 60);
      assert.equal(s.scene, id);
      assert.equal(s.sceneTransition, 0);
      assert.equal(s.pendingScene, null);
      assert.equal(s.nextPortalAt, Infinity);
      assert.ok(s.distance > distance + 1);
    }
    s.mode = 'over';
    advancePreview(s, 1 / 60);
    assert.equal(s.scene, id);
    assert.equal(s.nextPortalAt, Infinity);
  }
});

test('four seasons validate, cycle in order and each actual portal travels to the next season', () => {
  const ids = SCENES.map(scene => scene.id);
  assert.deepEqual(ids, ['spring', 'summer', 'autumn', 'winter']);
  assert.equal(createRun().scene, 'spring');
  for (const invalid of [null, undefined, '', 'forest', 'desert', 'frost', {}, 0]) assert.equal(isSceneKind(invalid), false);
  for (const [index, scene] of ids.entries()) {
    assert.equal(isSceneKind(scene), true);
    assert.equal(nextScene(scene), ids[(index + 1) % ids.length]);
    const s = run(scene);
    s.distance = s.nextPortalAt - 1;
    s.lane = s.portalLane;
    s.x = s.portalLane * LANE_WIDTH;
    update(s, .1);
    assert.ok(s.sceneTransition > 0);
    advance(s, 2.1);
    assert.equal(s.scene, ids[(index + 1) % ids.length]);
    assert.equal(s.pendingScene, null);
    assert.equal(s.sceneTransition, 0);
    assert.ok([-1, 0, 1].includes(s.portalLane));
    assert.equal(s.review, null);
  }
});

test('seasonal portal purchase and saved economy keep all valid destinations and reject retired scenes', () => {
  assert.equal(PROGRESS_KEY, 'community-seasons-progress-v1');
  assert.deepEqual(BOOSTERS.map(b => [b.id, b.price]), [['headstart', 100], ['shield', 75], ['doubleCoins', 100], ['portal', 1000]]);
  for (const scene of SCENES.map(s => s.id)) {
    for (const destination of SCENES.map(s => s.id).filter(id => id !== scene)) {
      const p = { ...createProgress(), wallet: 1000 };
      const bought = buyBooster(p, 'portal', destination, scene);
      assert.equal(bought.ok, true);
      assert.equal(bought.progress.wallet, 0);
      assert.equal(bought.progress.inventory.portal, 1);
      assert.equal(bought.progress.portalDestination, destination);
      assert.deepEqual(readProgress(JSON.stringify(bought.progress)), bought.progress);
    }
    for (const destination of ['forest', 'desert', 'frost', scene]) assert.equal(buyBooster({ ...createProgress(), wallet: 1000 }, 'portal', destination, scene).ok, false);
  }
});

test('every obstacle lesson resolves deterministically to complete bilingual educational content', () => {
  const seen = new Set();
  for (const kind of ['block', 'arch', 'pillar', 'roots']) for (let id = 1; id <= 24; id++) {
    const lesson = getLesson({ id, kind });
    assert.equal(getLesson({ id, kind }), lesson);
    seen.add(lesson.id);
    for (const key of ['title', 'label', 'example', 'why', 'response', 'rewrite']) {
      assert.ok(localized(lesson[key], 'en').trim());
      assert.ok(localized(lesson[key], 'zh-CN').trim());
    }
  }
  assert.equal(seen.size, LESSONS.length);
});

