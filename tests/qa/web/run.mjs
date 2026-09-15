import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';
import { assertPreviewBuildIsCurrent, changedFiles, fileHashes, previewSourceHashes } from '../preview/build-info.mjs';
import { fixtureHandler, initializeBrowserEmulation, licensesCloseIsComplete, snapshotDocumentScrollStyles } from './runtime.mjs';
import { freezeClockAtCurrentTime } from './clock.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const previewDist = path.join(root, 'tests/qa/preview/dist');
const previewPath = '/qa/community-seasons/';
const markerId = 'community-seasons-qa-v1';
const storagePrefix = 'qa-community-seasons-v1:';
const timerMeasurement = 'Playwright controls browser time during gameplay checks. Timer/frame samples are synthetic and cannot measure browser or device performance.';
const sentinelEntries = {
  'community-seasons-best': '918273645',
  'qa-unrelated-sentinel': 'preserve-this-value',
};
const platforms = {
  web: { engine: 'chromium', browser: chromium, simulation: 'desktop browser', context: { viewport: { width: 1280, height: 900 } } },
  android: { engine: 'chromium', browser: chromium, simulation: 'Android phone emulation; not physical Android', context: devices['Pixel 7'] },
  // Hosted WebKit's native layout/scroll actions can exceed 10s under CPU load.
  ios: { engine: 'webkit', browser: webkit, simulation: 'iPhone emulation in Playwright WebKit; not physical iOS Safari', context: devices['iPhone 13'], actionTimeoutMs: 30000, scenarioTimeoutMs: 120000 },
};

function parsePlatform(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node tests/qa/web/run.mjs [--platform web|android|ios|all]

Build the isolated preview first: npm run qa:build
Install desktop/Android browser: npx playwright install chromium
Install iOS simulation browser: npx playwright install webkit

Each platform runs English and Simplified Chinese smoke checks in fresh
contexts on a dedicated temporary localhost server. Reports and screenshots
are saved to results/qa/<timestamp>/. No Toy or physical device is contacted.`);
    return null;
  }
  if (args.length === 0) return 'web';
  if (args.length === 2 && args[0] === '--platform' && (args[1] === 'all' || platforms[args[1]])) return args[1];
  throw new Error('Expected --platform web|android|ios|all. Run with --help for setup instructions.');
}

async function startFixtureServer() {
  const server = http.createServer(fixtureHandler(previewDist, previewPath));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function swipeChromium(page, from, to) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1] }] });
    for (let step = 1; step <= 4; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from[0] + (to[0] - from[0]) * step / 4, y: from[1] + (to[1] - from[1]) * step / 4 }] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await session.detach(); }
}

async function runFlow(page, platform, locale, row, reportDirectory, sourceHashes) {
  const action = async (name, perform) => {
    const timing = { name, elapsedMs: null, completed: false };
    row.actionTimings.push(timing);
    const started = performance.now();
    try {
      const result = await perform();
      timing.completed = true;
      return result;
    } finally { timing.elapsedMs = performance.now() - started; }
  };
  const capture = name => action(`screenshot-${name}`, () => page.screenshot({ path: path.join(reportDirectory, `${platform}-${locale}-${name}.png`), fullPage: true, timeout: 10000 }));
  const advance = async milliseconds => {
    await page.clock.runFor(milliseconds);
    row.clock.advancedMs += milliseconds;
  };
  const checkOverflow = async label => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    row[`${label}OverflowPx`] = overflow;
    assert.ok(overflow <= 1, `${label} has horizontal overflow: ${overflow}px`);
  };
  await page.locator('.start-screen .run-button').waitFor();
  await page.evaluate(() => document.fonts.ready);
  row.localeInitialization = await page.evaluate(() => ({
    navigatorLanguage: navigator.language,
    navigatorLanguages: [...navigator.languages],
    initialDocumentLanguage: document.documentElement.lang,
  }));
  // React renders the localized controls before its hydration effect updates
  // html.lang. Wait for that effect without changing the browser's locale.
  await page.waitForFunction(expected => document.documentElement.lang === expected, locale, { polling: 50 });
  assert.equal(await page.locator('html').getAttribute('lang'), locale);
  row.qa = await page.evaluate(() => window.__communitySeasonsQA?.report());
  assert.equal(row.qa?.id, markerId);
  assert.equal(row.qa?.storagePrefix, storagePrefix);
  assert.equal(row.qa?.cloud, 'disabled');
  assert.deepEqual(row.qa?.build, { version: 1, sourceHashes }, 'Loaded preview must identify the validated build');
  assert.equal(await page.evaluate(() => Object.isFrozen(window.__communitySeasonsQA.build) && Object.isFrozen(window.__communitySeasonsQA.build.sourceHashes)), true);
  await checkOverflow('home');
  await capture('home');

  assert.equal(row.requests.filter(url => url.endsWith('/open-source-licenses.json')).length, 0, 'Notices should load only when opened');
  const homeScrollStyles = await page.evaluate(snapshotDocumentScrollStyles);
  await action('open-licenses', () => page.locator('.licenses-launcher').click());
  await page.locator('.license-entry').first().waitFor();
  const inventory = JSON.parse(await fs.readFile(path.join(previewDist, 'open-source-licenses.json'), 'utf8'));
  row.licensePackages = await page.locator('.license-entry').count();
  assert.equal(row.licensePackages, inventory.packages.length);
  assert.equal(await page.locator('.licenses-dialog a, .licenses-dialog [role=link]').count(), 0);
  await page.locator('.licenses-search input').fill('react');
  assert.ok(await page.locator('.license-entry').count() > 0);
  await action('expand-license', () => page.locator('.license-entry summary').first().click());
  assert.ok((await page.locator('.license-entry[open] pre').first().innerText()).includes('Permission'));
  await capture('licenses');
  await page.locator('.licenses-search input').fill('');
  await action('close-licenses', () => page.locator('.licenses-close').click());
  await action('restore-home-scroll-and-focus', () => page.waitForFunction(licensesCloseIsComplete, homeScrollStyles, { polling: 50 }));

  await action('start-journey', () => page.locator('.start-screen .run-button').click());
  await action('complete-first-guide', () => page.locator('.controls-guide-done').click());
  await action('complete-second-guide', () => page.locator('.controls-guide-done').click());
  // Freeze before gameplay starts: slow input round trips must not carry the
  // player into random obstacles while this test is checking UI controls.
  row.clock.pausedAt = await freezeClockAtCurrentTime(page);
  await action('submit-run-setup', () => page.locator('.run-setup-footer button[type=submit]').click());
  await advance(32);
  await page.locator('.arena.running').waitFor();
  await page.locator('.boost-tray').waitFor();
  assert.equal(await page.locator('.boost-slot').count(), 4);
  row.inputs = [];
  if (platform === 'web') {
    for (const key of ['ArrowUp', 'w', 'Space', 'ArrowDown', 's', 'ArrowLeft', 'ArrowRight']) {
      await page.keyboard.press(key);
      await advance(32);
    }
    row.inputs.push('Arrow keys, W, S, Space');
  } else {
    const bounds = await page.locator('canvas.world').boundingBox();
    assert.ok(bounds, 'Game canvas is visible');
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height * .65;
    if (platforms[platform].engine === 'chromium') {
      for (const [dx, dy] of [[0, -70], [0, 70], [-70, 0], [70, 0]]) {
        await swipeChromium(page, [x, y], [x + dx, y + dy]);
        await advance(32);
      }
      row.inputs.push('CDP touch swipes up/down/left/right');
    }
    await page.touchscreen.tap(x, y);
    await advance(32);
    await page.touchscreen.tap(x, y);
    await advance(32);
    row.inputs.push('Two touchscreen taps');
    if (platform === 'ios') row.inputs.push('Swipe and native orientation behavior require physical-device QA');
  }
  if (platform === 'android' && locale === 'en') {
    // The first obstacle can arrive after about four seconds. Wait longer in
    // the host without advancing browser time to reproduce slow CI delivery.
    const before = await page.locator('.score-block .distance').innerText();
    const started = performance.now();
    await new Promise(resolve => setTimeout(resolve, 6000));
    const after = await page.locator('.score-block .distance').innerText();
    assert.equal(after, before, 'Host input delays must not advance gameplay');
    assert.equal(await page.locator('.arena.running').count(), 1, 'Host input delays must not end the run');
    row.clock.delayedInputCheck = { requestedHostMs: 6000, elapsedHostMs: performance.now() - started, distanceBefore: before, distanceAfter: after, passed: true };
  }
  await action('pause-game', () => page.getByRole('button', { name: locale === 'en' ? 'Pause game' : '暂停游戏', exact: true }).click());
  await page.locator('.arena.paused').waitFor();
  const distance = await page.locator('.score-block .distance').innerText();
  // A frozen clock alone cannot prove the pause handler stops progress.
  await advance(300);
  assert.equal(await page.locator('.score-block .distance').innerText(), distance);
  await checkOverflow('paused');
  await capture('paused');
  await action('resume-game', () => page.locator('.result-panel .run-button').click());
  await page.locator('.arena.running').waitFor();
  await advance(250);
  assert.notEqual(await page.locator('.score-block .distance').innerText(), distance, 'Resuming must advance gameplay when browser time advances');
  const gameScrollStyles = await page.evaluate(snapshotDocumentScrollStyles);
  await action('open-licenses-during-game', () => page.locator('.licenses-launcher').click());
  await page.locator('.license-entry').first().waitFor();
  await page.locator('.arena.paused').waitFor();
  // The game is safely paused now. Let Base UI's real animation completion
  // and its timer/RAF cleanup finish together when closing the dialog.
  await page.clock.resume();
  row.clock.resumedForModalCleanup = true;
  await action('close-licenses-during-game', () => page.locator('.licenses-close').click());
  await action('restore-game-scroll-and-focus', () => page.waitForFunction(licensesCloseIsComplete, gameScrollStyles, { polling: 50 }));
  await page.locator('.arena.paused').waitFor();
  assert.equal(row.requests.filter(url => url.endsWith('/open-source-licenses.json')).length, 1, 'Notices are cached after the first open');

  // Object.entries reads native storage properties, bypassing the fixture's getItem mapping.
  const entries = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  for (const [key, value] of Object.entries(sentinelEntries)) assert.equal(entries[key], value, `Sentinel was overwritten: ${key}`);
  row.storageKeys = Object.keys(entries).sort();
  assert.deepEqual(row.storageKeys.filter(key => !key.startsWith(storagePrefix)), Object.keys(sentinelEntries).sort());
  for (const key of ['community-seasons-progress-v1', 'community-seasons-best', 'community-seasons-controls-seen']) {
    assert.ok(Object.hasOwn(entries, storagePrefix + key), `Game did not write isolated QA key ${key}`);
  }
  row.storageIsolationPassed = true;
  row.qa = await page.evaluate(() => window.__communitySeasonsQA.report());
  assert.deepEqual(row.qa.metrics.errors, []);
  assert.deepEqual(row.errors, []);
  assert.deepEqual(row.badResponses, []);
  assert.deepEqual(row.failedRequests, []);
  assert.deepEqual(row.blockedRequests, []);
  assert.equal(row.requests.some(url => /toy-sdk\.js(?:\?|$)/.test(url)), false, 'Toy SDK must not load');
  await capture('complete');
}

async function runCase(browser, platform, locale, origin, reportDirectory, sourceHashes) {
  const config = platforms[platform];
  const timeouts = { actionMs: config.actionTimeoutMs ?? 10000, scenarioMs: config.scenarioTimeoutMs ?? 60000 };
  const row = { platform, locale, engine: config.engine, browserVersion: browser.version(), simulation: config.simulation, timerMeasurement, clock: { mode: 'controlled', advancedMs: 0 }, timeouts, actionTimings: [], passed: false, errors: [], badResponses: [], failedRequests: [], blockedRequests: [], requests: [] };
  const context = await browser.newContext({ ...config.context, locale, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(timeouts.actionMs);
  page.setDefaultNavigationTimeout(15000);
  page.on('pageerror', error => row.errors.push(String(error)));
  page.on('response', response => { if (response.status() >= 400) row.badResponses.push({ url: response.url(), status: response.status() }); });
  page.on('request', request => row.requests.push(request.url()));
  page.on('requestfailed', request => row.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  let timer;
  try {
    assert.deepEqual((await context.storageState()).origins, []);
    await page.clock.install({ time: Date.now() });
    await context.addInitScript(initializeBrowserEmulation, { entries: sentinelEntries, platform });
    await context.route('**/*', async route => {
      if (new URL(route.request().url()).origin !== origin) {
        row.blockedRequests.push(route.request().url()); await route.abort(); return;
      }
      await route.continue();
    });
    const flow = async () => {
      await page.goto(origin + previewPath);
      // Preserve emulation limitations even when the first UI assertion fails.
      row.emulation = await page.evaluate(() => window.__qaBrowserEmulation);
      await runFlow(page, platform, locale, row, reportDirectory, sourceHashes);
    };
    await Promise.race([
      flow(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Smoke scenario exceeded the ${timeouts.scenarioMs / 1000}-second limit`)), timeouts.scenarioMs); }),
    ]);
    row.passed = true;
  } catch (error) {
    row.error = String(error);
    row.stack = error.stack;
    await page.screenshot({ path: path.join(reportDirectory, `${platform}-${locale}-failure.png`), fullPage: true, timeout: 3000 }).catch(() => {});
  } finally {
    clearTimeout(timer);
    await context.close();
  }
  return row;
}

async function main() {
  const selected = parsePlatform(process.argv.slice(2));
  if (!selected) return;
  try { await fs.access(path.join(previewDist, 'index.html')); }
  catch { throw new Error('Isolated QA preview is missing. Run `npm run qa:build` from the repository root first.'); }
  const sourcesBefore = await assertPreviewBuildIsCurrent(root, previewDist);
  const reportDirectory = path.join(root, 'results/qa', new Date().toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(reportDirectory, { recursive: true });
  const report = { version: 1, startedAt: new Date().toISOString(), requestedPlatform: selected, nodeVersion: process.version, method: 'Source-backed isolated QA preview, temporary localhost server, fresh browser contexts, external requests blocked. Browser emulation is not physical-device QA or native-device performance evidence.', timerMeasurement, sourceHashes: sourcesBefore, distHashes: await fileHashes(root, [previewDist]), rows: [], errors: [], serverClosed: false };
  let server;
  try {
    const fixture = await startFixtureServer();
    server = fixture.server;
    for (const platform of selected === 'all' ? Object.keys(platforms) : [selected]) {
      let browser;
      try {
        browser = await platforms[platform].browser.launch({ headless: true });
        for (const locale of ['en', 'zh-CN']) {
          const row = await runCase(browser, platform, locale, fixture.origin, reportDirectory, report.sourceHashes);
          report.rows.push(row);
          console.log(`${row.passed ? 'PASS' : 'FAIL'} ${platform} / ${locale}${row.error ? `: ${row.error}` : ''}`);
        }
      } catch (error) {
        const message = `${platform}: ${error.message}\nInstall its browser with \`npx playwright install ${platforms[platform].engine}\`. On sandboxed macOS, browser launch also needs subprocess permission.`;
        report.errors.push(message);
        console.error(message);
      } finally { if (browser) await browser.close(); }
    }
  } catch (error) { report.errors.push(String(error)); }
  finally {
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      report.serverClosed = true;
    }
    const sourcesAfter = await previewSourceHashes(root);
    report.changedSourceFiles = changedFiles(sourcesBefore, sourcesAfter);
    report.status = report.rows.length > 0 && report.rows.every(row => row.passed) && report.errors.length === 0 && report.changedSourceFiles.length === 0 ? 'passed' : 'failed';
    report.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(reportDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`${report.status.toUpperCase()}: ${path.relative(root, reportDirectory)}/report.json`);
    if (report.status !== 'passed') process.exitCode = 1;
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
