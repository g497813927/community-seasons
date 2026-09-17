/* Standalone test script; may also be injected into the isolated QA preview. */
(() => {
  const qa = window.__phoneQA;
  if (!qa || qa.prefix !== 'qa-iphone-20260910-' || typeof qa.export !== 'function') {
    throw new Error('Phone QA suite requires the isolated QA probe/save namespace.');
  }
  if (qa.suiteStatus?.running) return;
  let active = null;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = element => element && element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden' && !element.disabled;
  const find = selector => Array.from(document.querySelectorAll(selector)).find(visible);
  const round = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  function railwaySeconds() {
    const durations = Object.values(qa.railQuestionDurations ?? {});
    if (!durations.length || durations.some(value => !Number.isInteger(value) || value < 12)) {
      throw new Error('Railway question reading budgets are missing or invalid. Rebuild the QA preview.');
    }
    // Four longest reading windows, feedback after each, plus a bounded margin
    // for the station approach, boarding, cart exit, return and host delays.
    return Math.ceil(durations.sort((a, b) => b - a).slice(0, 4).reduce((sum, value) => sum + value, 0) + 4 * 1.6 + 20);
  }
  const pauseBlocked = () => [
    '.cloud-save-dialog', '.store-dialog', '.controls-guide-dialog',
    '.run-setup-dialog', '.lesson-dialog', '.rotate-device-dialog',
  ].some(selector => find(selector));
  // Use the production handler so React HUD, audio and pause bookkeeping stay
  // synchronized. An inspector engine toggle alone leaves stale visible UI.
  qa.pauseWithUI = () => {
    if (navigator.userActivation?.hasBeenActive !== true) throw new Error('Tap the real game once before using QA pause controls.');
    if (!['running', 'paused'].includes(qa.run?.mode) || pauseBlocked()) return qa.snapshot?.() ?? null;
    const button = find('.hud-buttons > button:last-child');
    if (button) button.click();
    return qa.snapshot?.() ?? null;
  };
  qa.pause = qa.pauseWithUI;
  function criticalFrames(frames) {
    const retained = new Set();
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (frame.gap > 50 || frame.callbackCPU > 35 || frame.renderCPU > 35) {
        // The long gap is observed after the work that caused it. Keep that
        // preceding work, plus context; also retain CPU spikes at the phase end.
        for (let j = Math.max(0, i - 2); j <= Math.min(frames.length - 1, i + 1); j++) retained.add(j);
      }
    }
    return frames.filter((_, index) => retained.has(index)).slice(-1200);
  }
  const check = token => {
    if (token.stopped) throw new Error('Suite stopped.');
    if (document.visibilityState !== 'visible') throw new Error('Page became hidden; suite paused to avoid background measurements.');
  };
  function releaseWakeLock(token, sentinel = token.wakeLock) {
    token.wakeLock = null;
    if (!sentinel) return;
    token.status.wakeLock = 'releasing';
    try {
      Promise.resolve(sentinel.release()).then(() => {
        token.status.wakeLock = 'released';
      }, () => { token.status.wakeLock = 'release-error'; });
    } catch { token.status.wakeLock = 'release-error'; }
  }
  async function requestWakeLock(token) {
    if (!navigator.wakeLock?.request) {
      token.status.wakeLock = 'unsupported';
      return;
    }
    token.status.wakeLock = 'requested';
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      if (token.finished || token.stopped) {
        releaseWakeLock(token, sentinel);
        return;
      }
      token.wakeLock = sentinel;
      token.status.wakeLock = 'acquired';
      sentinel.addEventListener?.('release', () => { token.status.wakeLock = 'released'; }, {once:true});
    } catch (error) {
      token.status.wakeLock = 'unavailable';
      token.status.wakeLockReason = String(error?.name ?? 'RequestError').slice(0, 60);
    }
  }
  async function ensureBegin(token) {
    const deadline = performance.now() + 25000;
    while (performance.now() < deadline) {
      check(token);
      if (find('.cloud-save-dialog')) throw new Error('Resolve the QA cloud-save choice manually, then start the suite again.');
      const guide = find('.controls-guide-done');
      const begin = find('.run-setup-footer button[type="submit"]');
      if (guide) guide.click();
      else if (begin) begin.click();
      else if (qa.run?.mode === 'running') return;
      else if (qa.run?.mode === 'paused' && !pauseBlocked()) qa.pauseWithUI();
      else {
        // These are actual production controls, including both guide pages.
        // The translator may append text, so retain substring matching.
        const labels = ['Start the journey','开始共建','Keep running','继续奔跑','Run again','再跑一次','重新奔跑'];
        const button = Array.from(document.querySelectorAll('button.run-button')).find(element =>
          visible(element) && labels.some(label => element.textContent.includes(label)));
        if (button) button.click();
      }
      await wait(250);
    }
    throw new Error('The real Begin run flow did not finish within 25 seconds.');
  }
  function protect() {
    const s = qa.run;
    if (s?.mode !== 'running') return;
    // Protection is for ordinary obstacles only; forks still require an actual
    // lane input. A long max-speed sample can reach a second scheduled fork after
    // the first turn recenters the runner. Do not mistake that missed turn for
    // a performance failure, and do not erase the second event from the course.
    s.boosts.grace = Math.max(s.boosts.grace, 5);
    const gateAt = s.fork?.at ?? s.nextForkAt;
    if (s.rail || s.sceneTransition > 0 || s.railReturnRemaining > 0 || s.turnRemaining > 0) return;
    if (!Number.isFinite(gateAt) || gateAt < s.distance || gateAt - s.distance > Math.max(12, s.speed ?? 12) * 3) return;
    const target = s.fork?.blockedDirection ? -s.fork.blockedDirection : active?.forkDirection ?? (s.x < 0 ? -1 : 1);
    if (s.lane !== target && typeof qa.action === 'function') {
      qa.action(target < s.lane ? 'left' : 'right');
    }
  }
  async function sample(token, seconds, { paused = false } = {}) {
    const until = performance.now() + seconds * 1000;
    while (performance.now() < until) {
      check(token);
      if (!paused && qa.run?.mode !== 'running') throw new Error(`Unexpected game mode: ${qa.run?.mode}.`);
      protect();
      await wait(Math.min(250, Math.max(1, until - performance.now())));
    }
  }
  async function sampleRailway(token, seconds) {
    const until = performance.now() + seconds * 1000;
    const seenQuestions = [];
    let questionCount = null, completed = false, returned = false;
    let speed = null, entryNormalSpeed = null, completionReward = null, startCoins = null, startDistance = null;
    const readingWindows = [], observedReadingSeconds = [];
    let questionTiming = null, previousObservationAt = performance.now();
    while (performance.now() < until) {
      check(token);
      const s = qa.run, ride = s?.rail;
      const observedAt = performance.now();
      if (s?.mode !== 'running') throw new Error(`Unexpected railway game mode: ${s?.mode}.`);
      protect();
      if (questionTiming && (!ride || ride.phase !== 'question' || ride.index !== questionTiming.index)) {
        const elapsed = (observedAt - questionTiming.startedAt) / 1000;
        observedReadingSeconds.push(round(elapsed));
        // The question may start between polls. Include that actual entry gap
        // when bounding its elapsed time; do not trust countdown metadata to
        // prove the full reading window was available. This runner selects a
        // lane only and never requests the player's optional early submission.
        if (elapsed + questionTiming.entryGapSeconds + 1e-8 < questionTiming.duration) {
          throw new Error(`Railway question ${questionTiming.index + 1} ended before its ${questionTiming.duration}s reading budget elapsed.`);
        }
        questionTiming = null;
      }
      if (ride) {
        if (questionCount === null) {
          questionCount = ride.questions.length;
          if (![3, 4].includes(questionCount)) throw new Error('Railway did not schedule 3–4 questions.');
          speed = ride.speed;
          entryNormalSpeed = ride.entryNormalSpeed;
          startCoins = s.coins;
          startDistance = s.distance;
          if (!Number.isFinite(speed) || speed < 12 || speed > 30 ||
              !Number.isFinite(entryNormalSpeed) || Math.abs(speed - Math.min(30, entryNormalSpeed)) > 1e-8) {
            throw new Error('Railway pace does not match capped normal-run progression.');
          }
        }
        if (ride.questions.length !== questionCount) throw new Error('Railway question sequence changed during the ride.');
        if (ride.speed !== speed || ride.entryNormalSpeed !== entryNormalSpeed) throw new Error('Railway pace or reward multiplier drifted during the ride.');
        if (ride.phase === 'falling') throw new Error('The correct-answer railway phase entered a fall.');
        if (ride.phase === 'question') {
          if (!seenQuestions.includes(ride.index) && ride.index !== seenQuestions.length) {
            throw new Error('Railway skipped a question in the observed sequence.');
          }
          const expectedDuration = qa.railQuestionDurations[ride.questions[ride.index]];
          if (!Number.isFinite(expectedDuration) || ride.duration !== expectedDuration) {
            throw new Error('Railway reading time does not match its text-length budget.');
          }
          if (!seenQuestions.includes(ride.index)) {
            seenQuestions.push(ride.index);
            readingWindows.push(ride.duration);
            questionTiming = {index:ride.index,duration:expectedDuration,startedAt:observedAt,
              entryGapSeconds:(observedAt - previousObservationAt) / 1000};
          }
          qa.answer(true);
        }
        if (ride.phase === 'complete') {
          if (seenQuestions.length !== questionCount || ride.correctCount !== questionCount) {
            throw new Error('Railway exit began without all questions answered correctly.');
          }
          completionReward = ride.reward;
          const expectedReward = Math.ceil((30 + questionCount * 5) * (1 + (entryNormalSpeed / 12 - 1) * 0.3));
          if (completionReward !== expectedReward || (entryNormalSpeed >= 66 && completionReward < 100)) {
            throw new Error('Railway completion reward does not match run progression.');
          }
          completed = true;
        }
      }
      if (s.railReturnRemaining > 0) {
        if (!completed) throw new Error('Railway return began before its completion was observed.');
        returned = true;
      }
      if (returned && !ride && s.railReturnRemaining === 0) {
        const coinDelta = s.coins - startCoins;
        if (coinDelta !== completionReward) throw new Error('Railway completion reward was not banked exactly once.');
        return {questions: questionCount, observedQuestions: seenQuestions.length, completed, returned: true,
          speed,entryNormalSpeed,readingWindows,observedReadingSeconds,completionReward,coinDelta,startDistance,endDistance:s.distance};
      }
      previousObservationAt = observedAt;
      await wait(Math.min(250, Math.max(1, until - performance.now())));
    }
    throw new Error(`Railway did not finish all questions and return within ${seconds}s (${seenQuestions.length}/${questionCount ?? '?'} questions; exit ${completed}; return ${returned}).`);
  }
  function report(name, seconds, checks) {
    const data = qa.export(), s = data.summary, f = s.foreground;
    const errors = s.events.filter(event => ['error','unhandledrejection'].includes(event.kind));
    const result = {phase:name,seconds,checks,summary:s,
      criticalFrames:criticalFrames(data.frames),
      errors,storage:data.storage,cloud:data.cloud};
    qa.suiteResults.push(result);
    const line = {phase:name,fps:round(1000 / f.gapMs.mean),gap95:round(f.gapMs.p95),gapMax:round(f.gapMs.max),
      cpu95:round(f.callbackCPUMs.p95),render95:round(f.renderCPUMs.p95),engine95:round(f.engineCPUMs.p95),
      over50:f.over50ms,errors:errors.length,storage95:round(s.storage.writeMs.p95),storageMax:round(s.storage.writeMs.max)};
    console.log('PHONEQA ' + JSON.stringify(line));
    qa.suiteStatus.completed = qa.suiteResults.length;
    const totals = qa.suiteResults.reduce((total, phase) => {
      const foreground = phase.summary.foreground, gaps = foreground.gapMs;
      total.seconds += phase.seconds;
      total.frames += foreground.frames ?? 0;
      total.gapSamples += gaps.count ?? 0;
      total.gapTotalMs += (gaps.mean ?? 0) * (gaps.count ?? 0);
      total.over50ms += foreground.over50ms ?? 0;
      total.gapMaxMs = Math.max(total.gapMaxMs, gaps.max ?? 0);
      return total;
    }, {seconds:0,frames:0,gapSamples:0,gapTotalMs:0,over50ms:0,gapMaxMs:0});
    qa.suiteAggregate = {...totals,phases:qa.suiteResults.length,
      gapMeanMs:totals.gapSamples ? totals.gapTotalMs / totals.gapSamples : null};
  }
  async function phase(token, name, seconds, prepare, options) {
    check(token); await ensureBegin(token); prepare();
    token.forkDirection = name.endsWith('-left') ? -1 : name.endsWith('-right') ? 1 : null;
    protect();
    qa.suiteStatus.phase = name; qa.suiteStatus.phaseStartedAt = new Date().toISOString();
    qa.reset(name + ':protected');
    const began = performance.now();
    const checks = options?.railJourney ? await sampleRailway(token, seconds) : await sample(token, seconds, options);
    report(name + ':protected', (performance.now() - began) / 1000, checks);
  }
  qa.stopSuite = () => {
    if (active) active.stopped = true;
    if (qa.run?.mode === 'running') qa.pause();
    return 'Suite stopping; collected phase results remain in __phoneQA.suiteResults.';
  };
  function launch(profile, plannedSeconds, task) {
    if (active) return 'Phone QA suite is already running or stopping.';
    if (navigator.userActivation?.hasBeenActive !== true) {
      throw new Error('Tap the real game Start/Begin button once before starting the QA suite.');
    }
    const token = {stopped:false}; active = token;
    // Keep the preceding quick pass available when starting an extended pass.
    // Script injection itself never clears existing measurements or history.
    if (qa.suiteResults?.length) {
      qa.suiteHistory = [...(qa.suiteHistory ?? []), {
        status:{...qa.suiteStatus},results:qa.suiteResults,
        aggregate:qa.suiteAggregate,interrupted:qa.suiteInterrupted,
      }].slice(-3);
    }
    qa.suiteResults = [];
    qa.suiteInterrupted = null;
    qa.suiteAggregate = null;
    qa.suiteStatus = {running:true,profile,phase:'real-begin',completed:0,startedAt:new Date().toISOString(),plannedSeconds};
    token.status = qa.suiteStatus;
    // Optional, test-only and temporary. Denial in an embedded Toy frame does
    // not block the suite or change Safari/device settings.
    void requestWakeLock(token);
    (async () => {
      try {
        await ensureBegin(token);
        await task(token);
        qa.suiteStatus.outcome='complete';
      } catch (error) {
        qa.suiteStatus.outcome=token.stopped?'stopped':'interrupted';
        qa.suiteStatus.error=String(error?.message??error).slice(0,200);
        // Preserve the interrupted phase as well; no save values or credentials.
        const data=qa.export();qa.suiteInterrupted={summary:data.summary,criticalFrames:criticalFrames(data.frames)};
        console.log('PHONEQA '+JSON.stringify({phase:qa.suiteStatus.phase,status:qa.suiteStatus.outcome,error:qa.suiteStatus.error}));
      } finally {
        token.finished = true;
        releaseWakeLock(token);
        if (qa.run?.mode === 'running') qa.pause();
        if (qa.run) qa.run.boosts.grace=0;
        qa.suiteStatus.running=false;qa.suiteStatus.finishedAt=new Date().toISOString();
        active=null;
      }
    })();
    return `Phone QA ${profile} started. Up to ${Math.floor(plannedSeconds / 60)}m${plannedSeconds % 60}s plus UI waits. Keep Safari visible; inspect __phoneQA.suiteStatus or call stopSuite().`;
  }
  function secondsOption(value, fallback, name, max = 60, min = 1) {
    const seconds = value ?? fallback;
    if (!Number.isInteger(seconds) || seconds < min || seconds > max) {
      throw new Error(`${name} must be an integer from ${min} to ${max} seconds.`);
    }
    return seconds;
  }
  async function continuousSoak(token, seconds, scene = 'spring', stage = 'mid') {
    await ensureBegin(token);
    qa.scenario(stage === 'max' ? 'max' : 'mid', {scene});
    protect();
    const run = qa.run, count = Math.ceil(seconds / 60);
    for (let index = 0, remaining = seconds; remaining > 0; index++) {
      check(token);
      if (qa.run !== run) throw new Error('The continuous soak run was replaced.');
      const duration = Math.min(60, remaining), name = `soak-${scene}-${stage}-${index + 1}/${count}:protected`;
      qa.suiteStatus.phase = name; qa.suiteStatus.phaseStartedAt = new Date().toISOString();
      // Export every minute before clearing the bounded frame buffer. This
      // changes measurements only: speed, distance, generator and effects continue.
      qa.reset(name);
      const began = performance.now(), startDistance = run.distance, startRunTime = run.time;
      await sample(token, duration);
      if (qa.run !== run) throw new Error('The continuous soak run was replaced.');
      report(name, (performance.now() - began) / 1000, {
        continuous:true,segment:index + 1,segments:count,startDistance,endDistance:run.distance,
        startRunTime,endRunTime:run.time,
      });
      remaining -= duration;
    }
  }
  qa.startSuite = (options = {}) => {
    if (active) return 'Phone QA suite is already running or stopping.';
    const extended = options.extended === true, custom = options.durations ?? {};
    const durations = {
      normal:secondsOption(custom.normal,extended ? 60 : 15,'normal'),
      max:secondsOption(custom.max,extended ? 60 : 20,'max'),
      boost:secondsOption(custom.boost,extended ? 60 : 15,'boost'),
      fork:secondsOption(custom.fork,extended ? 20 : 8,'fork'),
      transport:secondsOption(custom.transport,extended ? 20 : 10,'transport'),
    };
    const soakSeconds = secondsOption(options.soakSeconds,extended ? 300 : 0,'soakSeconds',1800,0);
    const railSeconds = railwaySeconds();
    const plannedSeconds = 2 * durations.normal + 4 * durations.max + 4 * durations.boost +
      4 * durations.fork + 2 * railSeconds + 4 * durations.transport + 10 + soakSeconds;
    return launch(extended ? 'extended' : 'quick',plannedSeconds,async token => {
      for (const name of ['opening','mid']) await phase(token,name,durations.normal,()=>qa.scenario(name,{scene:'spring'}));
      for (const scene of ['spring','summer','autumn','winter']) await phase(token,'max-'+scene,durations.max,()=>qa.scenario('max',{scene}));
      for (const stage of ['mid','max']) for (const kind of ['magnet','rush']) {
        await phase(token,`${kind}-${stage}`,durations.boost,()=>qa.scenario(kind,{scene:'autumn',stage:stage==='max'?'max':'first'}));
      }
      for (const stage of ['first','max']) for (const direction of ['left','right']) {
        await phase(token,`fork-${stage}-${direction}`,durations.fork,()=>qa.scenario('fork',{scene:stage==='first'?'autumn':'winter',stage,direction,seconds:2.5}));
      }
      await phase(token,'railway-correct',railSeconds,()=>qa.scenario('rail',{scene:'summer',seconds:2}),{railJourney:true});
      await phase(token,'railway-max-correct',railSeconds,()=>qa.scenario('rail',{scene:'winter',stage:'max',seconds:2}),{railJourney:true});
      for (const scene of ['spring','summer','autumn','winter']) {
        await phase(token,'transport-'+scene,durations.transport,()=>{qa.scenario('mid',{scene:scene==='spring'?'winter':'spring'});qa.travel(scene);});
      }
      await ensureBegin(token); qa.scenario('mid',{scene:'spring'});protect();
      qa.suiteStatus.phase='pause-resume';qa.reset('pause-resume:protected');
      qa.pause(); await sample(token,5,{paused:true});qa.pause();protect();await sample(token,5);report('pause-resume:protected',10);
      if (soakSeconds) await continuousSoak(token,soakSeconds);
    });
  };
  qa.startSoak = (options = {}) => {
    if (active) return 'Phone QA suite is already running or stopping.';
    const seconds = secondsOption(options.seconds,300,'seconds',1800);
    const scene = options.scene ?? 'spring', stage = options.stage ?? 'mid';
    if (!['spring','summer','autumn','winter'].includes(scene)) throw new Error('Choose spring, summer, autumn or winter for the soak.');
    if (!['mid','max'].includes(stage)) throw new Error('Soak stage must be mid or max.');
    return launch('soak',seconds,token => continuousSoak(token,seconds,scene,stage));
  };
  qa.startContinuation = (options = {}) => {
    if (active) return 'Phone QA suite is already running or stopping.';
    const forkSeconds = secondsOption(options.forkSeconds,20,'forkSeconds');
    const transportSeconds = secondsOption(options.transportSeconds,20,'transportSeconds');
    const soakSeconds = secondsOption(options.soakSeconds,300,'soakSeconds',1800,0);
    const railSeconds = railwaySeconds();
    const plannedSeconds = 2 * forkSeconds + railSeconds + 4 * transportSeconds + 10 + soakSeconds;
    return launch('continuation',plannedSeconds,async token => {
      for (const direction of ['left','right']) {
        await phase(token,`fork-max-${direction}`,forkSeconds,()=>qa.scenario('fork',{scene:'winter',stage:'max',direction,seconds:2.5}));
      }
      await phase(token,'railway-correct',railSeconds,()=>qa.scenario('rail',{scene:'summer',seconds:2}),{railJourney:true});
      for (const scene of ['spring','summer','autumn','winter']) {
        await phase(token,'transport-'+scene,transportSeconds,()=>{qa.scenario('mid',{scene:scene==='spring'?'winter':'spring'});qa.travel(scene);});
      }
      await ensureBegin(token); qa.scenario('mid',{scene:'spring'});protect();
      qa.suiteStatus.phase='pause-resume';qa.reset('pause-resume:protected');
      qa.pause(); await sample(token,5,{paused:true});qa.pause();protect();await sample(token,5);report('pause-resume:protected',10);
      if (soakSeconds) await continuousSoak(token,soakSeconds);
    });
  };
})();
