import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';
import { fixtureHandler, initializeBrowserEmulation } from './runtime.mjs';
import { assertPreviewBuildIsCurrent } from '../preview/build-info.mjs';
import { freezeClockAtCurrentTime } from './clock.mjs';

// Dedicated fixture origin + fresh contexts + mapped saves + disabled Toy SDK.
// This is browser functional/layout evidence, not native phone performance.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const previewDist = path.join(root, 'tests/qa/preview/dist');
const previewPath = '/qa/community-seasons/';
const prefix = 'qa-community-seasons-v1:';
const reportDir = path.join(root, 'results/qa', `skins-${Date.now()}`);
await fs.mkdir(reportDir, { recursive: true });
await assertPreviewBuildIsCurrent(root, previewDist);
const server = http.createServer(fixtureHandler(previewDist, previewPath));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const legacy = {
  version: 1, wallet: 6000,
  inventory: { shield: 0, headstart: 0, portal: 0, doubleCoins: 0 },
  skills: { shield: { unlocked: false }, magnet: { unlocked: false }, rush: { unlocked: false } },
  levels: { shield: 1, magnet: 1, rush: 1, headstart: 1, doubleCoins: 1, portal: 1 },
  equippedSkill: null, portalDestination: null,
};
const profiles = [
  { name: 'desktop', browser: chromium, options: { viewport: { width: 1280, height: 900 } } },
  { name: 'android', browser: chromium, options: devices['Pixel 7'] },
  { name: 'ios', browser: webkit, options: devices['iPhone 13'] },
];
const results = [];
try {
  for (const profile of profiles) {
    const browser = await profile.browser.launch({ headless: true });
    try {
      for (const locale of ['en', 'zh-CN']) {
        const context = await browser.newContext({ ...profile.options, locale, reducedMotion: profile.name === 'desktop' ? 'reduce' : 'no-preference' });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        page.setDefaultTimeout(15000);
        await page.clock.install();
        await context.addInitScript(initializeBrowserEmulation, { platform: profile.name, entries: {} });
        await context.addInitScript(({ prefix, legacy, locale }) => {
          // Seed once so reloads exercise persistence rather than resetting it.
          if (!localStorage.getItem(`${prefix}community-seasons-progress-v1`)) {
            localStorage.setItem(`${prefix}community-seasons-progress-v1`, JSON.stringify(legacy));
            localStorage.setItem(`${prefix}community-seasons-locale`, locale);
            localStorage.setItem(`${prefix}community-seasons-controls-seen`, '1');
            localStorage.setItem('community-seasons-progress-v1', 'untouched-player-sentinel');
          }
        }, { prefix, legacy, locale });
        const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('community-seasons-progress-v1')));
        const live = () => page.evaluate(() => window.__communitySeasonsQA.inputs.snapshot());
        const card = id => page.locator(`.skin-card[aria-labelledby="skin-name-${id}"]`);
        const activate = locator => profile.name === 'desktop' ? locator.click() : locator.tap();
        const openSkins = async () => {
          await page.keyboard.press('b');
          await page.locator('.store-dialog').waitFor();
          const tab = page.locator('.store-tab-list').getByRole('tab', { name: locale === 'en' ? 'Skins' : '皮肤', exact: true });
          if (profile.name === 'desktop') {
            await page.locator('.store-tab-list').getByRole('tab', { name: locale === 'en' ? 'Boosters' : '道具', exact: true }).focus();
            await page.keyboard.press('ArrowRight');
            await page.keyboard.press('ArrowRight');
            await page.keyboard.press('Enter');
          } else await activate(tab);
          await page.clock.runFor(250);
          await page.locator('.skin-card').first().waitFor();
          assert.equal(await tab.getAttribute('aria-selected'), 'true');
          assert.equal(await page.getByRole('tabpanel').count(), 2, 'only the outer Skins panel and current category remain');
        };
        const categoryNames = locale === 'en'
          ? { body: 'Body', hat: 'Hats', shoes: 'Shoes', effect: 'Effects' }
          : { body: '机身', hat: '帽子', shoes: '鞋子', effect: '特效' };
        const selectCategory = async category => {
          const tab = page.locator('.outfit-category-list').getByRole('tab', { name: categoryNames[category], exact: true });
          await activate(tab);
          await page.clock.runFor(250);
          assert.equal(await tab.getAttribute('aria-selected'), 'true');
          assert.equal(await page.locator('.skin-card').count(), category === 'body' ? 5 : 4);
          assert.equal(await page.getByRole('tabpanel').count(), 2);
        };
        const enlargeText = async () => page.locator('.store-dialog').evaluate(dialog => {
          const samples = [...dialog.querySelectorAll('*')].filter(element => !element.dataset.qaEnlarged).map(element => {
            const style = getComputedStyle(element);
            return { element, size: parseFloat(style.fontSize), height: style.lineHeight };
          });
          for (const { element, size, height } of samples) {
            element.dataset.qaEnlarged = 'true';
            element.style.setProperty('transition', 'none', 'important');
            element.style.setProperty('font-size', `${size * 2}px`, 'important');
            element.style.setProperty('line-height', height === 'normal' ? 'normal' : `${parseFloat(height) * 2}px`, 'important');
          }
          for (const { element, size } of samples) {
            if (Math.abs(parseFloat(getComputedStyle(element).fontSize) - size * 2) > .1)
              throw Error('Enlarged-text scaling did not apply.');
          }
        });
        const assertFits = async () => {
          const overflow = await page.locator('.store-dialog, .skin-card, .skin-action, .store-tab-list, .outfit-category-list, .outfit-summary').evaluateAll(nodes => nodes.map(node => ({ name: node.className, extra: node.scrollWidth - node.clientWidth })));
          assert.ok(overflow.every(row => row.extra <= 1), JSON.stringify(overflow));
          const clippedPrices = await page.locator('.skin-action > span + span').evaluateAll(nodes => nodes.flatMap(node => {
            const price = node.getBoundingClientRect(), button = node.parentElement.getBoundingClientRect();
            return price.left < button.left - 1 || price.right > button.right + 1
              ? [{ price: node.textContent, left: price.left - button.left, right: price.right - button.right }] : [];
          }));
          assert.deepEqual(clippedPrices, [], 'coin prices fit inside their purchase buttons');
          return overflow;
        };
        const closeStore = async () => {
          await page.keyboard.press('Escape');
          await page.clock.runFor(250);
          await page.locator('.store-dialog').waitFor({ state: 'detached' });
        };
        const finishWarmup = async () => {
          await page.locator('.render-warmup-screen').waitFor({ state: 'detached', timeout: 45000 });
          assert.equal(await page.locator('main.game-shell').evaluate(main => main.inert), false,
            'The completed loading screen must unlock the game before time freezes');
        };
        try {
          await page.goto(origin + previewPath);
          await page.waitForFunction(expected => document.documentElement.lang === expected, locale);
          await page.locator('.start-store').waitFor();
          assert.equal(await page.evaluate(() => window.__communitySeasonsQA.cloud), 'disabled');
          await finishWarmup();
          await freezeClockAtCurrentTime(page);
          await page.clock.runFor(100);
          assert.equal((await live()).skin, 'classic', 'legacy saves start with classic TV');
          assert.deepEqual((await live()).outfit, { hat: null, shoes: null, effect: null }, 'legacy saves start with default accessories');
          await openSkins();
          assert.equal(await page.locator('.skin-card').count(), 5);
          assert.equal(await card('classic').locator('button').isDisabled(), true);
          assert.ok(await card('blossom').locator('svg polygon').count() > 20);
          await activate(card('blossom').locator('button'));
          assert.equal((await saved()).wallet, 5000);
          assert.equal((await saved()).equippedSkin, 'blossom');
          assert.equal((await live()).skin, 'blossom');
          assert.equal(await card('blossom').locator('button').isDisabled(), true);
          assert.ok((await page.locator('.store-message').innerText()).includes(locale === 'en' ? 'Blossom TV' : '樱花小电视'));
          await activate(card('ocean').locator('button'));
          assert.equal((await saved()).wallet, 4000);
          await activate(card('blossom').locator('button'));
          assert.equal((await saved()).wallet, 4000, 're-equipping a body skin is free');
          if (profile.name === 'desktop') {
            await page.locator('.outfit-category-list').getByRole('tab', { name: categoryNames.body, exact: true }).focus();
            await page.keyboard.press('ArrowRight');
            await page.keyboard.press('Enter');
            await page.clock.runFor(250);
            assert.equal(await page.locator('.outfit-category-list').getByRole('tab', { name: categoryNames.hat, exact: true }).getAttribute('aria-selected'), 'true');
          } else await selectCategory('hat');
          const outfit = { hat: null, shoes: null, effect: null };
          let wallet = 4000;
          for (const [slot, id, price] of [['hat', 'cap', 500], ['hat', 'crown', 2000], ['shoes', 'sneakers', 600], ['effect', 'sparkles', 900]]) {
            await selectCategory(slot);
            assert.ok((await card(id).locator('button').innerText()).includes(price.toLocaleString(locale)));
            await activate(card(id).locator('button'));
            wallet -= price;
            outfit[slot] = id;
            const progress = await saved();
            assert.equal(progress.wallet, wallet, `${id} costs exactly ${price} coins`);
            assert.equal(progress.equippedSkin, 'blossom', 'accessory purchases retain the body');
            assert.deepEqual(progress.outfit, outfit, 'a purchase changes only its own slot');
            assert.deepEqual((await live()).outfit, outfit);
            assert.equal(await card(id).locator('button').isDisabled(), true);
          }
          const ownedAccessories = ['cap', 'crown', 'sneakers', 'sparkles'];
          assert.deepEqual((await saved()).ownedAccessories, ownedAccessories);
          for (const [slot, id, price] of [['hat', 'sprout', 750], ['shoes', 'boots', 1000], ['shoes', 'skates', 1500], ['effect', 'petals', 1200], ['effect', 'orbit', 2500]]) {
            await selectCategory(slot);
            assert.ok((await card(id).locator('button').innerText()).includes(price.toLocaleString(locale)));
            assert.equal(await card(id).locator('button').isDisabled(), true, 'unowned items cannot be bought without coins');
          }
          await selectCategory('hat');
          await activate(card('cap').locator('button'));
          outfit.hat = 'cap';
          assert.deepEqual((await saved()).outfit, outfit, 'free hat switching keeps shoes and effect');
          for (const slot of ['hat', 'shoes', 'effect']) {
            const equipped = outfit[slot];
            await selectCategory(slot);
            await activate(card(`default-${slot}`).locator('button'));
            outfit[slot] = null;
            assert.deepEqual((await saved()).outfit, outfit, 'default changes only the selected slot');
            assert.deepEqual((await live()).outfit, outfit);
            assert.deepEqual((await saved()).ownedAccessories, ownedAccessories, 'removing an item keeps permanent ownership');
            assert.equal(await card(`default-${slot}`).locator('button').isDisabled(), true);
            await activate(card(equipped).locator('button'));
            outfit[slot] = equipped;
            assert.deepEqual((await saved()).outfit, outfit);
            assert.equal((await saved()).wallet, 0, 'owned and default items switch for free');
          }
          await selectCategory('body');
          assert.equal(await card('amber').locator('button').isDisabled(), true);
          assert.equal(await card('frost').locator('button').isDisabled(), true);
          assert.equal((await live()).skin, 'blossom');
          const summary = page.locator('.outfit-summary');
          const expectedNames = locale === 'en'
            ? ['Blossom TV', 'Trail Cap', 'Canvas Sneakers', 'Sparkle Trail']
            : ['樱花小电视', '旅途鸭舌帽', '帆布运动鞋', '闪光足迹'];
          for (const name of expectedNames) {
            assert.ok((await summary.innerText()).includes(name));
            assert.ok((await summary.locator('svg[role="img"]').getAttribute('aria-label')).includes(name));
          }
          await summary.screenshot({ path: path.join(reportDir, `${profile.name}-${locale}-combined-outfit.png`) });
          const overflow = [];
          for (const category of ['body', 'hat', 'shoes', 'effect']) {
            await selectCategory(category);
            overflow.push({ category, rows: await assertFits() });
            await page.locator('.skin-grid').screenshot({ path: path.join(reportDir, `${profile.name}-${locale}-${category}.png`) });
          }
          if (profile.name !== 'desktop') {
            for (const category of ['body', 'hat', 'shoes', 'effect']) {
              await selectCategory(category);
              await enlargeText();
              overflow.push({ category, enlarged: true, rows: await assertFits() });
              await page.locator('.skin-grid').screenshot({ path: path.join(reportDir, `${profile.name}-${locale}-${category}-large-text.png`) });
            }
            await summary.screenshot({ path: path.join(reportDir, `${profile.name}-${locale}-outfit-large-text.png`) });
          }
          await closeStore();
          // Reload starts a fresh calibration; the installed clock remains
          // paused across navigation unless explicitly resumed first.
          await page.clock.resume();
          await page.reload();
          await page.locator('.start-store').waitFor();
          await finishWarmup();
          await freezeClockAtCurrentTime(page);
          await page.clock.runFor(200);
          assert.equal((await live()).skin, 'blossom', 'saved skin is restored on reload');
          assert.deepEqual((await saved()).ownedSkins, ['classic', 'blossom', 'ocean']);
          assert.deepEqual((await saved()).ownedAccessories, ownedAccessories);
          assert.deepEqual((await live()).outfit, outfit, 'complete outfit is restored on reload');
          await activate(page.locator('.start-screen .run-button'));
          await page.locator('.run-setup-dialog').waitFor();
          await activate(page.locator('.run-setup-footer .run-button'));
          await page.clock.runFor(200);
          assert.equal((await live()).mode, 'running');
          assert.equal((await live()).skin, 'blossom');
          assert.deepEqual((await live()).outfit, outfit, 'new run retains the full outfit');
          await openSkins();
          const paused = await live();
          assert.equal(paused.mode, 'paused');
          await activate(card('classic').locator('button'));
          await page.clock.runFor(200);
          assert.equal((await live()).skin, 'classic', 'skin changes on a paused run');
          assert.deepEqual((await live()).outfit, outfit, 'changing the body preserves accessories');
          await selectCategory('hat');
          await activate(card('crown').locator('button'));
          outfit.hat = 'crown';
          assert.deepEqual((await live()).outfit, outfit, 'outfit changes on a paused run');
          assert.equal((await live()).distance, paused.distance, 'store keeps run paused');
          await closeStore();
          await page.keyboard.press('p');
          await page.clock.runFor(100);
          assert.equal((await live()).mode, 'running');
          assert.equal((await live()).skin, 'classic');
          assert.deepEqual((await live()).outfit, outfit);
          await page.keyboard.press('p');
          await page.clock.runFor(100);
          await activate(page.locator('.restart-button'));
          await page.locator('.run-setup-dialog').waitFor();
          await activate(page.locator('.run-setup-footer .run-button'));
          await page.clock.runFor(200);
          assert.equal((await live()).mode, 'running');
          assert.equal((await live()).skin, 'classic');
          assert.deepEqual((await live()).outfit, outfit, 'restarting preserves the complete outfit');
          await activate(page.locator('.home-button'));
          await page.clock.runFor(200);
          assert.equal((await live()).mode, 'ready');
          assert.deepEqual((await live()).outfit, outfit, 'home preview retains the complete outfit');
          const sentinel = await page.evaluate(() => {
            const key = Object.keys(localStorage).find(key => key === 'community-seasons-progress-v1');
            return key ? localStorage[key] : null;
          });
          assert.equal(sentinel, 'untouched-player-sentinel');
          assert.deepEqual(errors, []);
          results.push({ profile: profile.name, locale, passed: true, overflow });
          console.log(`PASS ${profile.name} ${locale}: body/accessory purchase, independent slots, free equip/remove, insufficient funds, reload/restart/home, paused run, keyboard/touch, large text`);
        } catch (error) {
          await page.screenshot({ path: path.join(reportDir, `${profile.name}-${locale}-failure.png`), fullPage: true }).catch(() => {});
          throw error;
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  await new Promise(resolve => server.close(resolve));
  await fs.writeFile(path.join(reportDir, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`Skin QA evidence: ${reportDir}`);
}
