import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../../../helpers/compile.mjs';
const engine = await import('../../../helpers/compiled/engine.mjs');

function harness({ initialUi = 0, questions = 4, fault = null, frames = [{ gap: 66 }], initiallyPaused = false, blockingOverlay = null, realForks = false, realRailways = false } = {}) {
  let clock = 0, ui = initialUi, answers = 0, railStartedAt = null, resetAt = 0;
  let currentScenario = null;
  let railwayStage = 'first';
  const lines = [], clicks = [], scenarios = [], hudClicks = [], actions = [], forkPasses = [];
  const run = { mode: initiallyPaused ? 'paused' : 'ready', boosts: { grace: 0 }, rail: null, railReturnRemaining: 0, distance: 0, time: 0, coins: 0 };
  const summary = {
    foreground: { gapMs: { mean: 16.67, p95: 20, max: 66 }, callbackCPUMs: { p95: 9 }, renderCPUMs: { p95: 8 }, engineCPUMs: { p95: .5 }, over50ms: 1 },
    events: [], storage: { writeMs: { p95: .1, max: .2 } },
  };
  // Each real question lasts 9–11s with 1.6s feedback; model 10s questions,
  // then the 2s cart exit and 1.1s return. Nothing completes at a fixed 40s.
  function advanceRail() {
    if (railStartedAt === null) return;
    let elapsed = (clock - railStartedAt) / 1000;
    if (elapsed < 2) return;
    const ride = { phase: 'boarding', index: 0, questions: Array.from({ length: questions }, (_, i) => `q${i}`), correctCount: 0,
      speed: railwayStage === 'max' ? 30 : 20, entryNormalSpeed: railwayStage === 'max' ? 66 : 20, reward: 0, duration: 2 };
    run.rail = ride;
    elapsed -= 4;
    if (elapsed < 0) return;
    if (elapsed < questions * 11.6) {
      ride.index = Math.floor(elapsed / 11.6);
      ride.phase = elapsed % 11.6 < 10 ? 'question' : 'feedback';
      ride.duration = ride.phase === 'question' ? 10 : 1.6;
      if (fault === 'short-reading') ride.duration = 8;
      ride.correctCount = ride.index + (ride.phase === 'feedback' ? 1 : 0);
      if (fault === 'skip-question' && ride.index === 1) ride.index = 2;
    } else {
      elapsed -= questions * 11.6;
      ride.phase = 'complete';
      ride.index = questions - 1;
      ride.correctCount = questions;
      ride.reward = Math.ceil((30 + questions * 5) * (1 + (ride.entryNormalSpeed / 12 - 1) * 0.3));
      if (fault === 'flat-reward') ride.reward = 45;
      if (elapsed < 2) return;
      run.coins = ride.reward;
      run.rail = null;
      run.railReturnRemaining = fault === 'missing-return' ? 0 : Math.max(0, 1.1 - (elapsed - 2));
    }
  }
  const qa = {
    prefix: 'qa-iphone-20260910-', run,
    export() {
      const count = Math.floor((clock - resetAt) / 1000 * 60);
      return { summary: { ...summary, foreground: { ...summary.foreground, frames: count, gapMs: { ...summary.foreground.gapMs, count: Math.max(0, count - 1) } } }, frames, storage: [], cloud: [] };
    },
    pause() { run.mode = run.mode === 'running' ? 'paused' : 'running'; },
    reset() { resetAt = clock; },
    scenario(name, options) {
      currentScenario = name;
      railwayStage = options.stage ?? 'first';
      scenarios.push({ name, options });
      run.mode = 'running'; run.rail = null; run.railReturnRemaining = 0;
      run.distance = name === 'max' || options.stage === 'max' ? 9100 : 1200; run.time = 100; run.coins = 0;
      railStartedAt = name === 'rail' ? clock : null;
      if ((realForks && name === 'fork') || (realRailways && name === 'rail')) {
        const distance = options.stage === 'max' ? 9100 : name === 'fork' ? 390 : 1200;
        Object.assign(run,engine.createRun(4182,options.scene),{
          mode:'running',distance,time:options.stage === 'max' || name === 'rail' ? 100 : 30,
          speed:Math.min(engine.MAX_SPEED,engine.INITIAL_SPEED+distance*.006),
          nextRow:distance+50,nextRelicAt:distance+160,
          nextForkAt:1e9,nextRailAt:1e9,nextPortalAt:1e9,
        });
        engine.generateAhead(run);
        if (name === 'fork') {
          run.lane=options.direction==='left'?-1:1;run.x=run.lane*engine.LANE_WIDTH;
          run.nextForkAt=distance+run.speed*options.seconds;
        } else run.nextRailAt=distance+run.speed*options.seconds;
      }
    },
    action(name) { actions.push(name);return realForks ? engine.act(run,name) : false; },
    answer() {
      answers++;
      if (realRailways && currentScenario === 'rail') {
        const question = engine.currentRailQuestion(run);
        return engine.selectRailLane(run, run.rail.optionOrder.indexOf(question.correctIndex) - 1);
      }
    },
    travel() {},
  };
  const button = (label, next) => ({
    disabled: false, textContent: label, getClientRects: () => [{}],
    click() { clicks.push(label); ui = next; if (ui === 4) run.mode = 'running'; },
  });
  const controls = [button('Start the journey', 1), button('Next: On the path', 2), button('Got it', 3), button('Begin run', 4)];
  const hudPause = { disabled: false, textContent: '', ariaLabel: 'Pause game', getClientRects: () => [{}], click() { hudClicks.push(run.mode); run.mode = run.mode === 'running' ? 'paused' : 'running'; } };
  const document = {
    visibilityState: 'visible', querySelectorAll(selector) {
      if (selector === blockingOverlay) return [{ disabled: false, getClientRects: () => [{}] }];
      if (selector === '.hud-buttons > button:last-child') return ui === 4 ? [hudPause] : [];
      if (selector === '.cloud-save-dialog') return [];
      if (selector === '.controls-guide-done') return ui === 1 || ui === 2 ? [controls[ui]] : [];
      if (selector === '.run-setup-footer button[type="submit"]') return ui === 3 ? [controls[3]] : [];
      if (selector === 'button.run-button') return ui === 0 ? [controls[0]] : [];
      return [];
    },
  };
  const context = {
    __phoneQA: qa, document, performance: { now: () => clock }, navigator: { userActivation: { hasBeenActive: false } },
    getComputedStyle: () => ({ visibility: 'visible' }), console: { log: value => lines.push(value) },
    setTimeout(callback, ms) { queueMicrotask(() => {
      clock += ms;
      if (run.mode === 'running') {
        if ((realForks && currentScenario === 'fork') || (realRailways && currentScenario === 'rail')) {
          for (let remaining=ms/1000;remaining>1e-8;) {
            const dt=Math.min(1/60,remaining),previous=run.lastForkAt;
            engine.update(run,dt);remaining-=dt;
            if (run.lastForkAt!==previous) forkPasses.push({at:run.lastForkAt,direction:run.turnDirection,blockedDirection:run.lastForkBlockedDirection});
          }
        } else { run.time += ms / 1000; run.distance += ms / 1000 * 20; }
      }
      if (!(realRailways && currentScenario === 'rail')) advanceRail();callback();
    }); },
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(new URL('./public/qa-suite.js', import.meta.url), 'utf8'), context);
  return {
    qa, run, context, lines, clicks, scenarios, hudClicks, actions, forkPasses,
    get clock() { return clock; }, get answers() { return answers; },
    async finish() { for (let i = 0; i < 30000 && qa.suiteStatus.running; i++) await Promise.resolve(); assert.equal(qa.suiteStatus.running, false); },
  };
}

test('suite follows real UI, measures mid/max boosts, and waits for four questions plus return', async () => {
  const h = harness();
  assert.throws(() => h.qa.startSuite(), /Tap the real game/);
  h.context.navigator.userActivation.hasBeenActive = true;
  h.qa.startSuite(); await h.finish();
  assert.equal(h.qa.suiteStatus.outcome, 'complete');
  assert.equal(h.qa.suiteStatus.plannedSeconds, 382);
  assert.equal(h.qa.suiteStatus.completed, 21);
  assert.equal(h.qa.suiteResults.length, 21);
  assert.equal(h.lines.length, 21);
  assert.ok(h.lines.every(line => line.startsWith('PHONEQA ') && line.length < 480));
  assert.deepEqual(h.clicks, ['Start the journey', 'Next: On the path', 'Got it', 'Begin run']);
  assert.ok(h.answers > 100);
  assert.equal(h.run.mode, 'paused'); assert.equal(h.run.boosts.grace, 0);
  assert.ok(h.clock > 350000 && h.clock < 383000);
  const boostPhases = h.qa.suiteResults.map(r => r.phase).filter(p => /^(magnet|rush)-/.test(p));
  assert.deepEqual(Array.from(boostPhases), ['magnet-mid:protected', 'rush-mid:protected', 'magnet-max:protected', 'rush-max:protected']);
  assert.deepEqual(h.scenarios.filter(s => s.name === 'magnet' || s.name === 'rush').map(s => s.options.stage), ['first', 'first', 'max', 'max']);
  const rail = h.qa.suiteResults.find(r => r.phase === 'railway-correct:protected');
  assert.ok(rail.seconds > 53 && rail.seconds < 55);
  assert.equal(rail.checks.questions, 4);
  assert.equal(rail.checks.observedQuestions, 4);
  assert.equal(rail.checks.completed, true);
  assert.equal(rail.checks.returned, true);
  assert.equal(rail.checks.speed, 20);
  assert.deepEqual(Array.from(rail.checks.readingWindows), [10, 10, 10, 10]);
  const maxRail = h.qa.suiteResults.find(r => r.phase === 'railway-max-correct:protected');
  assert.equal(maxRail.checks.speed, 30);
  assert.equal(maxRail.checks.completionReward, 118);
  assert.equal(maxRail.checks.coinDelta, 118);
  assert.ok(h.qa.suiteResults.every(r => r.phase.endsWith(':protected') && r.criticalFrames.length === 1));
});

test('suite can begin at Choose expedition and accepts a three-question ride only after return', async () => {
  const h = harness({ initialUi: 3, questions: 3 });
  h.context.navigator.userActivation.hasBeenActive = true;
  h.qa.startSuite(); await h.finish();
  assert.equal(h.qa.suiteStatus.outcome, 'complete');
  assert.deepEqual(h.clicks, ['Begin run']);
  const rail = h.qa.suiteResults.find(r => r.phase === 'railway-correct:protected');
  assert.ok(rail.seconds > 40 && rail.seconds < 43);
  assert.equal(rail.checks.observedQuestions, 3); assert.equal(rail.checks.returned, true);
});

test('suite times out when railway never renders a return, retaining interrupted diagnostics', async () => {
  const h = harness({ fault: 'missing-return' });
  h.context.navigator.userActivation.hasBeenActive = true;
  h.qa.startSuite(); await h.finish();
  assert.equal(h.qa.suiteStatus.outcome, 'interrupted');
  assert.match(h.qa.suiteStatus.error, /within 65s.*return false/);
  assert.equal(h.qa.suiteStatus.phase, 'railway-correct');
  assert.ok(h.qa.suiteInterrupted);
  assert.ok(!h.qa.suiteResults.some(r => r.phase === 'railway-correct:protected'));
  assert.equal(h.run.mode, 'paused'); assert.equal(h.run.boosts.grace, 0);
});

test('suite rejects a skipped railway question instead of declaring timed-window success', async () => {
  const h = harness({ fault: 'skip-question' });
  h.context.navigator.userActivation.hasBeenActive = true;
  h.qa.startSuite(); await h.finish();
  assert.equal(h.qa.suiteStatus.outcome, 'interrupted');
  assert.match(h.qa.suiteStatus.error, /skipped a question/);
});

test('stall diagnostics retain preceding CPU, next-frame context, and standalone CPU spikes', async () => {
  const frames = Array.from({ length: 14 }, (_, index) => ({ index, gap: 16.67, callbackCPU: 3, renderCPU: 2 }));
  frames[3].callbackCPU = 48;
  frames[4].gap = 66;
  frames[9].renderCPU = 38;
  frames[13].callbackCPU = 40;
  const h = harness({ fault: 'missing-return', frames });
  h.context.navigator.userActivation.hasBeenActive = true;
  h.qa.startSuite(); await h.finish();
  for (const result of [h.qa.suiteResults[0], h.qa.suiteInterrupted]) {
    const indices = Array.from(result.criticalFrames, frame => frame.index);
    assert.ok(indices.includes(2) && indices.includes(3), 'pre-stall work was discarded');
    assert.ok(indices.includes(4) && indices.includes(5), 'gap or following context was discarded');
    assert.ok(indices.includes(9), 'standalone rendering spike was discarded');
    assert.ok(indices.includes(13), 'final CPU spike had no following gap to preserve it');
    assert.ok(!indices.includes(6), 'unrelated frame should not be retained');
  }
});

test('critical frame neighborhoods stay chronological and bounded at 1200 samples', async () => {
  const frames = Array.from({ length: 1500 }, (_, index) => ({ index, gap: 66, callbackCPU: 40, renderCPU: 38 }));
  const h = harness({ frames });
  h.context.navigator.userActivation.hasBeenActive = true;
  h.qa.startSuite(); await h.finish();
  const retained = h.qa.suiteResults[0].criticalFrames;
  assert.equal(retained.length, 1200);
  assert.equal(retained[0].index, 300);
  assert.equal(retained.at(-1).index, 1499);
});

test('extended suite measures minute-long normal/boost phases and five continuous soak minutes', async () => {
  const h = harness();
  h.context.navigator.userActivation.hasBeenActive = true;
  h.qa.startSuite({ extended: true }); await h.finish();
  assert.equal(h.qa.suiteStatus.profile, 'extended');
  assert.equal(h.qa.suiteStatus.plannedSeconds, 1200);
  assert.equal(h.qa.suiteStatus.outcome, 'complete');
  assert.equal(h.qa.suiteResults.length, 26);
  assert.ok(h.qa.suiteResults.slice(0, 10).every(phase => phase.seconds === 60));
  assert.ok(h.qa.suiteResults.filter(phase => phase.phase.startsWith('fork-')).every(phase => phase.seconds === 20));
  assert.ok(h.qa.suiteResults.filter(phase => phase.phase.startsWith('transport-')).every(phase => phase.seconds === 20));
  const soak = h.qa.suiteResults.filter(phase => phase.phase.startsWith('soak-'));
  assert.equal(soak.length, 5);
  assert.equal(soak.reduce((sum, phase) => sum + phase.seconds, 0), 300);
  assert.equal(soak.reduce((sum, phase) => sum + phase.summary.foreground.frames, 0), 18000, 'all five minutes contribute, not only the latest frame buffer');
  for (let index = 1; index < soak.length; index++) {
    assert.equal(soak[index].checks.startDistance, soak[index - 1].checks.endDistance);
    assert.equal(soak[index].checks.startRunTime, soak[index - 1].checks.endRunTime);
  }
  assert.ok(h.qa.suiteAggregate.frames > 60000);
  assert.equal(h.qa.suiteAggregate.phases, 26);
});

test('standalone soak preserves one run across partial final minute and honors parameters', async () => {
  const h = harness({ initialUi: 3 });
  h.context.navigator.userActivation.hasBeenActive = true;
  h.qa.startSoak({ seconds: 125, scene: 'winter', stage: 'max' });
  assert.match(h.qa.startSuite({ extended: true }), /already running/);
  await h.finish();
  assert.equal(h.qa.suiteStatus.profile, 'soak');
  assert.equal(h.qa.suiteStatus.plannedSeconds, 125);
  assert.deepEqual(JSON.parse(JSON.stringify(h.scenarios)), [{ name: 'max', options: { scene: 'winter' } }]);
  assert.deepEqual(Array.from(h.qa.suiteResults, phase => phase.seconds), [60, 60, 5]);
  assert.equal(h.qa.suiteAggregate.seconds, 125);
  assert.equal(h.qa.suiteAggregate.frames, 7500);
  assert.equal(h.run.distance, 11600);
});

test('extended durations can be shortened independently without changing the default profile', async () => {
  const h = harness();
  h.context.navigator.userActivation.hasBeenActive = true;
  h.qa.startSuite({ extended: true, durations: { normal: 30, max: 30, boost: 45, fork: 12, transport: 12 }, soakSeconds: 0 });
  await h.finish();
  assert.equal(h.qa.suiteStatus.plannedSeconds, 596);
  assert.equal(h.qa.suiteResults.length, 21);
  assert.ok(h.qa.suiteResults.filter(phase => /^(magnet|rush)-/.test(phase.phase)).every(phase => phase.seconds === 45));
  assert.throws(() => h.qa.startSoak({ seconds: 0 }), /seconds must/);
  assert.throws(() => h.qa.startSoak({ scene: 'bad' }), /Choose spring/);
  assert.throws(() => h.qa.startSoak({ stage: 'bad' }), /mid or max/);
  assert.throws(() => h.qa.startSuite({ durations: { max: 300 } }), /max must/);
});

test('paused engine with stale active HUD resumes through the real HUD button', async () => {
  const h = harness({ initialUi: 4, initiallyPaused: true });
  h.context.navigator.userActivation.hasBeenActive = true;
  h.qa.startSoak({ seconds: 1 }); await h.finish();
  assert.equal(h.qa.suiteStatus.outcome, 'complete');
  assert.deepEqual(h.clicks, [], 'no Start/Begin or visible resume overlay existed');
  assert.deepEqual(h.hudClicks, ['paused', 'running'], 'real control resumes and pauses again at completion');
  assert.equal(h.run.mode, 'paused');
});

test('QA pause does not close or bypass cloud, setup, guide, store, lesson or rotation dialogs', () => {
  for (const blockingOverlay of ['.cloud-save-dialog', '.run-setup-dialog', '.controls-guide-dialog', '.store-dialog', '.lesson-dialog', '.rotate-device-dialog']) {
    const h = harness({ initialUi: 4, initiallyPaused: true, blockingOverlay });
    h.context.navigator.userActivation.hasBeenActive = true;
    h.qa.pause();
    assert.equal(h.run.mode, 'paused', blockingOverlay);
    assert.deepEqual(h.hudClicks, [], blockingOverlay);
  }
});

test('next test preserves the completed quick results and resumes without engine-only toggles', async () => {
  const h = harness();
  h.context.navigator.userActivation.hasBeenActive = true;
  h.qa.startSuite(); await h.finish();
  const quick = h.qa.suiteResults;
  h.qa.startSoak({ seconds: 1 }); await h.finish();
  assert.equal(h.qa.suiteStatus.outcome, 'complete');
  assert.equal(h.qa.suiteHistory.length, 1);
  assert.equal(h.qa.suiteHistory[0].status.profile, 'quick');
  assert.equal(h.qa.suiteHistory[0].status.outcome, 'complete');
  assert.equal(h.qa.suiteHistory[0].results, quick);
  assert.equal(quick.length, 21);
});

test('continuation preserves the interrupted pass and completes both generated max-speed forks', async () => {
  const h=harness({initialUi:3,realForks:true});
  h.context.navigator.userActivation.hasBeenActive=true;
  const previous=Array.from({length:12},(_,index)=>({phase:`preserved-${index}`}));
  const interrupted={summary:{reason:'second fork center miss'}};
  h.qa.suiteResults=previous;
  h.qa.suiteStatus={running:false,profile:'extended',outcome:'interrupted',phase:'fork-max-left',completed:12};
  h.qa.suiteInterrupted=interrupted;
  h.qa.startContinuation({forkSeconds:25});await h.finish();
  assert.equal(h.qa.suiteStatus.profile,'continuation');
  assert.equal(h.qa.suiteStatus.outcome,'complete');
  assert.equal(h.qa.suiteStatus.plannedSeconds,505);
  assert.equal(h.qa.suiteResults.length,13);
  assert.equal(h.qa.suiteHistory[0].results,previous);
  assert.equal(h.qa.suiteHistory[0].interrupted,interrupted);
  assert.equal(previous.length,12);
  assert.equal(h.forkPasses.length,4);
  assert.deepEqual(h.forkPasses.map(f=>f.at),[9265,10469.888683676687,9265,10469.888683676687]);
  assert.ok(h.forkPasses[1].at>9265+800,'the second scheduled fork is retained');
  assert.deepEqual(h.forkPasses.map(f=>f.direction),h.forkPasses.map((f,i)=>f.blockedDirection?-f.blockedDirection:i<2?-1:1));
  assert.ok(h.forkPasses.every(f=>f.direction!==f.blockedDirection),'each turn takes an open branch');
  assert.ok(h.actions.includes('left')&&h.actions.includes('right'),'the second forks need actual lane input');
  assert.equal(h.qa.suiteResults.filter(r=>r.phase.startsWith('soak-')).length,5);
  assert.equal(h.qa.suiteResults.find(r=>r.phase==='railway-correct:protected').checks.returned,true);
  assert.equal(h.run.mode,'paused');assert.equal(h.run.boosts.grace,0);
});

test('unsteered second fork reproduces physical failure despite collision grace', () => {
  const s=engine.createRun(4182,'winter');
  Object.assign(s,{mode:'running',distance:9100,time:100,speed:66,nextRow:9150,nextRelicAt:9260,nextForkAt:1e9,nextRailAt:1e9,nextPortalAt:1e9});
  engine.generateAhead(s);s.lane=-1;s.x=-engine.LANE_WIDTH;s.nextForkAt=9265;
  for(let i=0;i<25*60&&s.mode==='running';i++) {
    if(i%15===0)s.boosts.grace=Math.max(s.boosts.grace,1);
    if(s.lastForkAt===null&&s.fork) {
      const target=s.fork.blockedDirection===-1?1:-1;
      if(s.lane!==target)engine.act(s,target<s.lane?'left':'right');
    }
    engine.update(s,1/60);
  }
  assert.equal(s.mode,'over');
  assert.equal(s.lastForkAt,9265,'the first open branch was traversed');
  assert.ok(s.fork&&s.fork.at>s.lastForkAt+800,'the failure is at the unsteered second fork');
  assert.match(s.reason,/center route is closed|branch is a dead end/);
  assert.ok(Math.abs(s.x)<engine.LANE_WIDTH*.5,'the runner stayed centered after the first turn');
  assert.ok(Math.abs(s.distance-s.fork.at)<1);
  assert.ok(s.boosts.grace>.8,'collision grace was still active at the failed fork');
});

test('the current engine completes both real railway paces with full reading windows and progression rewards', async () => {
  const h = harness({ realRailways: true });
  h.context.navigator.userActivation.hasBeenActive = true;
  h.qa.startSuite({ durations: { normal: 1, max: 1, boost: 1, fork: 1, transport: 1 } });
  await h.finish();
  assert.equal(h.qa.suiteStatus.outcome, 'complete', h.qa.suiteStatus.error);
  const railways = h.qa.suiteResults.filter(r => r.phase.startsWith('railway-'));
  assert.equal(railways.length, 2);
  assert.ok(railways[0].checks.speed > 19 && railways[0].checks.speed < 20);
  assert.equal(railways[1].checks.speed, 30);
  assert.ok(railways[1].checks.completionReward >= 100);
  for (const { checks, seconds } of railways) {
    assert.ok(checks.questions === 3 || checks.questions === 4);
    assert.equal(checks.readingWindows.length, checks.questions);
    assert.ok(checks.readingWindows.every(value => value >= 9 && value <= 11));
    assert.ok(seconds >= checks.readingWindows.reduce((total, value) => total + value, 0));
    assert.equal(checks.coinDelta, checks.completionReward);
    assert.ok(checks.endDistance > checks.startDistance + checks.speed * 30);
    assert.equal(checks.returned, true);
  }
});

test('railway validation rejects shortened reading windows and the retired flat reward', async () => {
  for (const [fault, message] of [['short-reading', /reading time/], ['flat-reward', /reward/]]) {
    const h = harness({ fault });
    h.context.navigator.userActivation.hasBeenActive = true;
    h.qa.startSuite();
    await h.finish();
    assert.equal(h.qa.suiteStatus.outcome, 'interrupted');
    assert.match(h.qa.suiteStatus.error, message);
    assert.equal(h.qa.suiteStatus.phase, 'railway-correct');
  }
});

test('suite temporarily holds a screen wake lock and releases it on completion', async () => {
  const h = harness();
  let requested = 0, released = 0;
  h.context.navigator.userActivation.hasBeenActive = true;
  h.context.navigator.wakeLock = { async request(type) {
    assert.equal(type, 'screen'); requested++;
    return { async release() { released++; } };
  } };
  h.qa.startSoak({seconds:1}); await h.finish();
  for (let i=0; i<12; i++) await Promise.resolve();
  assert.equal(h.qa.suiteStatus.outcome, 'complete');
  assert.equal(requested, 1); assert.equal(released, 1);
  assert.equal(h.qa.suiteStatus.wakeLock, 'released');
});

test('denied or unsupported wake locks never block a visible test', async () => {
  for (const supported of [true, false]) {
    const h = harness();
    h.context.navigator.userActivation.hasBeenActive = true;
    if (supported) h.context.navigator.wakeLock = { async request() { throw Object.assign(new Error('denied'), {name:'NotAllowedError'}); } };
    h.qa.startSoak({seconds:1}); await h.finish();
    assert.equal(h.qa.suiteStatus.outcome, 'complete');
    assert.equal(h.qa.suiteStatus.wakeLock, supported ? 'unavailable' : 'unsupported');
  }
});

test('a delayed wake-lock grant is released even when the test has already ended', async () => {
  const h = harness();
  let grant, released = 0;
  h.context.navigator.userActivation.hasBeenActive = true;
  h.context.navigator.wakeLock = { request: () => new Promise(resolve => { grant = resolve; }) };
  h.qa.startSoak({seconds:1}); await h.finish();
  grant({ async release() { released++; } });
  for (let i=0; i<12; i++) await Promise.resolve();
  assert.equal(released, 1);
  assert.equal(h.qa.suiteStatus.outcome, 'complete');
  assert.equal(h.qa.suiteStatus.wakeLock, 'released');
});
