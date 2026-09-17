import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { changedFiles, fileHashes } from '../preview/build-info.mjs';
import { fixtureHandler } from '../web/runtime.mjs';
import { freezeClockAtCurrentTime } from '../web/clock.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const fixtureRoot = path.join(root, 'tests/qa/rail-submit');
const previewPath = '/qa/rail-submit/';
const storagePrefix = 'qa-rail-submit-v1:';
const watched = ['src', 'tests/qa/rail-submit', 'tests/qa/preview', 'tests/qa/web/runtime.mjs', 'tests/qa/web/clock.mjs', 'package.json', 'package-lock.json'];
const sources = () => fileHashes(root, watched.map(file => path.join(root, file)));
const profiles = [
  { id: 'desktop', width: 1280, height: 900 },
  { id: 'small-phone', width: 320, height: 568 },
  { id: 'small-phone-text-200', width: 320, height: 568, textScale: 2 },
];

async function runCase(browser, profile, locale, origin, reportDirectory) {
  const row = { profile: profile.id, locale, passed: false, checks: [], errors: [], blockedRequests: [] };
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    screen: { width: profile.width, height: profile.height },
    hasTouch: true, isMobile: profile.width < 600, locale, serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => row.errors.push(String(error)));
  await context.addInitScript(() => {
    localStorage.setItem('community-seasons-best', '918273645');
    localStorage.setItem('qa-unrelated-sentinel', 'preserve-this-value');
  });
  await context.route('**/*', async route => {
    if (new URL(route.request().url()).origin !== origin) {
      row.blockedRequests.push(route.request().url());
      await route.abort();
    } else await route.continue();
  });
  const advance = ms => page.clock.runFor(ms);
  const snapshot = () => page.evaluate(() => window.__railSubmitQA.snapshot());
  const prepare = async (longest = false) => {
    await page.evaluate(longest => longest ? window.__railSubmitQA.prepareLongestQuestion() : window.__railSubmitQA.prepare(), longest);
    // The production HUD is intentionally throttled to 75ms while running.
    await advance(96);
    await page.locator('canvas.world').focus();
    assert.equal((await snapshot()).phase, 'question');
    assert.equal(await page.locator('.rail-submit').isEnabled(), true);
  };
  const assertQuestion = async message => assert.equal((await snapshot()).phase, 'question', message);
  const assertSubmitted = async (message, phase = 'feedback') => {
    const state = await snapshot();
    assert.equal(state.phase, phase, message);
    assert.equal(state.answerLane, state.lane, 'Submission must use the selected lane');
    assert.equal(await page.locator('.rail-submit').count(), 0, 'Go is hidden after submission');
    return state;
  };
  const pathPoint = async () => {
    // Find a real exposed canvas point; controls must never act as path taps.
    return page.locator('canvas.world').evaluate(canvas => {
      const box = canvas.getBoundingClientRect();
      for (const vertical of [.64, .52, .75, .4, .9, .15]) {
        for (const horizontal of [.5, .2, .8]) {
          const x = box.left + box.width * horizontal, y = box.top + box.height * vertical;
          if (x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && document.elementFromPoint(x, y) === canvas) return { x, y };
        }
      }
      throw Error('No visible path target is reachable for a genuine touchscreen tap.');
    });
  };
  const tapPath = async () => {
    const point = await pathPoint();
    await page.touchscreen.tap(point.x, point.y);
  };
  const swipePath = async (dx, dy) => {
    const point = await pathPoint();
    const session = await context.newCDPSession(page);
    try {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      for (let step = 1; step <= 4; step++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + dx * step / 4, y: point.y + dy * step / 4 }] });
        await advance(16);
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await advance(96);
    } finally { await session.detach(); }
  };
  const check = async (id, fn) => {
    const entry = { id, passed: false };
    row.checks.push(entry);
    await fn(entry);
    entry.passed = true;
  };
  try {
    await page.clock.install({ time: Date.now() });
    await page.goto(origin + previewPath);
    await page.locator('.start-screen .run-button').waitFor();
    await page.waitForFunction(expected => document.documentElement.lang === expected, locale);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.start-screen .run-button').click();
    await freezeClockAtCurrentTime(page);
    await page.locator('.run-setup-footer button[type=submit]').click();
    await advance(32);
    assert.deepEqual(await page.evaluate(() => {
      const { id, storagePrefix, cloud } = window.__railSubmitQA;
      return { id, storagePrefix, cloud };
    }), { id: 'rail-submit-v1', storagePrefix, cloud: 'disabled' });

    for (const key of ['ArrowUp', 'w']) {
      await check(`double-${key}`, async entry => {
        await prepare();
        await page.keyboard.press(key);
        await advance(32);
        await assertQuestion('One upward key press must not submit');
        await page.keyboard.press(key);
        await advance(32);
        entry.submitted = await assertSubmitted('Two upward presses submit promptly');
        assert.equal(entry.submitted.correctCount, 1);
      });
      await check(`held-${key}`, async () => {
        await prepare();
        await page.keyboard.down(key);
        await advance(32);
        await page.keyboard.down(key); // Playwright marks a held key as repeat.
        await advance(32);
        await assertQuestion('OS key repeat must not count as a second hit');
        await page.keyboard.up(key);
        await page.keyboard.press(key);
        await advance(32);
        await assertQuestion('A held-key repeat clears a pending double hit');
        await page.keyboard.press(key);
        await advance(32);
        await assertSubmitted('Two fresh physical presses work after a held key');
      });
    }
    await check('mixed-up-keys', async () => {
      await prepare();
      await page.keyboard.press('ArrowUp');
      await advance(32);
      await page.keyboard.press('w');
      await advance(32);
      await assertQuestion('Different physical keys must not create a double hit');
      await page.keyboard.press('w');
      await advance(32);
      await assertSubmitted('Two W presses after ArrowUp should submit');
    });
    await check('slow-key-pair', async () => {
      await prepare();
      await page.keyboard.press('ArrowUp');
      await advance(400);
      await page.keyboard.press('ArrowUp');
      await advance(32);
      await assertQuestion('Widely separated keys must not submit');
    });
    await check('double-touch-does-not-submit', async () => {
      await prepare();
      await tapPath();
      await advance(32);
      await assertQuestion('One path tap must not submit');
      await tapPath();
      await advance(32);
      await assertQuestion('Double tapping the path must not submit an answer');
    });
    await check('horizontal-swipe-selects-only', async () => {
      await prepare();
      await swipePath(-60, 0);
      await assertQuestion('Swiping left only selects a lane');
      assert.equal((await snapshot()).lane, -1);
      assert.equal(await page.locator('.rail-answer-column').nth(0).locator('.rail-submit').count(), 1);
      await swipePath(60, 0);
      await assertQuestion('Swiping right only selects a lane');
      assert.equal((await snapshot()).lane, 0);
      assert.equal(await page.locator('.rail-answer-column').nth(1).locator('.rail-submit').count(), 1);
    });
    await check('answer-card-then-go', async entry => {
      await prepare();
      const answer = page.locator('.rail-answer-choice').nth(2);
      await answer.tap();
      await advance(32);
      await answer.tap();
      await advance(32);
      await assertQuestion('Double tapping an answer only selects its lane');
      assert.equal((await snapshot()).lane, 1);
      assert.equal(await page.locator('.rail-submit').count(), 1);
      assert.equal(await page.locator('.rail-answer-column').nth(2).locator('.rail-submit').count(), 1, 'Go must move inside the selected answer card');
      await page.getByRole('button', { name: locale === 'en' ? 'Go: submit answer C' : '出发：提交答案 C', exact: true }).tap();
      await advance(32);
      entry.submitted = await assertSubmitted('Go submits the selected wrong answer immediately', 'falling');
      assert.equal(entry.submitted.correct, false);
    });
    for (const key of ['Enter', 'Space']) await check(`keyboard-accessible-go-${key}`, async () => {
      await prepare();
      const go = page.locator('.rail-submit');
      assert.equal((await go.innerText()).trim(), locale === 'en' ? 'Go' : '出发');
      assert.equal(await page.locator('.rail-answer-column').nth(1).locator('.rail-submit').count(), 1, 'Only the selected center answer starts with Go');
      await go.focus();
      await page.keyboard.press(key);
      await advance(32);
      await assertSubmitted('Focused Go supports keyboard activation');
    });
    for (const input of ['key']) {
      const send = () => input === 'key' ? page.keyboard.press('ArrowUp') : tapPath();
      await check(`pause-clears-${input}-pair`, async () => {
        await prepare();
        await send();
        await advance(32);
        await page.keyboard.press('p');
        await advance(32);
        assert.equal((await snapshot()).mode, 'paused');
        assert.equal(await page.locator('.rail-submit').isDisabled(), true);
        const before = await snapshot();
        await send();
        await advance(32);
        await send();
        await advance(32);
        const during = await snapshot();
        assert.equal(during.remaining, before.remaining, 'Paused question time stays frozen');
        assert.equal(during.phase, 'question', 'Paused gestures cannot submit');
        await page.keyboard.press('p');
        await advance(32);
        await send();
        await advance(32);
        await assertQuestion('Pre-pause inputs cannot combine with a post-resume input');
        await send();
        await advance(32);
        await assertSubmitted('Fresh double input works after resuming');
      });
      await check(`new-question-clears-${input}-pair`, async () => {
        await prepare();
        await send();
        await page.evaluate(() => window.__railSubmitQA.shortenCurrentPhase());
        await advance(80);
        await assertSubmitted('Natural deadline still submits the first question');
        await page.evaluate(() => window.__railSubmitQA.shortenCurrentPhase());
        await advance(80);
        assert.equal((await snapshot()).index, 1);
        await send();
        await advance(32);
        await assertQuestion('A tap from the previous question cannot submit the next question');
      });
    }
    await check('blur-clears-key-pair', async () => {
      await prepare();
      await page.keyboard.press('ArrowUp');
      // Real focus changes are platform-dependent in headless Chromium. This
      // labelled synthetic blur tests the production lifecycle listener.
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await advance(32);
      assert.equal((await snapshot()).mode, 'paused');
      await page.keyboard.press('p');
      await advance(32);
      await page.keyboard.press('ArrowUp');
      await advance(32);
      await assertQuestion('A pre-blur key must not combine after focus resumes');
    });

    await check('layout-and-targets', async entry => {
      await prepare(true);
      entry.question = (await snapshot()).question;
      if (profile.textScale) {
        entry.textScaling = await page.evaluate(scale => {
          const entries = [...document.querySelectorAll('.arena, .arena *')].map(element => {
            const css = getComputedStyle(element);
            return { element, fontSize: parseFloat(css.fontSize), lineHeight: parseFloat(css.lineHeight) };
          });
          for (const { element, fontSize, lineHeight } of entries) {
            element.style.setProperty('font-size', `${fontSize * scale}px`, 'important');
            if (Number.isFinite(lineHeight)) element.style.setProperty('line-height', `${lineHeight * scale}px`, 'important');
          }
          return { scale, elements: entries.length };
        }, profile.textScale);
        await advance(32);
      }
      entry.layout = await page.evaluate(() => {
        const rect = selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
        };
        return { viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth, question: rect('.rail-question'), answers: rect('.rail-answer-area'), selected: rect('.rail-answer-choice[aria-pressed="true"]'), selectedCard: rect('.rail-answer-column:has(.rail-answer-choice[aria-pressed="true"])'), go: rect('.rail-submit') };
      });
      assert.ok(entry.layout.documentWidth <= entry.layout.viewportWidth + 1, 'Rail UI must fit document width');
      assert.ok(entry.layout.question.bottom <= entry.layout.answers.top + 1, 'Question and answer controls must not overlap');
      assert.ok(entry.layout.go.top >= entry.layout.selected.bottom, 'Go must sit below the answer selection button inside its card');
      assert.ok(entry.layout.go.left >= entry.layout.selectedCard.left && entry.layout.go.right <= entry.layout.selectedCard.right && entry.layout.go.top >= entry.layout.selectedCard.top && entry.layout.go.bottom <= entry.layout.selectedCard.bottom, 'Go must be geometrically contained inside the selected answer card');
      assert.equal(await page.locator('.rail-answer-choice .rail-submit').count(), 0, 'Go and answer selection must be sibling buttons, never nested buttons');
      if (profile.textScale) {
        await page.evaluate(() => window.scrollTo(0, 0));
        const before = await page.evaluate(() => window.scrollY);
        await swipePath(0, -120);
        const after = await page.evaluate(() => window.scrollY);
        entry.nativeTouchScroll = { before, after, delivery: 'CDP touch swipe; browser emulation' };
        assert.ok(after > before + 20, 'Vertical touch swipe must scroll enlarged rail content');
        await assertQuestion('Scrolling rail content must not submit');
      }
      entry.targets = [];
      for (const control of await page.locator('.rail-answer-choice, .rail-submit').all()) {
        await control.scrollIntoViewIfNeeded();
        const measured = await control.evaluate(element => {
          const r = element.getBoundingClientRect();
          let left = Math.max(0, r.left), right = Math.min(innerWidth, r.right);
          let top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const css = getComputedStyle(parent), box = parent.getBoundingClientRect();
            if (/(hidden|clip|auto|scroll)/.test(css.overflowX)) { left = Math.max(left, box.left); right = Math.min(right, box.right); }
            if (/(hidden|clip|auto|scroll)/.test(css.overflowY)) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
          }
          const point = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
          return { text: element.textContent.trim(), width: r.width, height: r.height, visibleWidth: right - left, visibleHeight: bottom - top, reachable: point === element || element.contains(point) };
        });
        entry.targets.push(measured);
        assert.ok(measured.width >= 44 && measured.height >= 44, `Touch target too small: ${measured.text}`);
        assert.ok(measured.visibleWidth >= 40 && measured.visibleHeight >= 40 && measured.reachable, `Control is clipped or unreachable: ${measured.text}`);
      }
      await page.screenshot({ path: path.join(reportDirectory, `${profile.id}-${locale}.png`), fullPage: true });
      await page.locator('.rail-submit').tap();
      await advance(32);
      await assertSubmitted('Visible Go remains usable in the checked layout');
    });
    row.storage = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    assert.equal(row.storage['community-seasons-best'], '918273645');
    assert.equal(row.storage['qa-unrelated-sentinel'], 'preserve-this-value');
    assert.ok(Object.keys(row.storage).some(key => key.startsWith(storagePrefix)));
    assert.deepEqual(row.blockedRequests, [], 'Fixture must not attempt Toy or external access');
    assert.deepEqual(row.errors, []);
    row.passed = true;
  } catch (error) {
    row.errors.push(error.stack ?? String(error));
    await page.screenshot({ path: path.join(reportDirectory, `${profile.id}-${locale}-failure.png`), fullPage: true }).catch(() => {});
  } finally { await context.close(); }
  return row;
}

const reportDirectory = path.join(root, 'results/qa', `rail-submit-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`);
await fs.mkdir(reportDirectory, { recursive: true });
const report = {
  version: 1, startedAt: new Date().toISOString(),
  method: 'Real production app/input/update functions with fixed QA-only rail prerequisites. Dedicated temporary localhost server, fresh browser contexts, isolated saves, Toy disabled and external requests blocked. Chromium desktop/touch and 200% computed font simulations; controlled browser clock and synthetic blur are not native-device performance evidence.',
  sourceHashes: await sources(), rows: [], errors: [],
};
let server, browser;
try {
  // Compile immediately before this bounded run, then reject any source change.
  await promisify(execFile)(process.execPath, ['node_modules/vite/bin/vite.js', 'build', 'tests/qa/rail-submit', '--config', 'tests/qa/rail-submit/vite.config.ts'], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
  assert.deepEqual(changedFiles(report.sourceHashes, await sources()), [], 'Source changed while building the fixture');
  report.distHashes = await fileHashes(root, [path.join(fixtureRoot, 'dist')]);
  server = http.createServer(fixtureHandler(path.join(fixtureRoot, 'dist'), previewPath));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  for (const profile of profiles) {
    for (const locale of ['en', 'zh-CN']) {
      const row = await runCase(browser, profile, locale, origin, reportDirectory);
      report.rows.push(row);
      console.log(`${row.passed ? 'PASS' : 'FAIL'} ${profile.id} ${locale} (${row.checks.filter(check => check.passed).length}/${row.checks.length})`);
      if (!row.passed) console.error(row.errors.join('\n'));
    }
  }
  assert.deepEqual(changedFiles(report.sourceHashes, await sources()), [], 'Source changed during browser checks');
} catch (error) { report.errors.push(error.stack ?? String(error)); }
finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  report.completedAt = new Date().toISOString();
  report.passed = !report.errors.length && report.rows.length === profiles.length * 2 && report.rows.every(row => row.passed);
  await fs.writeFile(path.join(reportDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(path.join(reportDirectory, 'report.json'));
  if (!report.passed) { console.error(report.errors.join('\n')); process.exitCode = 1; }
}
