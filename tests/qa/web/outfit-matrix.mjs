import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { fileHashes, changedFiles } from '../preview/build-info.mjs';
import { validateBuildInfo } from '../preview/provenance.mjs';
import { matrixSourceHashes } from '../outfit-matrix/build-info.mjs';
import { fixtureHandler } from './runtime.mjs';
import { reportPath } from './report-path.mjs';
import { assertCompletedRailReward } from './rail-reward.mjs';
import { MATRIX_BROWSER_LAUNCH_OPTIONS, assertFixtureHealthy, bounded, caseFailureStatus, closeMatrixResources } from './matrix-shutdown.mjs';

// Real wall-clock rendering soak, deliberately without Playwright clock APIs.
// The authored renderer stages and actual App interaction checks are reported
// separately; this desktop matrix establishes no physical-phone performance.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DIST = path.join(ROOT, 'tests/qa/outfit-matrix/dist');
const PREFIX = '/qa/outfit-matrix/';
const FIXTURE_ID = 'community-seasons-outfit-matrix-v1';
const FORMAT = 1;
const VIEWPORT = { width: 1280, height: 900 };
const POLICY = { averageFps: 15, windowFps: 8, maximumFrameGapMs: 1000, pollMs: 5000 };
const ENGINES = { chromium, webkit };
const SKINS = ['classic', 'blossom', 'ocean', 'amber', 'frost'];
const SCENES = ['spring', 'summer', 'autumn', 'winter'];
const HATS = [null, 'cap', 'crown', 'sprout'];
const SHOES = [null, 'sneakers', 'boots', 'skates'];
const EFFECTS = [null, 'sparkles', 'petals', 'orbit'];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { help: true };
  const options = { engine: 'all', workers: 2, duration: 60, limit: null, resume: null, explicit: [] };
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1];
    if (!['--engine', '--workers', '--duration', '--limit', '--resume'].includes(flag) ||
        value === undefined || value.startsWith('--') || options.explicit.includes(flag))
      throw Error('Use each documented --option VALUE once. Run with --help for usage.');
    options.explicit.push(flag);
    const key = flag.slice(2);
    options[key] = ['workers', 'duration', 'limit'].includes(key) ? Number(value) : value;
  }
  if (!['all', 'chromium', 'webkit'].includes(options.engine)) throw Error('--engine must be chromium, webkit or all.');
  if (!Number.isInteger(options.workers) || options.workers < 1 || options.workers > 32) throw Error('--workers must be an integer from 1 to 32.');
  if (!Number.isInteger(options.duration) || options.duration < 60 || options.duration > 3600) throw Error('--duration must be an integer from 60 to 3600 REAL seconds per renderer case.');
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) throw Error('--limit must be a positive integer; it creates an explicitly partial invocation.');
  return options;
}

function definitions() {
  const cases = [];
  for (const skin of SKINS) for (const hat of HATS) for (const shoes of SHOES) for (const effect of EFFECTS) {
    for (const scene of SCENES) {
      const id = [skin, hat ?? 'none', shoes ?? 'none', effect ?? 'none', scene].join('_');
      cases.push({ id, skin, outfit: { hat, shoes, effect }, scene });
    }
  }
  assert.equal(cases.length, 1280);
  return cases;
}

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const errorDetails = error => ({ name: error.name, message: error.message, stack: error.stack });
const finite = value => typeof value === 'number' && Number.isFinite(value);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage: node tests/qa/web/outfit-matrix.mjs [--engine chromium|webkit|all]
  [--workers 1..32] [--duration REAL_SECONDS>=60] [--limit PILOT_CASE_COUNT]
  [--resume RESULTS_DIRECTORY]

Build tests/qa/outfit-matrix/ first using its Vite config. The default full
matrix has 320 outfits x 4 seasons x 2 desktop engines = 2,560 cases.
Each renderer case runs at least 60 REAL seconds, followed by actual App
transition/rail UI scenarios. No browser time acceleration is used.

Default workers: 2. Pilot with an explicit --limit before raising concurrency.
--limit always labels that invocation partial. Resume validates all source,
fixture-build and harness hashes and reruns failed/interrupted cases while
retaining passed cases and every attempt. Worker count may change on resume.
Ctrl-C stops scheduling, checkpoints active attempts, and closes contexts.
Evidence stays under results/qa/outfit-matrix-TIMESTAMP/. Only a dedicated
localhost fixture is served; every case has a fresh isolated browser context
and all non-fixture requests are blocked. No Toy saves or devices are used.`);
    return;
  }

  const build = validateBuildInfo(JSON.parse(await fs.readFile(path.join(DIST, 'qa-build-info.json'), 'utf8')));
  const currentHashes = () => matrixSourceHashes(ROOT);
  assert.deepEqual(changedFiles(build.sourceHashes, await currentHashes()), [], 'Matrix fixture build is stale; rebuild after finishing source edits.');
  const harnessHashes = await fileHashes(ROOT, [
    'tests/qa/web/outfit-matrix.mjs', 'tests/qa/web/runtime.mjs', 'tests/qa/web/report-path.mjs',
    'tests/qa/web/rail-reward.mjs', 'tests/qa/web/matrix-shutdown.mjs',
    'tests/qa/preview/build-info.mjs', 'tests/qa/preview/provenance.mjs',
  ].map(file => path.join(ROOT, file)));
  const fixtureBuildHash = digest(build);
  const baseCases = definitions();
  let output, manifest, checkpoint;
  if (options.resume) {
    output = path.resolve(options.resume);
    manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8'));
    checkpoint = JSON.parse(await fs.readFile(path.join(output, 'checkpoint.json'), 'utf8'));
    assert.equal(manifest.format, FORMAT, 'Unsupported matrix manifest version.');
    assert.equal(checkpoint.format, FORMAT, 'Unsupported matrix checkpoint version.');
    assert.equal(checkpoint.manifestHash, digest(manifest), 'Checkpoint does not match its manifest.');
    assert.equal(manifest.fixtureBuildHash, fixtureBuildHash, 'Resume refused: fixture build changed.');
    assert.deepEqual(manifest.sourceHashes, build.sourceHashes, 'Resume refused: source hashes changed.');
    assert.deepEqual(manifest.harnessHashes, harnessHashes, 'Resume refused: runner/helper hashes changed.');
    assert.deepEqual(manifest.cadencePolicy, POLICY, 'Resume refused: cadence policy changed.');
    if (options.explicit.includes('--duration')) assert.equal(options.duration, manifest.durationSeconds, 'Resume duration must match the original manifest.');
    else options.duration = manifest.durationSeconds;
    if (options.explicit.includes('--engine')) assert.equal(options.engine, manifest.engine, 'Resume engine selection must match the original manifest.');
    else options.engine = manifest.engine;
  } else {
    output = path.join(ROOT, 'results/qa', `outfit-matrix-${new Date().toISOString().replaceAll(':', '-')}`);
    const engineNames = options.engine === 'all' ? Object.keys(ENGINES) : [options.engine];
    const cases = baseCases.flatMap(definition => engineNames.map(engine => ({
      id: `${engine}__${definition.id}`, engine, definition,
    })));
    manifest = {
      format: FORMAT, createdAt: new Date().toISOString(), engine: options.engine,
      durationSeconds: options.duration, engines: engineNames,
      caseCount: cases.length, outfitCount: 320, sceneCount: 4, viewport: VIEWPORT,
      cadencePolicy: POLICY, fixtureBuildHash, sourceHashes: build.sourceHashes,
      harnessHashes, cases,
      timing: 'Native requestAnimationFrame and host monotonic time; no accelerated/controlled browser clock.',
      rendererScope: 'Authored source-engine/renderer stages covering poses, obstacles, turns, rail phases and transitions.',
      functionalScope: 'Actual production App, transition and railway answer handlers through an isolated QA-only fixture.',
      limitations: 'Desktop Chromium/WebKit evidence. No physical-phone, native-input-latency, or comprehensive native-performance claim.',
    };
    checkpoint = { format: FORMAT, manifestHash: digest(manifest), updatedAt: null, cases: {}, invocations: [] };
    await fs.mkdir(path.join(output, 'cases'), { recursive: true });
    await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
  const allowedIds = new Set(manifest.cases.map(item => item.id));
  assert.equal(allowedIds.size, manifest.caseCount, 'Manifest has duplicate case IDs.');
  assert.ok(Object.keys(checkpoint.cases).every(id => allowedIds.has(id)), 'Checkpoint contains unknown case IDs.');
  for (const [id, saved] of Object.entries(checkpoint.cases)) {
    const attempt = saved.attempts?.at(-1);
    if (saved.status === 'running') {
      saved.status = 'interrupted';
      if (attempt) { attempt.status = 'interrupted'; attempt.recoveredAt = new Date().toISOString(); }
    }
    if (saved.status !== 'passed') continue;
    assert.ok(attempt?.report && attempt.reportHash, `Passed checkpoint ${id} has no verifiable report.`);
    const text = await fs.readFile(path.join(output, attempt.report), 'utf8');
    assert.equal(crypto.createHash('sha256').update(text).digest('hex'), attempt.reportHash, `Passed report changed: ${id}`);
    const evidence = JSON.parse(text);
    assert.equal(evidence.id, id);
    assert.equal(evidence.status, 'passed');
    assert.equal(evidence.manifestHash, checkpoint.manifestHash);
    assert.ok(evidence.renderer?.hostElapsedMs >= options.duration * 1000);
    assert.ok(evidence.renderer?.final?.elapsedMs >= options.duration * 1000);
    assert.deepEqual(evidence.functional?.scenarios?.map(row => [row.scenario, row.passed]),
      ['season', 'correct', 'wrong', 'timeout'].map(scenario => [scenario, true]), `Incomplete functional evidence in ${id}`);
    await fs.access(path.join(output, path.dirname(attempt.report), evidence.renderer.screenshot));
  }
  const pending = manifest.cases.filter(item => checkpoint.cases[item.id]?.status !== 'passed');
  // Spread an explicitly partial pilot across bodies, accessories, scenes and
  // engines; taking only the first entries would exercise the bare Classic TV.
  const pilotCount = options.limit ? Math.min(options.limit, pending.length) : pending.length;
  const jobs = options.limit && pilotCount > 1
    ? Array.from({ length: pilotCount }, (_, index) => pending[Math.floor(index * (pending.length - 1) / (pilotCount - 1))])
    : options.limit ? pending.slice(0, pilotCount) : pending;
  const invocation = {
    id: checkpoint.invocations.length + 1, startedAt: new Date().toISOString(),
    workers: options.workers, limit: options.limit, explicitlyPartial: options.limit !== null,
    plannedCases: jobs.map(item => item.id), completedAt: null, stopReason: null, stopSignal: null, stopRequestedAt: null,
  };
  checkpoint.invocations.push(invocation);
  let stopReason = null, active = 0, nextJob = 0, persisted = Promise.resolve(), shuttingDown = false;
  let lastSourceCheck = 0, sourceCheck = null;
  const browsers = new Map();
  const summary = () => {
    const counts = { passed: 0, failed: 0, interrupted: 0, running: 0, pending: 0 };
    const engines = Object.fromEntries(manifest.engines.map(engine => [engine, { passed: 0, failed: 0, interrupted: 0, running: 0, pending: 0 }]));
    for (const item of manifest.cases) {
      const status = checkpoint.cases[item.id]?.status ?? 'pending';
      counts[status]++;
      engines[item.engine][status]++;
    }
    return {
      format: FORMAT, manifestHash: checkpoint.manifestHash, updatedAt: new Date().toISOString(),
      fullMatrixComplete: counts.passed === manifest.caseCount,
      selectedCaseCount: manifest.caseCount, totalPossibleAllEngineCases: 2560,
      durationSecondsPerRendererCase: manifest.durationSeconds, counts, engines,
      thisInvocation: invocation, stopReason,
      activeCases: manifest.cases.filter(item => checkpoint.cases[item.id]?.status === 'running').map(item => ({
        id: item.id, engine: item.engine, ...checkpoint.cases[item.id].attempts.at(-1),
      })),
      evidence: { manifest: 'manifest.json', checkpoint: 'checkpoint.json', cases: 'cases/' },
    };
  };
  function progressHtml(state) {
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    const entries = Object.entries(state.counts);
    return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="10"><title>Outfit matrix progress</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#0f1720;color:#e5edf5;margin:0;padding:32px;max-width:1200px}h1{font-size:26px;margin:0 0 8px}a{color:#b9ddff}small,.meta{color:#adbdca}.cards{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}.card{background:#1e2a37;padding:14px 22px;border-radius:8px;min-width:90px}.card strong{display:block;font-size:28px}.partial{padding:12px;background:#4b3a14;border-left:4px solid #efc255}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(10px,1fr));gap:3px;margin:16px 0}.tile{display:block;height:12px;border-radius:2px;background:#354252}.passed{background:#267357}.failed{background:#ad4242}.interrupted{background:#a77828}.running{background:#348cc3}.legend{display:flex;gap:15px;flex-wrap:wrap}.legend span::before{content:'';display:inline-block;width:10px;height:10px;margin-right:5px;background:var(--color)}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{text-align:left;padding:8px;border-bottom:1px solid #354252}code{font-size:12px;overflow-wrap:anywhere}progress{width:100%;height:18px}ul{padding-left:22px}</style>
<h1>Outfit matrix: ${state.fullMatrixComplete ? 'complete' : 'in progress'}</h1>
<p class="meta">${manifest.outfitCount} outfits × ${manifest.sceneCount} seasons × ${manifest.engines.length} desktop engines. Each renderer case runs at least ${manifest.durationSeconds} real seconds, followed by production App transition and train-answer checks.</p>
${invocation.explicitlyPartial ? `<p class="partial">Explicitly partial invocation: at most ${invocation.limit} pending cases. This is not the completed full matrix.</p>` : ''}
${stopReason ? `<p class="partial">Stopped: ${escape(stopReason)}</p>` : ''}
<div class="cards">${entries.map(([key, value]) => `<div class="card"><strong>${value}</strong>${escape(key)}</div>`).join('')}</div>
<progress value="${state.counts.passed}" max="${manifest.caseCount}"></progress>
<table><thead><tr><th>Engine</th><th>Passed</th><th>Failed</th><th>Interrupted</th><th>Running</th><th>Pending</th></tr></thead><tbody>${Object.entries(state.engines).map(([engine, counts]) => `<tr><th>${escape(engine)}</th>${Object.keys(state.counts).map(key => `<td>${counts[key]}</td>`).join('')}</tr>`).join('')}</tbody></table>
<p>Active cases (${state.activeCases.length})</p><ul>${state.activeCases.map(item => `<li>Worker ${item.worker}: <code>${escape(item.id)}</code> — since ${escape(item.startedAt)}</li>`).join('') || '<li>None</li>'}</ul>
<div class="legend">${[['passed','#267357'],['failed','#ad4242'],['interrupted','#a77828'],['running','#348cc3'],['pending','#354252']].map(([label,color]) => `<span style="--color:${color}">${label}</span>`).join('')}</div>
<div class="grid">${manifest.cases.map(item => {
      const status = checkpoint.cases[item.id]?.status ?? 'pending';
      const attempt = checkpoint.cases[item.id]?.attempts.at(-1);
      return attempt?.status !== 'running' && attempt?.report
        ? `<a class="tile ${status}" title="${escape(item.id)} — ${status}" href="${escape(attempt.report)}" aria-label="${escape(item.id)} — ${status}"></a>`
        : `<span class="tile ${status}" title="${escape(item.id)} — ${status}"></span>`;
    }).join('')}</div>
<p><a href="summary.json">Summary</a> · <a href="manifest.json">Sources and case manifest</a> · <a href="checkpoint.json">Resume checkpoint</a></p>
<p class="meta">Updated ${escape(state.updatedAt)}. Refreshes every 10 seconds. Invocation ${invocation.id}, ${invocation.workers} workers. Build <code>${escape(fixtureBuildHash)}</code>.</p>
<p class="meta">Minimum average cadence ${POLICY.averageFps} fps; observed windows ${POLICY.windowFps} fps; maximum gap ${POLICY.maximumFrameGapMs} ms. Desktop browser evidence only; this page makes no physical-device performance claim.</p></html>`;
  }
  async function persist() {
    checkpoint.updatedAt = new Date().toISOString();
    const checkpointText = JSON.stringify(checkpoint, null, 2) + '\n';
    const state = summary();
    const summaryText = JSON.stringify(state, null, 2) + '\n';
    const html = progressHtml(state);
    persisted = persisted.then(async () => {
      await fs.writeFile(path.join(output, 'checkpoint.json.tmp'), checkpointText);
      await fs.rename(path.join(output, 'checkpoint.json.tmp'), path.join(output, 'checkpoint.json'));
      await fs.writeFile(path.join(output, 'summary.json.tmp'), summaryText);
      await fs.rename(path.join(output, 'summary.json.tmp'), path.join(output, 'summary.json'));
      await fs.writeFile(path.join(output, 'progress.html.tmp'), html);
      await fs.rename(path.join(output, 'progress.html.tmp'), path.join(output, 'progress.html'));
    });
    return persisted;
  }
  async function verifySources(force = false) {
    if (sourceCheck) return sourceCheck;
    if (!force && performance.now() - lastSourceCheck < 5000) return;
    sourceCheck = (async () => {
      const changed = changedFiles(build.sourceHashes, await currentHashes());
      if (changed.length) throw Error(`Source changed during matrix run: ${changed.join(', ')}`);
      lastSourceCheck = performance.now();
    })();
    try { await sourceCheck; } finally { sourceCheck = null; }
  }
  const signal = name => {
    stopReason ||= name;
    invocation.stopReason = stopReason;
    invocation.stopRequestedAt ||= new Date().toISOString();
    if (['SIGINT', 'SIGTERM', 'SIGHUP'].includes(name)) invocation.stopSignal ||= name;
    console.log(`Stopping after checkpoint: ${name}`);
  };
  const onInterrupt = () => signal('SIGINT');
  const onTerminate = () => signal('SIGTERM');
  const onHangup = () => signal('SIGHUP');
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  process.on('SIGHUP', onHangup);
  await persist();

  const server = http.createServer(fixtureHandler(DIST, PREFIX));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const url = origin + PREFIX;
  console.log(JSON.stringify({ output, caseCount: manifest.caseCount, scheduled: jobs.length, explicitlyPartial: invocation.explicitlyPartial, workers: options.workers, minimumRealRendererSeconds: options.duration }));

  async function rendererSnapshot(page, method, args = []) {
    return bounded(page.evaluate(({ method, args, expected, fixtureId }) => {
      const api = window.__communitySeasonsOutfitMatrix;
      if (!api || api.id !== fixtureId || api.cloud !== 'disabled' || api.storage !== 'unused') throw Error('Not the isolated matrix fixture.');
      const actual = api.build?.sourceHashes;
      if (api.build?.version !== 1 || !actual || Object.keys(actual).length !== Object.keys(expected).length ||
          !Object.entries(expected).every(([key, hash]) => actual[key] === hash)) throw Error('Matrix fixture build hash mismatch.');
      if (!['cases', 'requirements', 'start', 'snapshot', 'stop'].includes(method) || typeof api[method] !== 'function') throw Error('Unsupported fixture method.');
      return api[method](...args);
    }, { method, args, expected: build.sourceHashes, fixtureId: FIXTURE_ID }), 15000, `Renderer ${method}`);
  }

  function validateSnapshot(snapshot, definition, { final = false, interruptedBy } = {}) {
    assert.equal(snapshot.caseId, definition.id);
    assert.ok(finite(snapshot.elapsedMs) && snapshot.elapsedMs >= 0, 'Elapsed time must be finite.');
    assert.ok(Number.isInteger(snapshot.frames) && snapshot.frames >= 0, 'Frame count must be finite.');
    assertFixtureHealthy(snapshot, { renderer: true, interruptedBy });
    assert.equal(snapshot.environment.visible, true, 'Renderer tab must remain visible.');
    assert.equal(snapshot.canvas.finite, true, 'Canvas geometry must remain finite.');
    assert.ok(finite(snapshot.canvas.width) && snapshot.canvas.width > 0 && finite(snapshot.canvas.height) && snapshot.canvas.height > 0, 'Canvas dimensions must be finite and positive.');
    assert.ok(finite(snapshot.metrics.maxGapMs) && snapshot.metrics.maxGapMs <= POLICY.maximumFrameGapMs, 'Frame gap exceeded the bounded cadence threshold.');
    if (final) {
      assert.equal(snapshot.status, 'passed');
      assert.ok(snapshot.elapsedMs >= options.duration * 1000, 'Renderer did not run for the requested real duration.');
      assert.ok(snapshot.frames >= snapshot.elapsedMs / 1000 * POLICY.averageFps, `Average cadence below ${POLICY.averageFps} frames/s.`);
      assert.ok(snapshot.canvas.samples >= Math.floor(options.duration * .9), 'Too few finite/nonblank canvas observations.');
      assert.equal(snapshot.canvas.nonBlankSamples, snapshot.canvas.samples, 'A canvas sample was blank.');
    }
  }

  async function runRenderer(page, job, result, caseDirectory) {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__communitySeasonsOutfitMatrix);
    const fixtureCases = await rendererSnapshot(page, 'cases');
    assert.deepEqual(fixtureCases, baseCases, 'Fixture case catalog differs from runner catalog.');
    const requirements = await rendererSnapshot(page, 'requirements');
    const hostStarted = performance.now();
    let snapshot = await rendererSnapshot(page, 'start', [job.definition.id, options.duration * 1000]);
    result.renderer = { requirements, samples: [], timing: 'Native real-time RAF; no clock override.', hostElapsedMs: null };
    let previous = snapshot;
    while (snapshot.status === 'running') {
      if (stopReason) {
        result.renderer.final = await rendererSnapshot(page, 'stop', [stopReason]);
        validateSnapshot(result.renderer.final, job.definition, { interruptedBy: stopReason });
        throw Object.assign(Error(`Interrupted by ${stopReason}`), { interrupted: true });
      }
      await wait(Math.min(POLICY.pollMs, Math.max(500, options.duration * 1000 - snapshot.elapsedMs)));
      if (stopReason) continue;
      await verifySources();
      snapshot = await rendererSnapshot(page, 'snapshot');
      validateSnapshot(snapshot, job.definition);
      const elapsed = snapshot.elapsedMs - previous.elapsedMs;
      if (elapsed >= 3000) {
        const fps = (snapshot.frames - previous.frames) / (elapsed / 1000);
        assert.ok(fps >= POLICY.windowFps, `Observed ${fps.toFixed(2)} frames/s in a ${elapsed.toFixed(0)}ms window; minimum ${POLICY.windowFps}.`);
      }
      result.renderer.samples.push(snapshot);
      previous = snapshot;
      if (performance.now() - hostStarted > options.duration * 1000 + 30000) throw Error('Renderer exceeded its bounded case timeout.');
    }
    result.renderer.hostElapsedMs = performance.now() - hostStarted;
    result.renderer.final = snapshot;
    validateSnapshot(snapshot, job.definition, { final: true });
    assert.ok(result.renderer.hostElapsedMs >= options.duration * 1000, 'Host monotonic clock observed less than the requested real duration.');
    for (const [key, required] of Object.entries(requirements)) {
      if (!Array.isArray(required)) continue;
      const bucket = snapshot.coverage[key];
      assert.ok(bucket && typeof bucket === 'object' && !Array.isArray(bucket), `Missing ${key} coverage counts.`);
      for (const item of required) assert.ok(Number.isInteger(bucket[item]) && bucket[item] > 0, `Missing renderer ${key}: ${item}`);
    }
    await page.screenshot({ path: path.join(caseDirectory, 'renderer.png'), fullPage: true, timeout: 15000 });
    result.renderer.screenshot = 'renderer.png';
  }

  async function runFunctional(page, job, result, caseDirectory) {
    await page.goto(url + 'functional.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__communitySeasonsOutfitFunctional?.ready());
    const invoke = (method, args = []) => bounded(page.evaluate(({ method, args, expected }) => {
      const api = window.__communitySeasonsOutfitFunctional;
      if (!api || api.id !== 'community-seasons-outfit-functional-v1' || api.cloud !== 'disabled' ||
          api.storagePrefix !== 'qa-community-seasons-outfit-functional-v1:') throw Error('Not the isolated actual-App fixture.');
      const actual = api.build?.sourceHashes;
      if (api.build?.version !== 1 || !actual || Object.keys(actual).length !== Object.keys(expected).length ||
          !Object.entries(expected).every(([key, hash]) => actual[key] === hash)) throw Error('Actual-App fixture build hash mismatch.');
      if (!['prepare', 'snapshot', 'stop'].includes(method)) throw Error('Unsupported actual-App fixture method.');
      return api[method](...args);
    }, { method, args, expected: build.sourceHashes }), 15000, `Functional ${method}`);
    const validate = (snapshot, scenario) => {
      assert.equal(snapshot.ready, true);
      assert.equal(snapshot.caseId, job.definition.id);
      assert.equal(snapshot.scenario, scenario);
      assert.equal(snapshot.skin, job.definition.skin);
      assert.deepEqual(snapshot.outfit, job.definition.outfit);
      assert.equal(snapshot.environment.visible, 'visible');
      assertFixtureHealthy(snapshot);
      assert.ok([snapshot.elapsedMs, snapshot.distance, snapshot.x, snapshot.coins, snapshot.sceneTransition, snapshot.railReturnRemaining].every(finite), 'Production state must remain finite.');
      assert.equal(snapshot.ui.canvas, true);
      assert.equal(snapshot.ui.storeOpen, false, 'Store overlay must remain closed during actual gameplay.');
      assert.equal(snapshot.ui.setupOpen, false, 'Run setup overlay must remain closed during actual gameplay.');
      assert.deepEqual(snapshot.ui.dialogs, [], 'No dialog may cover the actual gameplay controls.');
      assert.ok(snapshot.ui.documentOverflow <= 1, 'Actual-App fixture has horizontal overflow.');
    };
    result.functional = {
      scope: 'Production App advances with natural RAF; lane choices and early submissions use actual DOM button handlers.',
      setup: 'QA fixture places a deterministic approach immediately before a gate. It does not submit answers or advance phases.',
      scenarios: [],
    };
    for (const scenario of ['season', 'correct', 'wrong', 'timeout']) {
      if (stopReason) throw Object.assign(Error(`Interrupted by ${stopReason}`), { interrupted: true });
      await verifySources();
      const hostStarted = performance.now();
      let snapshot = await invoke('prepare', [job.definition.id, scenario]);
      const row = { scenario, startedAt: new Date().toISOString(), samples: [], actions: [], screenshots: [], hostElapsedMs: null, final: null };
      result.functional.scenarios.push(row);
      const answered = new Set();
      const seenPictures = new Set();
      let rideCount, startingQuestionIds;
      let timeoutQuestion = null;
      let completed = false;
      while (!completed) {
        if (stopReason) {
          row.final = await invoke('stop');
          validate(row.final, scenario);
          throw Object.assign(Error(`Interrupted by ${stopReason}`), { interrupted: true });
        }
        if (performance.now() - hostStarted > 88000) throw Error(`${scenario} exceeded its 88-second functional bound.`);
        await verifySources();
        snapshot = await invoke('snapshot');
        validate(snapshot, scenario);
        row.samples.push(snapshot);
        const phases = new Set(snapshot.phases.map(entry => entry.phase));
        const phase = snapshot.rail ? `rail:${snapshot.rail.phase}`
          : snapshot.railReturnRemaining > 0 ? 'rail:return'
            : snapshot.sceneTransition > 0 ? 'season:travel' : `run:${snapshot.mode}`;
        if (['season:travel', 'rail:boarding', 'rail:question', 'rail:falling', 'rail:return'].includes(phase) && !seenPictures.has(phase)) {
          seenPictures.add(phase);
          const filename = `${scenario}-${phase.replace(':', '-')}.jpg`;
          await page.screenshot({ path: path.join(caseDirectory, filename), type: 'jpeg', quality: 70, fullPage: true, timeout: 10000 });
          row.screenshots.push(filename);
          // Screenshots can cross a brief phase boundary. Re-read before any
          // answer so a stale question can never submit the next one.
          snapshot = await invoke('snapshot');
          validate(snapshot, scenario);
        }
        if (scenario === 'season') {
          if (snapshot.scene === snapshot.expectedDestination && snapshot.sceneTransition === 0 && snapshot.mode === 'running') {
            assert.notEqual(snapshot.scene, job.definition.scene);
            assert.ok(phases.has('season:travel'), 'Actual engine never entered seasonal travel.');
            assert.equal(snapshot.rail, null);
            completed = true;
          }
        } else {
          if (snapshot.rail) {
            rideCount ??= snapshot.rail.count;
            startingQuestionIds ??= snapshot.rail.questionIds;
            assert.ok(rideCount === 3 || rideCount === 4, 'Actual train must contain three or four questions.');
            assert.deepEqual(snapshot.rail.questionIds, startingQuestionIds, 'Question deck changed during the ride.');
          }
          if (snapshot.rail?.phase === 'question' && !answered.has(snapshot.rail.index)) {
            const pendingQuestion = snapshot.rail.questionId;
            // The engine can enter question a frame before the throttled
            // React HUD mounts its real controls. Wait for this same question,
            // then re-read all observations before choosing or submitting.
            await page.waitForFunction(questionId => {
              const value = window.__communitySeasonsOutfitFunctional.snapshot();
              return value.rail?.phase === 'question' && value.rail.questionId === questionId &&
                value.ui.railQuiz && value.ui.answers === 3;
            }, pendingQuestion, { timeout: 5000 });
            snapshot = await invoke('snapshot');
            validate(snapshot, scenario);
            assert.equal(snapshot.rail?.phase, 'question');
            assert.equal(snapshot.rail?.questionId, pendingQuestion);
            assert.equal(snapshot.ui.answers, 3);
            assert.equal(snapshot.ui.railQuiz, true);
            const { correctLane, index, questionId, duration, remaining } = snapshot.rail;
            assert.ok([-1, 0, 1].includes(correctLane), 'Question must expose one valid correct lane to the read-only observer.');
            const lane = scenario === 'correct' ? correctLane : correctLane === -1 ? 0 : -1;
            const action = { questionIndex: index, questionId, correctLane, selectedLane: lane, duration, remainingBeforeSelection: remaining, method: 'Playwright actual DOM button click', submitted: false };
            row.actions.push(action);
            await page.locator('.rail-answer-choice').nth(lane + 1).click();
            await page.waitForFunction(({ lane, questionId }) => {
              const value = window.__communitySeasonsOutfitFunctional.snapshot();
              return value.rail?.phase === 'question' && value.rail.questionId === questionId && value.lane === lane && value.ui.submit;
            }, { lane, questionId }, { timeout: 5000 });
            answered.add(index);
            if (scenario === 'timeout') {
              const selected = await invoke('snapshot');
              validate(selected, scenario);
              assert.equal(selected.rail?.phase, 'question');
              assert.equal(selected.rail?.questionId, questionId);
              assert.equal(selected.lane, lane);
              timeoutQuestion = { questionId, observedAtHostMs: performance.now(), remaining: selected.rail.remaining, duration };
              // No Go click: allow the actual full reading countdown to expire.
              action.method += '; no early-submit input (natural reading timeout)';
            } else {
              await page.locator('.rail-submit').click();
              action.submitted = true;
              const judged = await invoke('snapshot');
              validate(judged, scenario);
              assert.equal(judged.rail?.index, index, 'Early submit should judge the current question.');
              assert.equal(judged.rail?.answerLane, lane);
              assert.equal(judged.rail?.correct, scenario === 'correct');
              assert.equal(judged.rail?.phase, scenario === 'correct' ? 'feedback' : 'falling');
            }
          }
          if (scenario === 'correct' && phases.has('rail:return') && !snapshot.rail && snapshot.railReturnRemaining === 0 && snapshot.mode === 'running') {
            assert.equal(answered.size, rideCount, 'Every train question must be answered through the real UI.');
            for (const expected of ['rail:boarding', 'rail:question', 'rail:feedback', 'rail:complete', 'rail:return'])
              assert.ok(phases.has(expected), `Missing production train phase ${expected}.`);
            assertCompletedRailReward(snapshot, rideCount);
            const returned = snapshot;
            const stabilityStarted = performance.now();
            await wait(500);
            const stable = await invoke('snapshot');
            validate(stable, scenario);
            assert.equal(stable.mode, 'running');
            assert.equal(stable.rail, null);
            assert.equal(stable.railReturnRemaining, 0);
            assert.ok(stable.distance > returned.distance, 'Normal gameplay must advance after the train return.');
            assert.equal(stable.coins, returned.coins, 'The reward must not be awarded again after returning to normal gameplay.');
            row.returnStability = { before: returned, after: stable, observedHostWaitMs: performance.now() - stabilityStarted };
            completed = true;
          }
          if (scenario !== 'correct' && snapshot.mode === 'over') {
            // Game-over state precedes the next HUD update too. Establish
            // that the actual explanation rendered before asserting it.
            await page.waitForFunction(() => {
              const value = window.__communitySeasonsOutfitFunctional.snapshot();
              return value.mode === 'over' && value.ui.failure;
            }, undefined, { timeout: 5000 });
            snapshot = await invoke('snapshot');
            validate(snapshot, scenario);
            assert.equal(snapshot.mode, 'over');
            assert.ok(phases.has('rail:boarding') && phases.has('rail:question') && phases.has('rail:falling'), 'Failed train must progress through actual boarding/question/falling phases.');
            assert.equal(answered.size, 1);
            assert.ok(snapshot.rail?.failure, 'Failed train must retain its answer explanation.');
            assert.notEqual(snapshot.rail.failure.optionIndex, snapshot.rail.failure.correctIndex);
            assert.equal(snapshot.ui.failure, true, 'Answer explanation UI must be visible after a wrong answer.');
            if (scenario === 'timeout') {
              assert.ok(timeoutQuestion, 'Timeout case never selected an incorrect lane.');
              assert.equal(row.actions[0].submitted, false);
              const observedWaitMs = performance.now() - timeoutQuestion.observedAtHostMs;
              assert.ok(observedWaitMs >= (timeoutQuestion.remaining - 1) * 1000, 'Timeout occurred without waiting through the natural question countdown.');
              row.naturalTimeout = { ...timeoutQuestion, observedWaitMs };
            }
            completed = true;
          }
        }
        if (!completed) await wait(150);
      }
      row.final = await invoke('stop');
      validate(row.final, scenario);
      assert.ok(Array.isArray(row.final.recentQuestionsBefore) && Array.isArray(row.final.displayedQuestions));
      assert.equal(new Set(row.final.displayedQuestions).size, row.final.displayedQuestions.length, 'A question must not repeat within the scenario.');
      assert.ok(row.final.displayedQuestions.every(id => !row.final.recentQuestionsBefore.includes(id)), 'A recently shown question repeated after the real begin/retry flow.');
      assert.deepEqual(row.final.recentQuestions,
        [...row.final.recentQuestionsBefore, ...row.final.displayedQuestions].slice(-8),
        'Only newly displayed questions may be appended to the bounded recent-eight history.');
      assert.equal(row.final.displayedQuestions.length, scenario === 'season' ? 0 : scenario === 'correct' ? rideCount : 1,
        'Reserved but undisplayed questions must not enter the recent-question history.');
      row.hostElapsedMs = performance.now() - hostStarted;
      row.passed = true;
      const filename = `${scenario}-complete.jpg`;
      await page.screenshot({ path: path.join(caseDirectory, filename), type: 'jpeg', quality: 70, fullPage: true, timeout: 10000 });
      row.screenshots.push(filename);
    }
  }

  async function runCase(job, worker) {
    const hostStarted = performance.now();
    await verifySources(true);
    const previous = checkpoint.cases[job.id];
    const attempt = (previous?.attempts?.length ?? 0) + 1;
    const relative = reportPath('cases', job.id, `attempt-${String(attempt).padStart(3, '0')}`);
    const caseDirectory = path.join(output, relative);
    await fs.mkdir(caseDirectory, { recursive: true });
    const record = { attempt, status: 'running', startedAt: new Date().toISOString(), report: reportPath(relative, 'report.json'), worker };
    checkpoint.cases[job.id] = { status: 'running', attempts: [...(previous?.attempts ?? []), record] };
    active++;
    await persist();
    const result = { format: FORMAT, id: job.id, engine: job.engine, definition: job.definition, attempt, manifestHash: checkpoint.manifestHash, fixtureBuildHash, startedAt: record.startedAt, status: 'running', errors: [], blockedRequests: [], renderer: null, functional: null };
    let context, page;
    try {
      const browser = browsers.get(job.engine);
      context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: 'en', serviceWorkers: 'block' });
      await context.route('**/*', route => {
        if (new URL(route.request().url()).origin === origin) return route.continue();
        result.blockedRequests.push({ url: route.request().url(), method: route.request().method() });
        return route.abort();
      });
      page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => result.errors.push(errorDetails(error)));
      page.on('crash', () => result.errors.push({ message: 'Browser page crashed.' }));
      await runRenderer(page, job, result, caseDirectory);
      if (stopReason) throw Object.assign(Error(`Interrupted by ${stopReason}`), { interrupted: true });
      await runFunctional(page, job, result, caseDirectory);
      assert.deepEqual(result.errors, [], 'Browser raised page errors.');
      assert.deepEqual(result.blockedRequests, [], 'Fixture attempted an external request.');
      await verifySources(true);
      result.status = 'passed';
    } catch (error) {
      result.status = caseFailureStatus(error, {
        stopSignal: invocation.stopSignal, pageErrors: result.errors, blockedRequests: result.blockedRequests,
      });
      result.error = errorDetails(error);
      if (result.status === 'interrupted') result.interruption = { reason: stopReason, signal: invocation.stopSignal, requestedAt: invocation.stopRequestedAt };
      if (!stopReason && /Source changed/.test(error.message)) signal(error.message);
      if (result.status === 'failed' && page && !page.isClosed()) {
        await page.screenshot({ path: path.join(caseDirectory, 'failure.png'), fullPage: true, timeout: 10000 })
          .then(() => { result.failureScreenshot = 'failure.png'; })
          .catch(capture => { result.screenshotError = capture.message; });
      }
    } finally {
      if (context) await bounded(context.close(), 10000, 'Case context close').catch(error => { result.contextCloseError = error.message; });
      result.completedAt = new Date().toISOString();
      result.hostElapsedMs = performance.now() - hostStarted;
      record.status = result.status;
      if (result.interruption) record.interruption = result.interruption;
      record.completedAt = result.completedAt;
      record.hostElapsedMs = result.hostElapsedMs;
      record.rendererHostElapsedMs = result.renderer?.hostElapsedMs ?? null;
      record.functionalHostElapsedMs = result.functional?.scenarios?.reduce((total, row) => total + (row.hostElapsedMs ?? 0), 0) ?? null;
      checkpoint.cases[job.id].status = result.status;
      const reportText = JSON.stringify(result, null, 2) + '\n';
      record.reportHash = crypto.createHash('sha256').update(reportText).digest('hex');
      await fs.writeFile(path.join(caseDirectory, 'report.json'), reportText);
      active--;
      await persist();
      const counts = summary().counts;
      console.log(`${result.status.toUpperCase()} ${job.id} attempt ${attempt} | passed ${counts.passed}/${manifest.caseCount}, failed ${counts.failed}, active ${active}`);
    }
  }

  try {
    for (const engine of manifest.engines) {
      if (stopReason) break;
      const browser = await ENGINES[engine].launch(MATRIX_BROWSER_LAUNCH_OPTIONS);
      browser.on('disconnected', () => {
        if (!shuttingDown) signal(`${engine} browser process disconnected`);
      });
      browsers.set(engine, browser);
    }
    await Promise.all(Array.from({ length: Math.min(options.workers, Math.max(1, jobs.length)) }, (_, index) => (async () => {
      while (!stopReason && nextJob < jobs.length) {
        const job = jobs[nextJob++];
        try { await runCase(job, index + 1); }
        catch (error) { if (!stopReason) signal(error.message); console.error(error.stack); }
      }
    })()));
  } finally {
    shuttingDown = true;
    invocation.cleanupErrors = await closeMatrixResources(browsers, server);
    invocation.completedAt = new Date().toISOString();
    invocation.stopReason = stopReason;
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    process.removeListener('SIGHUP', onHangup);
    await persist();
    const final = summary();
    console.log(JSON.stringify({ output, ...final }, null, 2));
    if (stopReason || final.counts.failed || final.counts.interrupted || invocation.cleanupErrors.length) process.exitCode = 1;
  }
}

main().catch(error => { console.error(error.stack ?? error.message); process.exitCode = 1; });
