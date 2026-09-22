import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { changedFiles, fileHashes } from '../preview/build-info.mjs';
import { fixtureHandler, snapshotDocumentScrollStyles } from './runtime.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const fixtureRoot = path.join(root, 'tests/qa/leaderboard');
const previewPath = '/qa/leaderboard/';
const storagePrefix = 'qa-community-seasons-leaderboard-v1:';
const watched = [
  'src/components/leaderboard-dialog.tsx', 'src/components/leaderboard-dialog.css',
  'src/lib/game/leaderboard.ts', 'src/lib/game/toy-sdk.ts', 'src/lib/game/ranked-run.ts',
  'src/components/ui/dialog.tsx', 'src/components/ui/button.tsx', 'src/lib/utils.ts',
  'src/app/globals.css', 'tests/qa/leaderboard', 'tests/qa/web/leaderboard.mjs',
  'tests/qa/web/runtime.mjs', 'tests/qa/preview/storage.mjs',
  'package.json', 'package-lock.json', 'src/package.json', 'src/package-lock.json',
];
const sources = () => fileHashes(root, watched.map(file => path.join(root, file)));
const profiles = [
  { id: 'desktop', width: 1280, height: 900 },
  { id: 'small-phone', width: 320, height: 568 },
  { id: 'small-phone-text-200', width: 320, height: 568, textScale: 2 },
];

async function runCase(browser, engine, profile, locale, origin, reportDirectory) {
  const row = { engine, profile: profile.id, locale, passed: false, checks: [], errors: [], blockedRequests: [] };
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
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
    const url = route.request().url();
    if (url === 'https://i0.hdslb.com/bfs/face/leaderboard-qa.png' || url === 'https://i0.hdslb.com/bfs/face/leaderboard-qa-recovered.png') {
      await route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') });
    } else if (url === 'https://i0.hdslb.com/bfs/face/leaderboard-qa-missing.png') {
      await route.fulfill({ status: 404, body: '' });
    } else if (new URL(url).origin !== origin) {
      row.blockedRequests.push(route.request().url());
      await route.abort();
    } else await route.continue();
  });
  const text = (en, zh) => locale === 'en' ? en : zh;
  const snapshot = () => page.evaluate(() => window.__leaderboardQA.snapshot());
  const waitReady = () => page.waitForFunction(() => document.querySelector('.leaderboard-table'));
  const open = async () => {
    await page.locator('#leaderboard-launcher').click();
    await page.locator('.leaderboard-title').waitFor();
  };
  const close = async () => {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.leaderboard-dialog') && !document.querySelector('[data-slot="dialog-overlay"]'));
    await page.waitForFunction(() => document.activeElement?.id === 'leaderboard-launcher');
  };
  const requestAfter = async action => {
    const count = (await snapshot()).requests.length;
    await action();
    await page.waitForFunction(count => window.__leaderboardQA.snapshot().requests.length > count, count);
    return (await snapshot()).requests.at(-1).id;
  };
  const settleLoad = (id, score) => page.evaluate(({ id, score }) => window.__leaderboardQA.settleLoad(id, score), { id, score });
  const check = async (id, fn) => {
    const entry = { id, passed: false };
    row.checks.push(entry);
    await fn(entry);
    entry.passed = true;
  };
  try {
    await page.goto(origin + previewPath);
    await page.locator('#leaderboard-launcher').waitFor();
    const baseline = await page.evaluate(snapshotDocumentScrollStyles);
    await open();
    await waitReady();
    await page.locator('.leaderboard-dialog').evaluate(async dialog => {
      await Promise.all(dialog.getAnimations().map(animation => animation.finished.catch(() => {})));
    });
    await check('public-profiles-default-week-read-only-view', async () => {
      assert.equal(await page.locator('input[value="week"]').isChecked(), true);
      assert.equal(await page.locator('.leaderboard-player-name').first().innerText(), 'Toy Runner');
      assert.equal(await page.locator('.leaderboard-player-name').nth(1).innerText(), '<img src=x onerror="window.profileInjected=true">');
      assert.equal(await page.locator('.leaderboard-player-name').nth(2).innerText(), text('Player', '玩家'));
      assert.equal(await page.locator('.leaderboard-dialog a, .leaderboard-player-name img, .leaderboard-dialog input[type=checkbox]').count(), 0);
      assert.equal(await page.evaluate(() => window.profileInjected), undefined);
      assert.equal(await page.locator('.leaderboard-self-row').count(), 0, 'No self identity inferred from matching score');
      const avatar = page.locator('.leaderboard-avatar img').first();
      assert.equal(await avatar.getAttribute('referrerpolicy'), 'no-referrer');
      assert.equal(await avatar.getAttribute('loading'), 'lazy');
      assert.equal(await avatar.getAttribute('decoding'), 'async');
      assert.equal(await avatar.getAttribute('width'), '32');
      assert.equal(await avatar.getAttribute('height'), '32');
      assert.equal(await page.locator('img[src^="javascript:"]').count(), 0);
      await page.locator('.leaderboard-table tbody tr').nth(2).scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelectorAll('.leaderboard-avatar svg').length === 3);
      await page.locator('.leaderboard-dialog').evaluate(dialog => { dialog.scrollTop = 0; });
      assert.equal((await snapshot()).submissionCount, 0);
      assert.equal(await page.locator('.leaderboard-submit').count(), 0);
      assert.equal(await page.locator('.leaderboard-join').count(), 1);
      assert.equal(await page.locator('.leaderboard-title').evaluate(element => document.activeElement === element), true);
      assert.ok((await page.locator('#leaderboard-privacy-note').innerText()).includes(text('nickname, avatar and score public', '昵称、头像和成绩会在本排行榜公开显示')));
      assert.ok((await page.locator('#leaderboard-optout-note').innerText()).includes(text('does not remove scores already posted', '不会删除已发布的成绩')));
      assert.ok((await page.locator('#leaderboard-consent-note').innerText()).includes(text('synced across devices', '设备间同步')));
    });
    await check('responsive-and-enlarged-text', async entry => {
      if (profile.textScale) {
        entry.text = await page.locator('.leaderboard-dialog').evaluate((dialog, scale) => {
          const elements = [dialog, ...dialog.querySelectorAll('*')];
          const sizes = elements.map(element => ({ element, size: parseFloat(getComputedStyle(element).fontSize), line: getComputedStyle(element).lineHeight }));
          for (const { element, size, line } of sizes) {
            element.style.transition = 'none';
            element.style.fontSize = `${size * scale}px`;
            if (line.endsWith('px')) element.style.lineHeight = `${parseFloat(line) * scale}px`;
          }
          return sizes.map(({ element, size }) => ({ expected: size * scale, actual: parseFloat(getComputedStyle(element).fontSize) }));
        }, profile.textScale);
        assert.ok(entry.text.every(({ actual, expected }) => Math.abs(actual - expected) < .05));
      }
      const layout = await page.locator('.leaderboard-dialog').evaluate(dialog => ({
        width: dialog.clientWidth, scrollWidth: dialog.scrollWidth,
        left: dialog.getBoundingClientRect().left, right: dialog.getBoundingClientRect().right,
        viewport: innerWidth, height: dialog.getBoundingClientRect().height, viewportHeight: innerHeight,
      }));
      entry.layout = layout;
      assert.ok(layout.scrollWidth <= layout.width + 1, 'Dialog has no horizontal overflow');
      assert.ok(layout.left >= 0 && layout.right <= layout.viewport + 1 && layout.height <= layout.viewportHeight, 'Dialog fits viewport');
      entry.targets = [];
      for (const selector of ['.leaderboard-close', '.leaderboard-refresh', '.leaderboard-join', '.leaderboard-defer']) {
        const button = page.locator(selector);
        await button.scrollIntoViewIfNeeded();
        const target = await button.evaluate(element => {
          const box = element.getBoundingClientRect();
          const x = (box.left + box.right) / 2, y = (box.top + box.bottom) / 2;
          const hit = document.elementFromPoint(x, y);
          return { width: box.width, height: box.height, reached: element === hit || element.contains(hit) };
        });
        entry.targets.push({ selector, ...target });
        assert.ok(target.width >= 43.99 && target.height >= 43.99 && target.reached, `Control must be reachable: ${selector}`);
      }
      await page.locator('.leaderboard-dialog').evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: path.join(reportDirectory, `${engine}-${profile.id}-${locale}.png`) });
    });
    await check('escape-restores-focus-and-scroll', async () => {
      await close();
      await page.waitForFunction(expected => ['html', 'body'].every((name) => {
        const element = name === 'html' ? document.documentElement : document.body;
        return element.style.overflowX === expected[name].overflowX && element.style.overflowY === expected[name].overflowY;
      }), baseline);
      await open();
      await waitReady();
    });
    for (const trigger of ['refresh', 'period-switch']) await check(`avatar-recovers-after-failed-image-on-${trigger}`, async () => {
      const before = await snapshot();
      const firstAvatar = page.locator('.leaderboard-table tbody tr').first().locator('.leaderboard-avatar');
      const reload = async phase => {
        if (trigger === 'refresh') await page.locator('.leaderboard-refresh').click();
        else await page.locator(`input[value="${phase === 'failed' ? 'day' : 'week'}"]`).check();
        await waitReady();
        await firstAvatar.scrollIntoViewIfNeeded();
      };
      await page.evaluate(() => window.__leaderboardQA.setAvatarSource('https://i0.hdslb.com/bfs/face/leaderboard-qa-missing.png'));
      await reload('failed');
      await firstAvatar.locator('svg').waitFor();
      assert.equal(await firstAvatar.locator('img').count(), 0, 'A real 404 must reach the fallback before testing recovery');
      const replacement = trigger === 'refresh'
        ? 'https://i0.hdslb.com/bfs/face/leaderboard-qa-recovered.png'
        : 'https://i0.hdslb.com/bfs/face/leaderboard-qa.png';
      await page.evaluate(source => window.__leaderboardQA.setAvatarSource(source), replacement);
      await reload('recovered');
      await page.waitForFunction(source => {
        const img = document.querySelector('.leaderboard-table tbody tr .leaderboard-avatar img');
        return img?.getAttribute('src') === source && img.complete && img.naturalWidth > 0;
      }, replacement);
      assert.equal(await firstAvatar.locator('svg').count(), 0, 'The new image replaces the error fallback');
      assert.equal(await page.locator('.leaderboard-player-name').first().innerText(), 'Toy Runner');
      const after = await snapshot();
      assert.equal(after.submissionCount, before.submissionCount);
      assert.equal(after.choiceWrites, before.choiceWrites);
    });
    await check('preconsent-reading-and-not-now-never-submit', async () => {
      await page.evaluate(() => window.__leaderboardQA.finishRun());
      await page.locator('input[value="day"]').check();
      await waitReady();
      await page.locator('input[value="week"]').check();
      await waitReady();
      await page.locator('.leaderboard-refresh').click();
      await waitReady();
      assert.equal((await snapshot()).submissionCount, 0);
      assert.equal((await snapshot()).choiceWrites, 0, 'Viewing must not write a cloud preference');
      await page.locator('.leaderboard-defer').click();
      await page.waitForFunction(() => !document.querySelector('.leaderboard-dialog') && document.activeElement?.id === 'leaderboard-launcher');
      assert.equal((await snapshot()).submissionCount, 0);
      assert.equal((await snapshot()).preference, 'disabled');
      assert.equal((await snapshot()).choiceWrites, 1, 'Not now saves an explicit cloud opt-out');
      await open();
      await waitReady();
    });
    await check('one-time-explicit-join-once-and-score-refresh', async () => {
      await page.locator('.leaderboard-join').evaluate(button => { button.click(); button.click(); });
      await page.getByText(text('Submitting your completed run…', '正在提交本局成绩…'), { exact: true }).waitFor();
      assert.equal((await snapshot()).submissionCount, 1);
      assert.equal((await snapshot()).consented, false, 'Choice must wait for successful platform consent');
      await requestAfter(() => page.evaluate(() => window.__leaderboardQA.settleSubmission('success')));
      await page.locator('.leaderboard-success').waitFor();
      assert.equal(await page.locator('.leaderboard-join').count(), 0);
      assert.equal((await snapshot()).consented, true);
      assert.equal((await snapshot()).submissionCount, 1);
    });
    await check('consented-parent-completion-auto-status-and-score-refresh', async () => {
      await close();
      await page.evaluate(() => { window.__leaderboardQA.newRun(); window.__leaderboardQA.finishRun(); });
      await open();
      await page.getByText(text('Submitting your completed run…', '正在提交本局成绩…'), { exact: true }).waitFor();
      assert.equal(await page.locator('.leaderboard-join').count(), 0);
      assert.equal(await page.locator('.leaderboard-defer').isEnabled(), true);
      assert.equal((await snapshot()).submissionCount, 2);
      await requestAfter(() => page.evaluate(() => window.__leaderboardQA.settleSubmission('success')));
      await page.locator('.leaderboard-success').waitFor();
      assert.equal(await page.locator('.leaderboard-submit').count(), 0);
      assert.equal((await snapshot()).submissionCount, 2);
    });
    for (const outcome of ['decline', 'error']) await check(`explicit-${outcome}-allows-later-explicit-join`, async () => {
      await close();
      const previous = (await snapshot()).submissionCount;
      await page.evaluate(() => { window.__leaderboardQA.configure({ consented: false }); window.__leaderboardQA.newRun(); window.__leaderboardQA.finishRun(); });
      await open();
      assert.equal((await snapshot()).submissionCount, previous);
      await page.locator('.leaderboard-join').click();
      await page.evaluate(outcome => window.__leaderboardQA.settleSubmission(outcome), outcome);
      await page.getByText(outcome === 'decline'
        ? text('Permission was declined, so this score was not submitted. Your progress is saved locally. You can choose to join later.', '你未同意授权，因此本局成绩没有提交。进度已保存在本机，你可以稍后再选择参与。')
        : text('This score could not be submitted. Your progress is saved locally. Check your connection and Bilibili sign-in, then choose to join again when you are ready.', '本局成绩暂时无法提交，进度已保存在本机。请检查网络及哔哩哔哩登录状态，你可以稍后再选择参与。'), { exact: true }).waitFor();
      assert.equal((await snapshot()).consented, false);
      assert.equal(await page.locator('.leaderboard-join').isEnabled(), true);
      await page.locator('.leaderboard-refresh').click();
      await waitReady();
      assert.equal((await snapshot()).submissionCount, previous + 1, 'Reading the board cannot retry submission');
      await page.locator('.leaderboard-join').click();
      await page.evaluate(() => window.__leaderboardQA.settleSubmission('success'));
      await page.locator('.leaderboard-success').waitFor();
      assert.equal((await snapshot()).submissionCount, previous + 2);
      assert.equal((await snapshot()).consented, true);
    });
    await check('uncertain-submission-lockout', async () => {
      await close();
      await page.evaluate(() => { window.__leaderboardQA.configure({ consented: false }); window.__leaderboardQA.newRun(); window.__leaderboardQA.finishRun(); });
      await open();
      await page.locator('.leaderboard-join').click();
      await page.evaluate(() => window.__leaderboardQA.settleSubmission('uncertain'));
      await page.getByText(text('Submission could not be confirmed. Refresh the scores to check your rank. This run will not be submitted again.', '暂时无法确认提交结果。请刷新成绩查看排名，本局不会重复提交。'), { exact: true }).waitFor();
      assert.equal(await page.locator('.leaderboard-join').count(), 0);
      await page.locator('.leaderboard-refresh').click();
      await waitReady();
      assert.equal((await snapshot()).submissionCount, 7);
    });
    await check('failed-auto-submission-keeps-local-progress', async () => {
      await page.evaluate(() => { window.__leaderboardQA.configure({ consented: true }); window.__leaderboardQA.newRun(); window.__leaderboardQA.finishRun(); window.__leaderboardQA.settleSubmission('error'); });
      await page.getByText(text('This score could not be submitted. Your progress is saved locally. Check your connection and Bilibili sign-in; a new run can try again.', '本局成绩暂时无法提交，进度已保存在本机。请检查网络及哔哩哔哩登录状态，新的一局结束后可再次尝试。'), { exact: true }).waitFor();
      assert.equal(await page.locator('.leaderboard-join').count(), 0);
      assert.equal(await page.locator('.leaderboard-defer').isEnabled(), true);
      assert.equal((await snapshot()).submissionCount, 8);
    });
    await check('period-response-race', async () => {
      await page.evaluate(() => window.__leaderboardQA.holdLoads(true));
      const day = await requestAfter(() => page.locator('input[value="day"]').check());
      const week = await requestAfter(() => page.locator('input[value="week"]').check());
      await settleLoad(week, 999);
      await waitReady();
      await settleLoad(day, 888);
      assert.equal(await page.locator('.leaderboard-table tbody tr').first().locator('td').last().innerText(), '999');
      assert.equal(await page.locator('input[value="week"]').isChecked(), true);
      assert.equal((await snapshot()).submissionCount, 8, 'Period changes only read scores');
    });
    await check('load-error-retry-and-empty-state', async () => {
      const failed = await requestAfter(() => page.locator('.leaderboard-refresh').click());
      await settleLoad(failed, null);
      await page.locator('.leaderboard-results .leaderboard-error').waitFor();
      const empty = await requestAfter(() => page.locator('.leaderboard-results .leaderboard-retry').click());
      await page.evaluate(id => window.__leaderboardQA.emptyLoad(id), empty);
      await page.locator('.leaderboard-empty').waitFor();
      assert.equal(await page.locator('.leaderboard-table').count(), 0);
      assert.ok((await page.locator('.leaderboard-own-position').innerText()).includes(text('No rank available', '暂无排名')));
      await page.evaluate(() => window.__leaderboardQA.holdLoads(false));
      assert.equal((await snapshot()).submissionCount, 8, 'Read retry and refresh never submit');
    });
    for (const outcome of ['success', 'error']) await check(`late-${outcome}-after-new-run-same-score`, async () => {
      await close();
      await page.evaluate(() => { window.__leaderboardQA.newRun(); window.__leaderboardQA.finishRun(); });
      await open();
      await page.getByText(text('Submitting your completed run…', '正在提交本局成绩…'), { exact: true }).waitFor();
      await close();
      await page.evaluate(() => window.__leaderboardQA.newRun());
      await open();
      await page.evaluate(outcome => window.__leaderboardQA.settleSubmission(outcome), outcome);
      await page.getByText(text('Only new, completed runs are eligible. Finish a fresh run to take part.', '仅限本次游玩中完成的新成绩。完成新的一局后即可参与。'), { exact: true }).waitFor();
      assert.equal(await page.locator('.leaderboard-success').count(), 0);
      assert.equal(await page.locator('.leaderboard-join').count(), 0);
      assert.equal(await page.locator('.leaderboard-defer').isEnabled(), true);
      assert.equal((await snapshot()).eligibility, 'ready');
    });
    await check('late-explicit-decline-does-not-mark-new-run', async () => {
      await close();
      await page.evaluate(() => { window.__leaderboardQA.configure({ consented: false }); window.__leaderboardQA.newRun(); });
      await open();
      await page.locator('.leaderboard-join').click();
      await close();
      await page.evaluate(() => window.__leaderboardQA.newRun());
      await open();
      await page.evaluate(() => window.__leaderboardQA.settleSubmission('decline'));
      await page.waitForFunction(() => document.querySelector('.leaderboard-join')?.disabled === false);
      assert.equal((await snapshot()).eligibility, 'ready');
      assert.equal((await snapshot()).consented, false);
      assert.equal(await page.locator('.leaderboard-post .leaderboard-error').count(), 0);
    });
    await check('no-join-without-an-eligible-fresh-score', async () => {
      await page.evaluate(() => window.__leaderboardQA.configure({ score: null, eligibility: 'unavailable' }));
      assert.equal(await page.locator('.leaderboard-join').count(), 0);
      await page.evaluate(() => window.__leaderboardQA.configure({ score: 12345, eligibility: 'invalid' }));
      await page.getByText(text('This run could not pass the score checks. Start a new run to try again.', '本局未通过成绩检查。重新开始一局后再试吧。'), { exact: true }).waitFor();
      assert.equal(await page.locator('.leaderboard-join').count(), 0);
    });
    await check('cloud-choice-checking-and-unavailable-never-auto-submit', async () => {
      const previous = (await snapshot()).submissionCount;
      await page.evaluate(() => window.__leaderboardQA.configure({ score: 12345, eligibility: 'ready', preference: 'checking', consented: false }));
      await page.getByText(text('Checking your Bilibili leaderboard choice…', '正在读取哔哩哔哩账号的排行参与选择…'), { exact: true }).waitFor();
      assert.equal(await page.locator('.leaderboard-join').count(), 0);
      await page.evaluate(() => { window.__leaderboardQA.configure({ preference: 'unavailable' }); window.__leaderboardQA.newRun(); window.__leaderboardQA.finishRun(); });
      await page.getByText(text('Your leaderboard choice could not sync with Bilibili. Automatic submissions stay off here. Retry saving your choice to sync it across devices.', '暂时无法同步哔哩哔哩账号的排行参与选择，本次游玩不会自动提交。请重试保存选择，以同步至其他设备。'), { exact: true }).waitFor();
      assert.equal((await snapshot()).submissionCount, previous);
      assert.equal(await page.locator('.leaderboard-join').isEnabled(), true);
    });
    await check('not-now-cloud-failure-stays-open-until-saved', async () => {
      const previous = (await snapshot()).submissionCount;
      await page.evaluate(() => window.__leaderboardQA.failChoice(true));
      await page.locator('.leaderboard-defer').click();
      await page.waitForFunction(() => document.querySelector('.leaderboard-defer')?.disabled === false);
      assert.equal(await page.locator('.leaderboard-dialog').count(), 1);
      assert.equal((await snapshot()).preference, 'unavailable');
      assert.equal((await snapshot()).submissionCount, previous);
      await page.evaluate(() => window.__leaderboardQA.failChoice(false));
      await page.locator('.leaderboard-defer').click();
      await page.waitForFunction(() => !document.querySelector('.leaderboard-dialog') && document.activeElement?.id === 'leaderboard-launcher');
      assert.equal((await snapshot()).preference, 'disabled');
      await open();
      await waitReady();
    });
    await check('score-posted-cloud-choice-retry-never-reposts-score', async () => {
      const previous = (await snapshot()).submissionCount;
      await page.evaluate(() => window.__leaderboardQA.failChoice(true));
      await page.locator('.leaderboard-join').click();
      await page.evaluate(() => window.__leaderboardQA.settleSubmission('success'));
      await page.getByText(text('Score posted, but your choice could not sync. Automatic posting stays off until your choice is saved.', '成绩已提交，但参与选择未能同步。成功保存选择前，自动提交会保持关闭。'), { exact: true }).waitFor();
      assert.equal((await snapshot()).consented, false);
      assert.equal((await snapshot()).preference, 'unavailable');
      assert.equal((await snapshot()).submissionCount, previous + 1);
      assert.equal(await page.locator('.leaderboard-join').innerText(), text('Save leaderboard choice', '保存排行参与选择'));
      await page.evaluate(() => window.__leaderboardQA.failChoice(false));
      await page.locator('.leaderboard-join').click();
      await page.waitForFunction(() => window.__leaderboardQA.snapshot().consented === true);
      assert.equal((await snapshot()).submissionCount, previous + 1);
      assert.equal((await snapshot()).preference, 'enabled');
      assert.equal(await page.locator('.leaderboard-join').count(), 0);
    });
    for (const state of ['no-run', 'pending', 'uncertain', 'checking', 'unavailable']) await check(`optout-independent-of-${state}`, async () => {
      const previous = (await snapshot()).submissionCount;
      await page.evaluate(state => window.__leaderboardQA.configure({
        consented: state !== 'checking' && state !== 'unavailable',
        preference: state === 'checking' || state === 'unavailable' ? state : 'enabled',
        score: state === 'no-run' ? null : 12345,
        eligibility: state === 'pending' || state === 'uncertain' ? state : 'unavailable',
      }), state);
      const stop = page.getByRole('button', { name: text('Stop future submissions', '停止提交后续成绩'), exact: true });
      assert.equal(await stop.isEnabled(), true);
      await stop.click();
      await page.waitForFunction(() => !document.querySelector('.leaderboard-dialog') && document.activeElement?.id === 'leaderboard-launcher');
      assert.equal((await snapshot()).preference, 'disabled');
      assert.equal((await snapshot()).consented, false);
      await page.evaluate(() => { window.__leaderboardQA.newRun(); window.__leaderboardQA.finishRun(); });
      assert.equal((await snapshot()).submissionCount, previous, 'Optout keeps later fresh runs local');
      await open();
      await waitReady();
    });
    await check('optout-cloud-failure-remains-local-off-and-retryable', async () => {
      const previous = (await snapshot()).submissionCount;
      await page.evaluate(() => { window.__leaderboardQA.configure({ consented: true, score: null, eligibility: 'unavailable' }); window.__leaderboardQA.failChoice(true); });
      await page.locator('.leaderboard-defer').click();
      await page.waitForFunction(() => window.__leaderboardQA.snapshot().preference === 'unavailable');
      assert.equal((await snapshot()).consented, false);
      assert.equal(await page.locator('.leaderboard-dialog').count(), 1);
      assert.equal(await page.locator('.leaderboard-defer').isEnabled(), true);
      assert.ok((await page.locator('.leaderboard-post').innerText()).includes(text('Automatic submissions stay off here', '本次游玩不会自动提交')));
      await page.evaluate(() => { window.__leaderboardQA.newRun(); window.__leaderboardQA.finishRun(); });
      assert.equal((await snapshot()).submissionCount, previous);
      await page.evaluate(() => window.__leaderboardQA.failChoice(false));
      await page.locator('.leaderboard-defer').click();
      await page.waitForFunction(() => !document.querySelector('.leaderboard-dialog'));
      await open();
      await waitReady();
    });
    await check('optout-during-explicit-join-prevents-late-reenable', async () => {
      await page.evaluate(() => { window.__leaderboardQA.configure({ consented: false }); window.__leaderboardQA.newRun(); });
      await page.locator('.leaderboard-join').click();
      await page.getByText(text('Submitting your completed run…', '正在提交本局成绩…'), { exact: true }).waitFor();
      const stop = page.getByRole('button', { name: text('Stop future submissions', '停止提交后续成绩'), exact: true });
      assert.equal(await stop.isEnabled(), true);
      await stop.click();
      await page.waitForFunction(() => !document.querySelector('.leaderboard-dialog'));
      await page.evaluate(() => window.__leaderboardQA.settleSubmission('success'));
      assert.equal((await snapshot()).consented, false);
      assert.equal((await snapshot()).preference, 'disabled');
      await open();
      await waitReady();
    });
    await check('standalone-graceful-unavailability', async () => {
      const requests = (await snapshot()).requests.length;
      await page.evaluate(() => window.__leaderboardQA.configure({ available: false }));
      await page.getByText(text('Open the game on Toy to view the leaderboard. Sign in to Bilibili and finish a new run there to choose whether to join. You can keep playing here and saving your personal best on this device.', '在 Toy 中打开游戏即可查看排行榜，登录哔哩哔哩并完成新的一局后，可选择是否参与。你仍可在这里游玩，并在本机保存个人最高分。'), { exact: true }).waitFor();
      assert.equal(await page.locator('.leaderboard-submit, .leaderboard-table').count(), 0);
      assert.equal((await snapshot()).requests.length, requests);
    });
    row.storage = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    assert.equal(row.storage['community-seasons-best'], '918273645');
    assert.equal(row.storage['qa-unrelated-sentinel'], 'preserve-this-value');
    assert.equal(row.storage[storagePrefix + 'community-seasons-qa-fixture'], 'leaderboard');
    assert.deepEqual(row.blockedRequests, []);
    assert.deepEqual(row.errors, []);
    row.passed = true;
  } catch (error) {
    row.errors.push(error.stack ?? String(error));
    await page.screenshot({ path: path.join(reportDirectory, `${engine}-${profile.id}-${locale}-failure.png`) }).catch(() => {});
  } finally { await context.close(); }
  return row;
}

const reportDirectory = path.join(root, 'results/qa', `leaderboard-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`);
await fs.mkdir(reportDirectory, { recursive: true });
const report = {
  version: 1, startedAt: new Date().toISOString(),
  method: 'Production leaderboard component and Base UI dialog with fixture-only async responses. Dedicated localhost server, fresh isolated saves, no Toy SDK. Avatar requests are fulfilled with local test bytes; all other external requests are blocked. Chromium/WebKit desktop, touch and 200% text are browser simulations, not native-device performance measurements.',
  sourceHashes: await sources(), rows: [], errors: [],
};
let server;
try {
  await promisify(execFile)(process.execPath, ['node_modules/vite/bin/vite.js', 'build', 'tests/qa/leaderboard', '--config', 'tests/qa/leaderboard/vite.config.ts'], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
  assert.deepEqual(changedFiles(report.sourceHashes, await sources()), [], 'Source changed while building the fixture');
  report.distHashes = await fileHashes(root, [path.join(fixtureRoot, 'dist')]);
  server = http.createServer(fixtureHandler(path.join(fixtureRoot, 'dist'), previewPath));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [engine, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await launcher.launch({ headless: true });
    try {
      for (const profile of profiles) for (const locale of ['en', 'zh-CN']) {
        const row = await runCase(browser, engine, profile, locale, origin, reportDirectory);
        report.rows.push(row);
        console.log(`${row.passed ? 'PASS' : 'FAIL'} ${engine} ${profile.id} ${locale} (${row.checks.filter(check => check.passed).length}/${row.checks.length})`);
        if (!row.passed) console.error(row.errors.join('\n'));
      }
    } finally { await browser.close(); }
  }
  assert.deepEqual(changedFiles(report.sourceHashes, await sources()), [], 'Source changed during browser checks');
} catch (error) { report.errors.push(error.stack ?? String(error)); }
finally {
  if (server) await new Promise(resolve => server.close(resolve));
  report.completedAt = new Date().toISOString();
  report.passed = !report.errors.length && report.rows.length === profiles.length * 4 && report.rows.every(row => row.passed);
  await fs.writeFile(path.join(reportDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(path.join(reportDirectory, 'report.json'));
  if (!report.passed) { console.error(report.errors.join('\n')); process.exitCode = 1; }
}
