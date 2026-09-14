import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';
import { assertPreviewBuildIsCurrent, changedFiles, fileHashes, previewSourceHashes } from '../preview/build-info.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const previewDist = path.join(root, 'qa/preview/dist');
const previewPath = '/qa/community-seasons/';
const markerId = 'community-seasons-qa-v1';
const storagePrefix = 'qa-community-seasons-v1:';
const sentinelEntries = {
  'community-seasons-best': '918273645',
  'qa-unrelated-sentinel': 'preserve-this-value',
};
const platforms = {
  web: { engine: 'chromium', browser: chromium, simulation: 'desktop browser', context: { viewport: { width: 1280, height: 900 } } },
  android: { engine: 'chromium', browser: chromium, simulation: 'Android phone emulation; not physical Android', context: devices['Pixel 7'] },
  ios: { engine: 'webkit', browser: webkit, simulation: 'iPhone emulation in Playwright WebKit; not physical iOS Safari', context: devices['iPhone 13'] },
};

function parsePlatform(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node qa/web/run.mjs [--platform web|android|ios|all]

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
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const relative = decodeURIComponent(pathname.slice(previewPath.length)) || 'index.html';
      const file = path.resolve(previewDist, relative);
      if (!['GET', 'HEAD'].includes(request.method) || !pathname.startsWith(previewPath) || !file.startsWith(previewDist + path.sep)) {
        response.writeHead(404); response.end(); return;
      }
      const contents = await fs.readFile(file);
      response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : contents);
    } catch {
      response.writeHead(404); response.end();
    }
  });
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
  const capture = name => page.screenshot({ path: path.join(reportDirectory, `${platform}-${locale}-${name}.png`), fullPage: true, timeout: 10000 });
  const checkOverflow = async label => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    row[`${label}OverflowPx`] = overflow;
    assert.ok(overflow <= 1, `${label} has horizontal overflow: ${overflow}px`);
  };
  await page.locator('.start-screen .run-button').waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('html').getAttribute('lang'), locale);
  row.emulation = await page.evaluate(() => window.__qaBrowserEmulation);
  row.qa = await page.evaluate(() => window.__communitySeasonsQA?.report());
  assert.equal(row.qa?.id, markerId);
  assert.equal(row.qa?.storagePrefix, storagePrefix);
  assert.equal(row.qa?.cloud, 'disabled');
  assert.deepEqual(row.qa?.build, { version: 1, sourceHashes }, 'Loaded preview must identify the validated build');
  assert.equal(await page.evaluate(() => Object.isFrozen(window.__communitySeasonsQA.build) && Object.isFrozen(window.__communitySeasonsQA.build.sourceHashes)), true);
  await checkOverflow('home');
  await capture('home');

  assert.equal(row.requests.filter(url => url.endsWith('/open-source-licenses.json')).length, 0, 'Notices should load only when opened');
  await page.locator('.licenses-launcher').click();
  await page.locator('.license-entry').first().waitFor();
  const inventory = JSON.parse(await fs.readFile(path.join(previewDist, 'open-source-licenses.json'), 'utf8'));
  row.licensePackages = await page.locator('.license-entry').count();
  assert.equal(row.licensePackages, inventory.packages.length);
  assert.equal(await page.locator('.licenses-dialog a, .licenses-dialog [role=link]').count(), 0);
  await page.locator('.licenses-search input').fill('react');
  assert.ok(await page.locator('.license-entry').count() > 0);
  await page.locator('.license-entry summary').first().click();
  assert.ok((await page.locator('.license-entry[open] pre').first().innerText()).includes('Permission'));
  await capture('licenses');
  await page.locator('.licenses-search input').fill('');
  await page.locator('.licenses-close').click();
  await page.locator('.licenses-dialog').waitFor({ state: 'detached' });

  await page.locator('.start-screen .run-button').click();
  await page.locator('.controls-guide-done').click();
  await page.locator('.controls-guide-done').click();
  await page.locator('.run-setup-footer button[type=submit]').click();
  await page.locator('.arena.running').waitFor();
  await page.locator('.boost-tray').waitFor();
  assert.equal(await page.locator('.boost-slot').count(), 4);
  row.inputs = [];
  if (platform === 'web') {
    for (const key of ['ArrowUp', 'w', 'Space', 'ArrowDown', 's', 'ArrowLeft', 'ArrowRight']) await page.keyboard.press(key);
    row.inputs.push('Arrow keys, W, S, Space');
  } else {
    const bounds = await page.locator('canvas.world').boundingBox();
    assert.ok(bounds, 'Game canvas is visible');
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height * .65;
    if (platforms[platform].engine === 'chromium') {
      for (const [dx, dy] of [[0, -70], [0, 70], [-70, 0], [70, 0]]) await swipeChromium(page, [x, y], [x + dx, y + dy]);
      row.inputs.push('CDP touch swipes up/down/left/right');
    }
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
    row.inputs.push('Two touchscreen taps');
    if (platform === 'ios') row.inputs.push('Swipe and native orientation behavior require physical-device QA');
  }
  await page.getByRole('button', { name: locale === 'en' ? 'Pause game' : '暂停游戏', exact: true }).click();
  await page.locator('.arena.paused').waitFor();
  const distance = await page.locator('.score-block .distance').innerText();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.score-block .distance').innerText(), distance);
  await checkOverflow('paused');
  await capture('paused');
  await page.locator('.result-panel .run-button').click();
  await page.locator('.arena.running').waitFor();
  await page.waitForFunction(previous => document.querySelector('.score-block .distance').textContent.trim() !== previous, distance);
  await page.locator('.licenses-launcher').click();
  await page.locator('.license-entry').first().waitFor();
  await page.locator('.arena.paused').waitFor();
  await page.locator('.licenses-close').click();
  await page.locator('.licenses-dialog').waitFor({ state: 'detached' });
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
  const row = { platform, locale, engine: config.engine, browserVersion: browser.version(), simulation: config.simulation, passed: false, errors: [], badResponses: [], failedRequests: [], blockedRequests: [], requests: [] };
  const context = await browser.newContext({ ...config.context, locale, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(15000);
  page.on('pageerror', error => row.errors.push(String(error)));
  page.on('response', response => { if (response.status() >= 400) row.badResponses.push({ url: response.url(), status: response.status() }); });
  page.on('request', request => row.requests.push(request.url()));
  page.on('requestfailed', request => row.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  let timer;
  try {
    assert.deepEqual((await context.storageState()).origins, []);
    await context.addInitScript(({ entries, platform }) => {
      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
      const original = { type: screen.orientation?.type, angle: screen.orientation?.angle, windowOrientation: window.orientation };
      window.__qaBrowserEmulation = { orientationBeforeAdjustment: original, orientationAdjusted: false };
      // Playwright WebKit can expose portrait-primary with angle 90 on a portrait
      // iPhone descriptor. Correct only that internally contradictory simulation;
      // this does not validate actual Safari orientation or change game behavior.
      if (platform === 'ios' && original.type?.startsWith('portrait') && Math.abs(original.angle) === 90 && original.windowOrientation === 0 && innerHeight > innerWidth) {
        Object.defineProperty(screen.orientation, 'angle', { configurable: true, get: () => 0 });
        window.__qaBrowserEmulation.orientationAdjusted = true;
        window.__qaBrowserEmulation.reason = 'WebKit emulation exposed portrait-primary with angle 90; aligned the simulated angle with portrait viewport and window.orientation=0.';
      }
    }, { entries: sentinelEntries, platform });
    await context.route('**/*', async route => {
      if (new URL(route.request().url()).origin !== origin) {
        row.blockedRequests.push(route.request().url()); await route.abort(); return;
      }
      await route.continue();
    });
    const flow = async () => {
      await page.goto(origin + previewPath);
      await runFlow(page, platform, locale, row, reportDirectory, sourceHashes);
    };
    await Promise.race([
      flow(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Smoke scenario exceeded the 60-second limit')), 60000); }),
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
  const report = { version: 1, startedAt: new Date().toISOString(), requestedPlatform: selected, nodeVersion: process.version, method: 'Source-backed isolated QA preview, temporary localhost server, fresh browser contexts, external requests blocked. Browser emulation is not physical-device QA or native-device performance evidence.', sourceHashes: sourcesBefore, distHashes: await fileHashes(root, [previewDist]), rows: [], errors: [], serverClosed: false };
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
