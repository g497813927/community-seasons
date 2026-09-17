#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { TerminalDashboard } from './terminal-dashboard.mjs';

const root = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(root);

// Suite order is intentional: the first failure stops the rest of the round.
const suiteScripts = {
  engine: 'tests/fuzz/engine-state-fuzz.test.mjs',
  economy: 'tests/fuzz/store-economy-fuzz.test.mjs',
  'engine-properties': 'tests/property/engine-invalid.test.mjs',
  'save-properties': 'tests/property/save-invalid.test.mjs',
  'typed-generators': 'tests/property/typed-arbitraries.test.mjs',
  renderer: 'tests/fuzz/renderer-fuzz.mjs',
};
const engineRegressions = [
  'tests/unit/rail-approach-warmup.test.mjs',
  'tests/unit/railway-forks.test.mjs',
  'tests/unit/boost-fork-assist.test.mjs',
  'tests/unit/fork-dead-ends.test.mjs',
  'tests/unit/fork-dead-end-render.test.mjs',
  'tests/unit/cottage-roof-visibility.test.mjs',
  'tests/unit/summer-boardwalk-supports.test.mjs',
  'tests/unit/boost-barrier-protection.test.mjs',
];
const replayKeys = [
  'ENGINE_FUZZ_REPLAY', 'STORE_FUZZ_SEED', 'RENDERER_FUZZ_SEED',
  'RENDERER_FUZZ_SCENARIO', 'FC_PROPERTY', 'FC_SEED', 'FC_PATH',
  'FC_SAVE_CASE', 'FC_SAVE_SEED', 'FC_SAVE_PATH', 'FC_TYPED_SEED', 'FC_TYPED_PATH',
];
const savedKeys = [
  'ENGINE_FUZZ_REPLAY', 'ENGINE_FUZZ_SEED_OFFSET',
  'RENDERER_FUZZ_SEEDS', 'RENDERER_FUZZ_SEED', 'RENDERER_FUZZ_SCENARIO',
  'RENDERER_FUZZ_BASE_SEED', 'RENDERER_FUZZ_OFFSET', 'RENDERER_FUZZ_BUDGET_MS',
  'STORE_FUZZ_SEEDS', 'STORE_FUZZ_SEED', 'STORE_FUZZ_SEED_OFFSET', 'STORE_FUZZ_ACTIONS',
  'FC_RUNS', 'FC_PROPERTY', 'FC_SEED', 'FC_PATH',
  'FC_SAVE_RUNS', 'FC_SAVE_CASE', 'FC_SAVE_SEED', 'FC_SAVE_PATH',
  'FC_TYPED_RUNS', 'FC_TYPED_SEED', 'FC_TYPED_PATH',
];
const resultPath = 'results/summary.json';
const failureDirectory = 'results/failure';

const help = `Community Seasons fuzz test kit (Node.js 22.13+)

  node tests/fuzz/run.mjs quick                   One short pass (about 10–20 seconds)
  node tests/fuzz/run.mjs full                    One full pass (about 2 minutes)
  node tests/fuzz/run.mjs quick --forever         Stress until failure or Ctrl+C
  node tests/fuzz/run.mjs quick --rounds 2 --seed 12345
  node tests/fuzz/run.mjs quick --suite renderer --renderer-seeds 8

Options:
  --suite all|engine|economy|renderer|engine-properties|save-properties|typed-generators
  --forever             Repeat with fresh deterministic seeds; stop on failure
  --rounds N            Run exactly N seeded stress rounds
  --seed N              Reproducible unsigned 32-bit master seed
  --renderer-seeds N    Renderer seeds per round (quick 16; full 224)
  --renderer-offset N   Offset within the renderer's seed list
  --store-seeds N       Economy seeds per round (quick 32; full 1024)
  --actions N           Actions per economy seed (default 400)
  --runs N              Cases per fast-check property (quick 200; full originals)
  --budget-seconds N    Renderer runtime guard per round (default 170 seconds)
  --tui                Live dashboard on a capable interactive terminal
  --no-tui             Plain progress logs, including on an interactive terminal
  --help

Dependencies install once from the exact lockfile, with scripts disabled.
Results keep only the latest round and the first failure; Ctrl+C saves a summary.
See docs/FUZZING.md for individual seed/path replay and typed generator guidance.`;

function fail(message) {
  console.error(message);
  process.exit(2);
}

function parseOptions(arguments_) {
  const args = [...arguments_];
  if (args.includes('--help')) {
    console.log(help);
    process.exit(0);
  }
  const mode = args[0] && !args[0].startsWith('--') ? args.shift() : 'quick';
  if (!['quick', 'full'].includes(mode)) fail(help);

  const options = { suite: 'all' };
  const valueOptions = new Set([
    'suite', 'rounds', 'seed', 'renderer-seeds', 'renderer-offset',
    'store-seeds', 'actions', 'runs', 'budget-seconds',
  ]);
  while (args.length) {
    const flag = args.shift();
    const key = flag?.slice(2);
    if (flag === '--forever') {
      options.forever = true;
      continue;
    }
    if (flag === '--tui' || flag === '--no-tui') {
      if (options.tui !== undefined) fail('Choose only one of --tui and --no-tui.');
      options.tui = flag === '--tui';
      continue;
    }
    const value = args.shift();
    if (!flag?.startsWith('--') || !valueOptions.has(key) || value === undefined) {
      fail(`Unknown/incomplete option: ${flag}`);
    }
    options[key] = value;
  }
  if (options.suite !== 'all' && !Object.hasOwn(suiteScripts, options.suite)) {
    fail('Unknown/unavailable suite. Use --help.');
  }
  if (options.forever && options.rounds !== undefined) {
    fail('Choose either --forever or --rounds, not both.');
  }
  for (const [key, value] of Object.entries(options)) {
    if (['suite', 'forever', 'tui'].includes(key)) continue;
    const number = Number(value);
    const minimum = ['seed', 'renderer-offset'].includes(key) ? 0 : 1;
    const maximum = key === 'seed' ? 0xffffffff : 1000000;
    if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
      fail(`Invalid --${key}: expected an integer from ${minimum} to ${maximum}.`);
    }
    options[key] = number;
  }
  const repeating = Boolean(options.forever || options.rounds !== undefined);
  const seeded = repeating || options.seed !== undefined;
  if (seeded && replayKeys.some(key => process.env[key] !== undefined)) {
    fail('Unset exact-replay environment variables before using --seed/--rounds/--forever. Replays are single passes.');
  }
  return { mode, options, repeating, seeded };
}

function checkNodeVersion() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) {
    fail('Please install Node.js 22.13 or newer, then rerun.');
  }
}

function setEnvironment(env, key, value) {
  if (value !== undefined) env[key] = String(value);
}

function createBaseEnvironment(mode, options) {
  const env = { ...process.env };
  const quick = mode === 'quick';
  // CLI settings take priority over the environment, then mode defaults.
  setEnvironment(env, 'RENDERER_FUZZ_SEEDS', options['renderer-seeds'] ?? env.RENDERER_FUZZ_SEEDS ?? (quick ? 16 : 224));
  setEnvironment(env, 'RENDERER_FUZZ_OFFSET', options['renderer-offset']);
  setEnvironment(env, 'STORE_FUZZ_SEEDS', options['store-seeds'] ?? env.STORE_FUZZ_SEEDS ?? (quick ? 32 : 1024));
  setEnvironment(env, 'STORE_FUZZ_ACTIONS', options.actions);
  for (const key of ['FC_RUNS', 'FC_SAVE_RUNS', 'FC_TYPED_RUNS']) {
    setEnvironment(env, key, options.runs ?? env[key] ?? (quick ? 200 : undefined));
  }
  if (options['budget-seconds'] !== undefined) {
    setEnvironment(env, 'RENDERER_FUZZ_BUDGET_MS', options['budget-seconds'] * 1000);
  }
  return env;
}

function createRoundEnvironment(baseEnv, roundSeed) {
  const env = { ...baseEnv };
  if (roundSeed !== null) {
    // These constants must remain stable so recorded seeds can be replayed.
    setEnvironment(env, 'ENGINE_FUZZ_SEED_OFFSET', (roundSeed ^ 0x17ac3401) >>> 0);
    setEnvironment(env, 'STORE_FUZZ_SEED_OFFSET', (roundSeed ^ 0x32e78109) >>> 0);
    setEnvironment(env, 'RENDERER_FUZZ_BASE_SEED', (roundSeed ^ 0x4c9815d3) >>> 0);
    setEnvironment(env, 'FC_SEED', (roundSeed ^ 0x596abd21) | 0);
    setEnvironment(env, 'FC_SAVE_SEED', (roundSeed ^ 0x63a19187) | 0);
    setEnvironment(env, 'FC_TYPED_SEED', (roundSeed ^ 0x76fe23d1) | 0);
  }
  return env;
}

const { mode, options, repeating, seeded } = parseOptions(process.argv.slice(2));
checkNodeVersion();

// Shared session state is limited to process shutdown and the dashboard.
const session = {
  stopped: false,
  stopSignal: null,
  activeChild: null,
  shutdownTimer: null,
  dashboard: null,
  activeSuite: null,
  suiteStartedAt: null,
  startedAt: Date.now(),
};

function notify(message, error = false) {
  if (session.dashboard) session.dashboard.log(message, error);
  else if (error) console.error(message);
  else console.log(message);
}

function killActiveChild(signal = 'SIGTERM') {
  const child = session.activeChild;
  if (!child) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if (error.code !== 'ESRCH') child.kill(signal);
  }
}

function interruptedExitCode() {
  return session.stopSignal === 'SIGTERM' ? 143 : 130;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    session.stopped = true;
    session.stopSignal = signal;
    notify('Stopping; saving the current summary…');
    killActiveChild();
    session.shutdownTimer ??= setTimeout(() => killActiveChild('SIGKILL'), 2000);
    session.shutdownTimer.unref();
  });
}
function cleanUpSession() {
  session.dashboard?.close();
  killActiveChild();
}
process.on('exit', cleanUpSession);
process.on('uncaughtExceptionMonitor', cleanUpSession);

function runChild(command, args, { env = process.env, logFile, timeout = 120000, inherit = false } = {}) {
  return new Promise(resolve => {
    const logLimit = 1024 * 1024;
    const logDescriptor = logFile ? fs.openSync(logFile, 'w') : null;
    let tail = '';
    let written = 0;
    let truncated = false;
    let timedOut = false;
    let error = null;
    let settled = false;
    let hardStop;
    const child = spawn(command, args, {
      env,
      stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    session.activeChild = child;

    function recordOutput(data) {
      if (logDescriptor !== null) {
        const remaining = Math.max(0, logLimit - written);
        if (remaining) written += fs.writeSync(logDescriptor, data, 0, Math.min(remaining, data.length));
        if (data.length > remaining) truncated = true;
      }
      tail = (tail + data.toString('utf8')).slice(-14000);
    }
    child.stdout?.on('data', recordOutput);
    child.stderr?.on('data', recordOutput);
    const timer = setTimeout(() => {
      timedOut = true;
      killActiveChild();
      hardStop = setTimeout(() => killActiveChild('SIGKILL'), 2000);
    }, timeout);

    function finish(status, signal) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(hardStop);
      if (logDescriptor !== null) fs.closeSync(logDescriptor);
      if (session.activeChild === child) {
        session.activeChild = null;
        clearTimeout(session.shutdownTimer);
        session.shutdownTimer = null;
      }
      resolve({ status, signal, error, tail, truncated, timedOut });
    }
    child.on('error', childError => {
      error = String(childError);
      finish(null, null);
    });
    child.on('close', finish);
  });
}

async function ensureDependencies(expected) {
  const ready = Object.entries(expected).every(([name, version]) => {
    try {
      return JSON.parse(fs.readFileSync(`node_modules/${name}/package.json`, 'utf8')).version === version;
    } catch {
      return false;
    }
  });
  if (ready) return;

  console.log('Installing locked test dependencies (first run only)…');
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (process.platform === 'win32' && !fs.existsSync(npmCli)) {
    fail('Run npm ci --ignore-scripts --no-audit --no-fund once, then rerun this command.');
  }
  const command = process.platform === 'win32' ? process.execPath : 'npm';
  const args = [
    ...(process.platform === 'win32' ? [npmCli] : []),
    'ci', '--ignore-scripts', '--no-audit', '--no-fund',
    '--cache', process.env.npm_config_cache ?? path.join(root, '.npm-cache'),
  ];
  const result = await runChild(command, args, { inherit: true });
  if (result.status === 0) return;

  console.error('Dependency installation did not complete.');
  fs.mkdirSync('results', { recursive: true });
  writeJSON(resultPath, {
    version: 2,
    status: session.stopped ? 'interrupted' : 'dependency-error',
    phase: 'dependency-install',
    completedRounds: 0,
    stopSignal: session.stopSignal,
  });
  process.exit(session.stopped ? interruptedExitCode() : 1);
}

function writeJSON(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function readSourceHashes(manifest) {
  const gameDirectory = 'src/lib/game/';
  const files = new Set(Object.keys(manifest.sourceHashes));
  for (const file of fs.readdirSync(gameDirectory, { recursive: true }).sort()) {
    if (/\.(?:ts|json)$/.test(file)) files.add(gameDirectory + file.split(path.sep).join('/'));
  }
  return Object.fromEntries([...files].map(file => {
    try {
      return [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')];
    } catch (error) {
      return [file, `unreadable:${error.code}`];
    }
  }));
}

function createReport(expected, manifest, hashes, masterSeed) {
  return {
    version: 2,
    startedAt: new Date().toISOString(),
    mode,
    repeating,
    requestedRounds: options.forever ? 'forever' : options.rounds ?? 1,
    masterSeed,
    node: process.versions.node,
    dependencies: expected,
    sourceHashes: hashes,
    matchesBundledSnapshot: JSON.stringify(hashes) === JSON.stringify(manifest.sourceHashes),
    completedRounds: 0,
    roundCounts: { passed: 0, failed: 0, interrupted: 0, timeBudget: 0, inputsChanged: 0 },
    totalElapsedSeconds: 0,
    latestRound: null,
    status: 'running',
  };
}

function createDashboard(report) {
  const enabled = Boolean(
    process.stdout.isTTY && process.env.TERM !== 'dumb' && options.tui !== false &&
    (process.stdout.columns || 80) >= 44 && (process.stdout.rows || 24) >= 14
  );
  report.terminalMode = enabled ? 'tui' : 'plain';
  return new TerminalDashboard({
    enabled,
    snapshot: () => ({
      mode,
      status: session.stopped ? 'stopping' : report.status,
      requestedRounds: report.requestedRounds,
      round: report.latestRound?.number,
      roundCounts: report.roundCounts,
      suite: session.activeSuite,
      elapsed: (Date.now() - session.startedAt) / 1000,
      suiteElapsed: session.suiteStartedAt === null ? 0 : (Date.now() - session.suiteStartedAt) / 1000,
      masterSeed: report.masterSeed,
      roundSeed: report.latestRound?.seed,
    }),
  });
}

function recordSourceChange(report, hashes, boundary) {
  report.observedSourceHashes = hashes;
  report.inputChangeBoundary = boundary;
}

function notifySourceChange() {
  notify('Game source changed during this session. Restart after edits; this is not a gameplay failure.');
}

function suiteArguments(suite) {
  if (suite === 'renderer') return [suiteScripts[suite]];
  return ['--test', suiteScripts[suite], ...(suite === 'engine' ? engineRegressions : [])];
}

function suiteStatus(result, suite, sourceChanged) {
  if (session.stopped) return 'interrupted';
  if (sourceChanged) return 'inputs-changed';
  if (result.status === 0) return 'passed';
  if (result.timedOut || (suite === 'renderer' && result.status === 3)) return 'time-budget';
  return 'failed';
}

function preserveFailure(report) {
  fs.mkdirSync(failureDirectory, { recursive: true });
  for (const suite of report.latestRound.suites) {
    fs.copyFileSync(suite.log, `${failureDirectory}/${suite.name}.log`);
  }
  writeJSON(`${failureDirectory}/summary.json`, report);
}

async function runSuite(suite, env, report, changedInputs) {
  session.activeSuite = suite;
  session.suiteStartedAt = Date.now();
  notify(`Running ${suite}…`);
  const startedAt = Date.now();
  const timeout = suite === 'renderer' ? Number(env.RENDERER_FUZZ_BUDGET_MS ?? 170000) + 30000 : 120000;
  const result = await runChild(process.execPath, suiteArguments(suite), {
    env,
    logFile: `results/${suite}.log`,
    timeout,
  });
  const changedHashes = changedInputs();
  const status = suiteStatus(result, suite, changedHashes);
  if (changedHashes) recordSourceChange(report, changedHashes, `after ${suite}`);

  const row = {
    name: suite,
    status,
    exitCode: result.status,
    signal: result.signal,
    elapsedSeconds: (Date.now() - startedAt) / 1000,
    log: `results/${suite}.log`,
    logTruncated: result.truncated,
  };
  session.activeSuite = null;
  session.suiteStartedAt = null;
  report.latestRound.suites.push(row);
  report.latestRound.elapsedSeconds += row.elapsedSeconds;
  report.totalElapsedSeconds += row.elapsedSeconds;
  writeJSON(resultPath, report);
  notify(`${status.toUpperCase()} ${suite} (${row.elapsedSeconds.toFixed(1)}s)`);
  if (status !== 'passed') {
    report.latestRound.status = status;
    report.status = status;
    if (status === 'inputs-changed') notifySourceChange();
    if (!session.stopped && status !== 'inputs-changed') {
      notify(result.error ?? result.tail, true);
      preserveFailure(report);
    }
  }
  return status;
}

function settleRound(report, status) {
  report.latestRound.status = status;
  report.status = status;
  const counter = {
    passed: 'passed', failed: 'failed', interrupted: 'interrupted',
    'time-budget': 'timeBudget', 'inputs-changed': 'inputsChanged',
  }[status];
  if (counter) report.roundCounts[counter]++;
  report.completedRounds = report.roundCounts.passed;
  writeJSON(resultPath, report);
  notify(`Round ${report.latestRound.number} ${status}; passed ${report.roundCounts.passed}, failed ${report.roundCounts.failed}.`);
}

async function runRound(number, baseEnv, selectedSuites, report, changedInputs) {
  const seed = seeded ? (report.masterSeed + Math.imul(number - 1, 2654435761)) >>> 0 : null;
  const env = createRoundEnvironment(baseEnv, seed);
  report.status = 'running';
  report.latestRound = {
    number,
    seed,
    settings: Object.fromEntries(savedKeys.filter(key => env[key] !== undefined).map(key => [key, env[key]])),
    suites: [],
    elapsedSeconds: 0,
    status: 'running',
  };
  writeJSON(resultPath, report);
  notify(`Round ${number}${seeded ? ` · seed ${seed}` : ''}`);
  for (const suite of selectedSuites) {
    if (session.stopped) break;
    // Source edits invalidate the round even when a child exits successfully.
    const changedHashes = changedInputs();
    if (changedHashes) {
      report.status = 'inputs-changed';
      report.latestRound.status = 'inputs-changed';
      recordSourceChange(report, changedHashes, `before ${suite}`);
      writeJSON(resultPath, report);
      notifySourceChange();
      break;
    }
    if (await runSuite(suite, env, report, changedInputs) !== 'passed') break;
  }
  const status = session.stopped ? 'interrupted'
    : report.latestRound.status === 'running' ? 'passed'
    : report.latestRound.status;
  settleRound(report, status);
}

function printSummary(report) {
  const messages = {
    passed: 'All requested rounds passed.',
    interrupted: 'Stopped cleanly.',
    'inputs-changed': 'Stopped because game source changed.',
    'time-budget': 'Stopped at the runtime limit.',
  };
  const counts = report.roundCounts;
  console.log([
    messages[report.status] ?? 'Stopped at the first failed suite.',
    `Passed rounds: ${counts.passed}; failed: ${counts.failed}; interrupted: ${counts.interrupted};`,
    `time budget: ${counts.timeBudget}; inputs changed: ${counts.inputsChanged}.`,
    `Results: ${path.join(root, resultPath)}`,
  ].join(' '));
}

async function main() {
  const expected = JSON.parse(fs.readFileSync('package.json', 'utf8')).devDependencies;
  await ensureDependencies(expected);
  const baseEnv = createBaseEnvironment(mode, options);
  const manifest = JSON.parse(fs.readFileSync('snapshot.json', 'utf8'));
  const hashes = readSourceHashes(manifest);
  const changedInputs = () => {
    const current = readSourceHashes(manifest);
    return JSON.stringify(current) === JSON.stringify(hashes) ? null : current;
  };
  const masterSeed = seeded ? (options.seed ?? crypto.randomBytes(4).readUInt32LE()) : null;
  const report = createReport(expected, manifest, hashes, masterSeed);
  const selectedSuites = options.suite === 'all' ? Object.keys(suiteScripts) : [options.suite];
  const roundLimit = options.forever ? Infinity : options.rounds ?? 1;
  fs.mkdirSync('results', { recursive: true });
  if (!report.matchesBundledSnapshot) {
    notify('Game source differs from the bundled snapshot; current hashes are recorded.');
  }
  if (seeded) notify(`Master seed: ${masterSeed}. Reproduce with --seed ${masterSeed}.`);

  session.dashboard = createDashboard(report);
  try {
    session.dashboard.start();
    for (let round = 1; round <= roundLimit && !session.stopped; round++) {
      await runRound(round, baseEnv, selectedSuites, report, changedInputs);
      if (report.status !== 'passed') break;
    }
    if (session.stopped) report.status = 'interrupted';
    report.finishedAt = new Date().toISOString();
    report.stopSignal = session.stopSignal;
    writeJSON(resultPath, report);
    if (['failed', 'time-budget'].includes(report.status)) {
      writeJSON(`${failureDirectory}/summary.json`, report);
    }
  } finally {
    session.dashboard.close();
  }
  printSummary(report);
  process.exitCode = session.stopped ? interruptedExitCode() : report.status === 'passed' ? 0 : 1;
}

await main();
