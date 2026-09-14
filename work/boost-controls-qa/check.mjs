import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const base = 'http://127.0.0.1:3030';
const sourceHashes = () => Object.fromEntries([
  'app/page.tsx', 'app/globals.css', 'components/boost-store.tsx', 'lib/game/i18n.ts',
  'lib/game/boosts.ts', 'lib/game/store.ts', 'lib/game/engine.ts',
].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(`src/${file}`)).digest('hex')]));
const sourceStart = sourceHashes();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
});
const rows = [];

async function scaleText(page, scale) {
  await page.evaluate(scale => {
    const fonts = window.__boostQA.fonts ??= new Map();
    for (const [el, prior] of fonts) if (el.isConnected) {
      el.style.fontSize = prior.font;
      el.style.lineHeight = prior.line;
    }
    // Keep an immutable computed baseline: stateful component wrappers can
    // preserve inherited inline values when they rerender between checkpoints.
    const elements = [...document.body.querySelectorAll('*')];
    for (const el of elements) if (!fonts.has(el)) {
      const style = getComputedStyle(el);
      fonts.set(el, {
        font: el.style.fontSize, line: el.style.lineHeight,
        size: parseFloat(style.fontSize), height: style.lineHeight,
      });
    }
    for (const el of elements) {
      const { size, height } = fonts.get(el);
      el.style.setProperty('font-size', `${size * scale}px`, 'important');
      if (height !== 'normal') el.style.setProperty('line-height', `${parseFloat(height) * scale}px`, 'important');
    }
  }, scale);
}

async function mutate(page, value) {
  await page.evaluate(value => {
    const run = window.__boostQA.live;
    if (value.boosts) Object.assign(run.boosts, value.boosts);
    const { boosts, ...rest } = value;
    Object.assign(run, rest);
  }, value);
  await page.waitForTimeout(150);
}

async function state(page) {
  return page.evaluate(() => {
    const s = window.__boostQA.live;
    const progress = JSON.parse(localStorage.getItem('community-seasons-progress-v1'));
    return {
      mode: s.mode, time: s.time, lane: s.lane, jump: s.jump, slide: s.slide,
      skillCharge: s.skillCharge, boosts: { ...s.boosts }, inventory: progress.inventory,
    };
  });
}

async function measure(page) {
  return page.evaluate(() => {
    const rect = r => ({ x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    const arena = document.querySelector('.arena').getBoundingClientRect();
    const skill = document.querySelector('.permanent-hud')?.getBoundingClientRect();
    const tray = document.querySelector('.boost-tray').getBoundingClientRect();
    return {
      arena: rect(arena), tray: rect(tray), skill: skill && rect(skill),
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      slots: [...document.querySelectorAll('.boost-slot')].map(el => {
        const glyphs = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          if (!walker.currentNode.textContent.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(walker.currentNode);
          for (const r of range.getClientRects()) if (r.width && r.height) glyphs.push(rect(r));
        }
        return {
          name: el.getAttribute('aria-label'), key: el.getAttribute('aria-keyshortcuts'),
          box: rect(el.getBoundingClientRect()), glyphs,
          keyboardVisible: getComputedStyle(el.querySelector('kbd')).display !== 'none',
          pointerEvents: getComputedStyle(el).pointerEvents,
        };
      }),
    };
  });
}

function assertLayout(layout, mobile) {
  assert.ok(layout.documentOverflow <= 1, 'document horizontal overflow');
  const { arena, skill } = layout;
  for (const slot of layout.slots) {
    const box = slot.box;
    assert.ok(box.width >= 44 && box.height >= 44, `${slot.name}: touch target smaller than 44px`);
    assert.ok(box.x >= arena.x - 1 && box.right <= arena.right + 1 && box.y >= arena.y - 1 && box.bottom <= arena.bottom + 1, `${slot.name}: outside arena`);
    assert.ok(box.x >= -1 && box.right <= layout.viewport.width + 1, `${slot.name}: outside viewport`);
    for (const glyph of slot.glyphs) assert.ok(glyph.x >= box.x - 1 && glyph.right <= box.right + 1 && glyph.y >= box.y - 1 && glyph.bottom <= box.bottom + 1, `${slot.name}: text clipped`);
    if (skill) assert.ok(Math.min(box.right, skill.right) - Math.max(box.x, skill.x) <= 1 || Math.min(box.bottom, skill.bottom) - Math.max(box.y, skill.y) <= 1, `${slot.name}: overlaps skill button`);
    if (mobile) assert.equal(slot.keyboardVisible, false, 'phone slot keeps keyboard hint');
    assert.equal(slot.pointerEvents, 'auto', 'disabled controls allow gestures through to the path');
    assert.ok(slot.key, 'keyboard shortcut unavailable to assistive technology');
  }
}

async function pointerStroke(page, selector) {
  const target = page.locator(selector);
  const rect = await target.boundingBox();
  const common = { pointerId: 19, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 };
  await target.dispatchEvent('pointerdown', common);
  await target.dispatchEvent('pointermove', { ...common, clientX: common.clientX + 55 });
  await target.dispatchEvent('pointerup', { ...common, clientX: common.clientX + 55 });
}

async function tapDisabled(page, selector, mobile) {
  const box = await page.locator(selector).boundingBox();
  for (let n = 0; n < 2; n++) {
    if (mobile) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
}

const cases = (process.env.QA_QUICK === '1' ? [[320, 568]] : [[320, 568], [390, 844], [1280, 900]])
  .flatMap(([width, height]) => ['en', 'zh-CN'].flatMap(locale => [1, 2].map(scale => ({ width, height, locale, scale }))));
try {
  for (const config of cases) {
    const { width, height, locale, scale } = config;
    const mobile = width < 750;
    const context = await browser.newContext({ viewport: { width, height }, locale, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('request', request => requests.push(request.url()));
    page.setDefaultTimeout(5000);
    const row = { ...config, layoutErrors: [] };
    const activate = selector => mobile ? page.locator(selector).tap() : page.locator(selector).click();
    const checkLayout = (layout, phase) => {
      try { assertLayout(layout, mobile); }
      catch (error) { row.layoutErrors.push(`${phase}: ${error}`); }
    };
    try {
      await page.goto(`${base}/?lang=${locale}`);
      await page.locator('.start-screen .run-button').waitFor();
      assert.equal(await page.locator('vite-error-overlay').count(), 0);
      assert.ok((await page.locator('body').innerText()).trim().length > 0);
      await page.locator('.start-screen .run-button').click();
      await page.locator('.run-setup-footer button[type=submit]').click();
      await page.waitForFunction(() => window.__boostQA.live.mode === 'running');
      await page.evaluate(() => document.fonts.ready);
      await scaleText(page, scale);
      assert.equal(await page.locator('.boost-slot').count(), 4, 'opening controls missing');
      row.opening = await measure(page); checkLayout(row.opening, 'opening');
      await page.screenshot({ path: `work/boost-controls-qa/${width}-${locale}-${scale}-opening.png` });

      await mutate(page, { time: 4.999 });
      assert.equal(await page.locator('.boost-slot').count(), 4, 'opening controls removed too early');
      await mutate(page, { time: 5 });
      assert.equal(await page.locator('.boost-slot').count(), 2, 'in-run controls missing after opening window');
      assert.equal(await page.locator('.boost-slot.headstart, .boost-slot.portal').count(), 0);
      await mutate(page, { time: 30, skillCharge: 100 });
      await scaleText(page, scale);
      row.running = await measure(page); checkLayout(row.running, 'running');
      assert.ok(row.running.slots[0].name.includes(locale === 'en' ? 'Boundary Shield' : '界限护盾'));
      assert.ok(row.running.slots[0].name.includes(locale === 'en' ? 'Tap to activate' : '点击'));
      await page.screenshot({ path: `work/boost-controls-qa/${width}-${locale}-${scale}-running.png` });

      const before = await state(page);
      await pointerStroke(page, '.boost-slot.shield');
      assert.deepEqual(await state(page), before, 'drag on booster changes gameplay');
      await activate('.boost-slot.shield');
      const shield = await state(page);
      assert.equal(shield.inventory.shield, 1);
      assert.equal(shield.boosts.shield, 1); assert.equal(shield.boosts.shieldTime, 12);
      assert.equal(shield.skillCharge, 100); assert.equal(shield.lane, before.lane);
      assert.equal(await page.locator('.boost-slot.shield').isDisabled(), true);
      await tapDisabled(page, '.boost-slot.shield', mobile);
      await pointerStroke(page, '.boost-slot.shield');
      assert.deepEqual(await state(page), shield, 'active booster tap or drag affects inventory, path or skill');
      await activate('.boost-slot.doubleCoins');
      const rewards = await state(page);
      assert.equal(rewards.inventory.doubleCoins, 0); assert.equal(rewards.boosts.doubleCoins, 12);
      await mutate(page, { boosts: { shield: 0, shieldTime: 0, doubleCoins: 0 } });
      assert.equal(await page.locator('.boost-slot.shield').isDisabled(), false, 'shield stays disabled after effect expiry');
      assert.equal(await page.locator('.boost-slot.doubleCoins').isDisabled(), true, 'empty rewards inventory remains enabled');
      const expired = await state(page);
      await tapDisabled(page, '.boost-slot.doubleCoins', mobile);
      await pointerStroke(page, '.boost-slot.doubleCoins');
      assert.deepEqual(await state(page), expired, 'empty booster triggers path or permanent skill');

      await mutate(page, { turnRemaining: 1 });
      assert.equal(await page.locator('.boost-slot.shield').isDisabled(), true, 'booster available while turning');
      await mutate(page, { turnRemaining: 0 });
      await page.keyboard.press('p');
      await page.waitForFunction(() => window.__boostQA.live.mode === 'paused');
      assert.equal(await page.locator('.boost-tray').count(), 0, 'booster controls visible through pause');
      const paused = await state(page); await page.keyboard.press('2');
      assert.deepEqual(await state(page), paused, 'paused shortcut consumes booster');
      await page.keyboard.press('p');
      await page.waitForFunction(() => window.__boostQA.live.mode === 'running');
      await page.waitForTimeout(150);
      const beforeLateOpening = await state(page);
      await page.keyboard.press('1'); await page.keyboard.press('4');
      assert.deepEqual(await state(page), beforeLateOpening, 'late Fresh Start or Season Pass consumes inventory');
      await page.keyboard.press('2');
      assert.equal((await state(page)).inventory.shield, 0, 'keyboard booster shortcut no longer works');

      await mutate(page, { boosts: { shield: 0, shieldTime: 0 }, rail: {
        elapsed: 2, phase: 'question', questions: ['respectful-disagreement'], index: 0,
        remaining: 10, duration: 10, optionOrder: [0, 1, 2], answerLane: null,
        correct: null, correctCount: 0, failure: null, reward: 45,
      } });
      assert.equal(await page.locator('.boost-tray, .permanent-hud').count(), 0, 'boost controls appear during railway quiz');
      const rail = await state(page); await page.keyboard.press('2'); await page.keyboard.press('e');
      assert.deepEqual(await state(page), rail, 'railway accepts booster or skill');
      await mutate(page, { rail: null, railReturnRemaining: 1 });
      assert.equal(await page.locator('.boost-tray, .permanent-hud').count(), 0, 'boost controls appear during railway exit');
      await mutate(page, { railReturnRemaining: 0 });
      await activate('.permanent-trigger');
      assert.equal((await state(page)).boosts.magnet, 12, 'permanent skill button no longer works');
      await mutate(page, { boosts: { magnet: 0 }, skillCharge: 100, skillRechargeLocked: false });
      const arena = await page.locator('.arena').boundingBox();
      if (mobile) {
        await page.touchscreen.tap(arena.x + arena.width / 2, arena.y + arena.height / 2);
        await page.touchscreen.tap(arena.x + arena.width / 2, arena.y + arena.height / 2);
        assert.equal((await state(page)).boosts.magnet, 12, 'path double-tap no longer activates a charged skill');
      } else {
        await page.keyboard.press('e');
        assert.equal((await state(page)).boosts.magnet, 12, 'keyboard skill shortcut no longer works');
      }
      await page.keyboard.press('d'); assert.equal((await state(page)).lane, 1);
      await mutate(page, { lane: 0, x: 0 });
      await page.keyboard.press('a'); assert.equal((await state(page)).lane, -1);
      await page.keyboard.press('w'); assert.ok((await state(page)).jump > 0);
      await page.keyboard.press('s'); assert.ok((await state(page)).slide > 0);
      assert.equal((await state(page)).jump, 0, 'slide no longer cancels jump');
      await scaleText(page, scale);
      row.active = await measure(page); checkLayout(row.active, 'active');
      await page.screenshot({ path: `work/boost-controls-qa/${width}-${locale}-${scale}-active.png` });
      assert.equal(requests.some(url => url.includes('toy-sdk.js') || !url.startsWith(base)), false, 'fixture contacted cloud/external origin');
      assert.deepEqual(errors, []);
      row.passed = row.layoutErrors.length === 0;
    } catch (error) {
      row.passed = false; row.error = String(error); row.errors = errors;
      await page.screenshot({ path: `work/boost-controls-qa/${width}-${locale}-${scale}-failure.png` }).catch(() => {});
    }
    rows.push(row);
    console.log(JSON.stringify({ ...config, passed: row.passed, error: row.error, errors: row.errors, layoutErrors: row.layoutErrors }));
    await context.close();
  }
} finally {
  const sourceEnd = sourceHashes();
  fs.writeFileSync('work/boost-controls-qa/results.json', JSON.stringify({
    method: 'Real production app and controls; isolated local fixture seeded inventory and frozen run clock. Chromium viewport/touch and 200% computed text simulation, not physical-device performance.',
    sourceStart, sourceEnd, rows,
  }, null, 2));
  await browser.close();
}
if (rows.some(row => !row.passed)) process.exitCode = 1;
