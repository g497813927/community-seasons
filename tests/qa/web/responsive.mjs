import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';
import { assertPreviewBuildIsCurrent, changedFiles, fileHashes, previewSourceHashes } from '../preview/build-info.mjs';
import { fixtureHandler, initializeBrowserEmulation } from './runtime.mjs';
import { freezeClockAtCurrentTime } from './clock.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const previewDist = path.join(root, 'tests/qa/preview/dist');
const previewPath = '/qa/community-seasons/';
const storagePrefix = 'qa-community-seasons-v1:';
const profiles = [
  { id: 'small-phone', width: 320, height: 568, touch: true },
  { id: 'iphone14-browser-chrome', width: 390, height: 664, touch: true },
  { id: 'iphone14-full-height', width: 390, height: 844, touch: true },
  { id: 'large-phone', width: 412, height: 915, touch: true },
  { id: 'tablet-portrait', width: 768, height: 1024, touch: true },
  { id: 'tablet-landscape', width: 1024, height: 768, touch: true },
  { id: 'short-desktop', width: 1280, height: 720 },
  { id: 'large-desktop', width: 1440, height: 900 },
  { id: 'compact-threshold-below', width: 1024, height: 779 },
  { id: 'compact-threshold-at', width: 1024, height: 780 },
  { id: 'compact-threshold-above', width: 1024, height: 781 },
  { id: 'constrained-iframe', width: 390, height: 844, frameHeight: 580, touch: true },
  { id: 'phone-viewport-resize', width: 390, height: 844, resizeHeight: 664, touch: true },
  { id: 'cloud-error', width: 390, height: 664, cloudError: true, bilibili: true, touch: true },
  { id: 'desktop-cloud-error', width: 1024, height: 768, cloudError: true },
  { id: 'external-mobile-cloud-error', width: 390, height: 664, cloudError: true, externalMobile: true, touch: true },
  { id: 'external-mobile-opt-out', width: 390, height: 664, cloudError: true, externalMobile: true, optOut: true, touch: true },
  { id: 'small-phone-enlarged', width: 320, height: 568, textScale: 2, touch: true },
  { id: 'iphone14-enlarged-cloud-error', width: 390, height: 664, textScale: 2, cloudError: true, bilibili: true, touch: true },
  { id: 'external-mobile-enlarged-cloud-error', width: 390, height: 664, textScale: 2, cloudError: true, externalMobile: true, touch: true },
  { id: 'tablet-enlarged', width: 768, height: 1024, textScale: 2, touch: true },
  { id: 'desktop-enlarged', width: 1280, height: 720, textScale: 2 },
];

function parseSelection(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node tests/qa/web/responsive.mjs [--engine chromium|webkit|all] [--profile ID]

Build first with npm run qa:build; install browsers with
npx playwright install chromium webkit. Runs a bounded matrix of phone,
tablet, desktop, iframe, viewport resize and 200% text layouts in
English and Simplified Chinese. Uses only an isolated local QA preview.
Reports and screenshots: results/qa/responsive-<timestamp>/.`);
    return null;
  }
  const selected = { engine: 'all', profile: null };
  for (let index = 0; index < args.length; index += 2) {
    const [flag, value] = args.slice(index, index + 2);
    if (flag === '--engine' && ['chromium', 'webkit', 'all'].includes(value)) selected.engine = value;
    else if (flag === '--profile' && (['cloud', 'external'].includes(value) || profiles.some(profile => profile.id === value))) selected.profile = value;
    else throw Error('Expected --engine chromium|webkit|all or --profile ID. Run with --help for details.');
  }
  return selected;
}

// Serialized into the browser. These measurements exclude the fixture's fixed
// diagnostics UI and compare the page tail with the real final game footer.
function layoutSnapshot() {
  const rect = element => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
  };
  const start = document.querySelector('.start-screen');
  const credits = document.querySelector('.credits-footer');
  const doc = document.scrollingElement;
  const viewportHeight = window.visualViewport?.height ?? innerHeight;
  return {
    viewport: { width: innerWidth, height: innerHeight, visualHeight: viewportHeight },
    document: { width: doc.clientWidth, height: doc.clientHeight, scrollWidth: doc.scrollWidth, scrollHeight: doc.scrollHeight, scrollTop: doc.scrollTop },
    shell: rect(document.querySelector('.game-shell')),
    arena: rect(document.querySelector('.arena')),
    title: { ...rect(start), clientHeight: start.clientHeight, scrollHeight: start.scrollHeight, scrollTop: start.scrollTop, overflowY: getComputedStyle(start).overflowY },
    credits: rect(credits),
    blankTail: doc.scrollHeight - Math.max(doc.clientHeight, credits.getBoundingClientRect().bottom + scrollY),
  };
}

function actionSnapshot(element) {
  const bounds = element.getBoundingClientRect();
  const clip = { left: 0, top: 0, right: innerWidth, bottom: window.visualViewport?.height ?? innerHeight };
  const clips = value => /^(auto|scroll|hidden|clip)$/.test(value);
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const area = parent.getBoundingClientRect();
    if (clips(style.overflowX)) { clip.left = Math.max(clip.left, area.left); clip.right = Math.min(clip.right, area.right); }
    if (clips(style.overflowY)) { clip.top = Math.max(clip.top, area.top); clip.bottom = Math.min(clip.bottom, area.bottom); }
  }
  return { text: element.textContent.trim(), left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height, clip };
}

function scaleText(scale) {
  // Preserve the first computed sizes rather than re-reading scaled elements.
  // Some controls use `font: inherit`; removing only font-size from an inline
  // override leaves a modified shorthand behind and compounds later scaling.
  const original = window.__qaResponsiveTextStyles ?? new Map();
  const elements = [...document.body.querySelectorAll('*')];
  // Tailwind buttons transition all properties, including a QA-injected font
  // size. Disable those transitions before measuring either baseline or scale.
  for (const element of elements) element.style.setProperty('transition', 'none', 'important');
  for (const [element, { fontSize, lineHeight }] of original) {
    if (!element.isConnected) continue;
    element.style.setProperty('font-size', `${fontSize}px`, 'important');
    element.style.setProperty('line-height', lineHeight, 'important');
  }
  const newElements = elements.filter(element => !original.has(element));
  const computed = newElements.map(element => {
    const style = getComputedStyle(element);
    return [element, { fontSize: parseFloat(style.fontSize), lineHeight: style.lineHeight }];
  });
  for (const [element, values] of computed) original.set(element, values);
  for (const [element, { fontSize, lineHeight }] of original) {
    if (!element.isConnected) { original.delete(element); continue; }
    element.style.setProperty('font-size', `${fontSize * scale}px`, 'important');
    element.style.setProperty('line-height', lineHeight === 'normal' ? 'normal' : `${parseFloat(lineHeight) * scale}px`, 'important');
  }
  window.__qaResponsiveTextStyles = original;
}

async function settleLayout(frame, textScale) {
  if (textScale) await frame.evaluate(scaleText, textScale);
  await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

function assertReachable(measured, label) {
  assert.ok(measured.left >= measured.clip.left - 1 && measured.right <= measured.clip.right + 1 &&
    measured.top >= measured.clip.top - 1 && measured.bottom <= measured.clip.bottom + 1,
  `${label} remains clipped after scrolling: ${measured.text}`);
}

async function advanceUnattendedToast(frame, page) {
  // Base UI pauses dismissal on hover, toast focus or window blur. Keep the
  // page active, focus a real control outside the toast, and verify both
  // conditions before advancing actual browser timers beyond ten seconds.
  await page.bringToFront();
  await page.mouse.move(0, 0);
  await frame.locator('.language-switch').focus();
  const snapshot = () => frame.evaluate(() => {
    const viewport = document.querySelector('.cloud-status-toast-viewport');
    const toast = document.querySelector('.cloud-status-toast');
    return {
      now: Date.now(), documentFocused: document.hasFocus(), visible: document.visibilityState === 'visible',
      toastHovered: viewport?.matches(':hover') ?? false,
      toastFocused: viewport?.contains(document.activeElement) ?? false,
      toastVisible: !!toast && getComputedStyle(toast).display !== 'none' && toast.getBoundingClientRect().height > 0,
    };
  });
  const before = await snapshot();
  assert.equal(before.documentFocused && before.visible, true, 'Timer regression needs an active, visible page');
  assert.equal(before.toastHovered || before.toastFocused, false, 'Hover or toast focus must not keep the notice open');
  assert.equal(before.toastVisible, true);
  const pausedAt = await freezeClockAtCurrentTime(page);
  let after;
  try {
    // fastForward fires elapsed timeouts once without simulating 750 scenery
    // frames; runFor lets the resulting React/RAF removal finish normally.
    await page.clock.fastForward(12000);
    await page.clock.runFor(64);
    after = await snapshot();
  } finally {
    // Remaining layout checks and Base UI cleanup use the normal moving clock.
    await page.clock.resume();
  }
  assert.ok(after.now - pausedAt >= 12000, 'The browser clock must advance beyond the original ten-second timeout');
  assert.equal(after.documentFocused && after.visible, true);
  assert.equal(after.toastHovered || after.toastFocused, false);
  return { method: 'Playwright browser timers, no toast hover/focus', advancedMs: after.now - pausedAt, before, after };
}

async function verifyCloudStatus(frame, page, profile, row, screenshot) {
  const trigger = frame.locator('.cloud-status-trigger');
  const toast = frame.locator('.cloud-status-toast');
  const compact = profile.width <= 750;
  row.cloudStatus = { compact, retries: 0 };
  const snapshot = () => frame.evaluate(() => window.__communitySeasonsQACloudStatus.snapshot());
  const closeComplete = () => frame.waitForFunction(() => !document.querySelector('.cloud-status-toast'));
  const noAccidentalStart = async () => {
    assert.equal(await frame.locator('.start-screen').count(), 1, 'Cloud notice keyboard actions must leave the home screen open');
    assert.equal(await frame.locator('.controls-guide-dialog, .run-setup-dialog').count(), 0, 'Cloud notice keyboard actions must not start a journey');
  };
  await trigger.waitFor();
  assert.equal(await trigger.getAttribute('aria-label') !== null, true, 'Cloud status icon needs an accessible name');
  if (compact) {
    await toast.waitFor();
    assert.equal(await frame.locator('.cloud-status-dismiss').getAttribute('aria-hidden'), 'false', 'Dismiss must not be aria-hidden before hover or focus');
    assert.equal(await frame.getByRole('button', { name: row.locale === 'en' ? 'Dismiss' : '关闭', exact: true }).isVisible(), true, 'Dismiss must be discoverable to assistive technology before hover or focus');
    assert.equal(await frame.getByRole('button', { name: row.locale === 'en' ? 'Retry' : '重试', exact: true }).isVisible(), true, 'Retry must be discoverable to assistive technology');
    row.cloudStatus.idleTimer = await advanceUnattendedToast(frame, page);
    assert.equal(row.cloudStatus.idleTimer.after.toastVisible, false, 'Ordinary cloud notices must still expire after ten unattended seconds');
    await closeComplete();
    assert.equal(await trigger.isVisible(), true, 'An expired cloud notice must retain its reopen control');
    await trigger.click();
    await toast.waitFor();
    assert.equal((await snapshot()).retries, 0, 'Reopening an expired notice must not start a retry');
    row.cloudStatus.expiredNoticeReopened = true;
    row.cloudStatus.automaticNotice = true;
    await settleLayout(frame, profile.textScale);
    row.cloudStatus.trigger = await trigger.evaluate(actionSnapshot);
    assert.ok(row.cloudStatus.trigger.width >= 44 && row.cloudStatus.trigger.height >= 44, 'Compact cloud status needs a 44px touch target');
    row.cloudStatus.toast = await toast.evaluate(actionSnapshot);
    assertReachable(row.cloudStatus.toast, 'Cloud notice');
    row.cloudStatus.toastActions = [];
    for (const button of await toast.locator('button').all()) {
      await button.scrollIntoViewIfNeeded();
      const measured = await button.evaluate(actionSnapshot);
      row.cloudStatus.toastActions.push(measured);
      assertReachable(measured, 'Cloud notice action');
    }
    await toast.evaluate(element => element.scrollTo(0, 0));
    const title = frame.locator('.cloud-status-title');
    if (await title.count()) {
      const measured = await title.evaluate(actionSnapshot);
      assert.ok(measured.top >= measured.clip.top - 1, 'Cloud notice heading is unreachable');
    }
    await page.screenshot({ path: screenshot.replace('.png', '-toast-open.png'), fullPage: true });
    await frame.locator('.cloud-status-dismiss').click();
    await closeComplete();
    await frame.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: screenshot.replace('.png', '-icon-dismissed.png'), fullPage: true });
    await trigger.focus();
    await trigger.press('Enter');
    await toast.waitFor();
    await noAccidentalStart();
    await frame.locator('.cloud-status-dismiss').focus();
    await page.keyboard.press('Escape');
    await closeComplete();
    await frame.waitForFunction(() => document.activeElement === document.querySelector('.cloud-status-trigger'));
    row.cloudStatus.keyboardReopenAndEscape = true;
    await noAccidentalStart();
    await trigger.click();
    await toast.waitFor();
    await settleLayout(frame, profile.textScale);
    await frame.locator('.cloud-status-retry').click();
  } else {
    assert.equal(await toast.count(), 0, 'Desktop status must not automatically show a toast');
    assert.equal(await frame.locator('.cloud-save-status small').isVisible(), true, 'Desktop cloud error remains inline');
    await trigger.click();
  }
  await frame.waitForFunction(() => window.__communitySeasonsQACloudStatus.snapshot().status === 'checking');
  assert.deepEqual(await snapshot(), { status: 'checking', retries: 1, cloud: 'disabled' });
  assert.equal(await trigger.isDisabled(), true, 'Retry must prevent duplicate clicks while busy');
  await closeComplete();
  await frame.evaluate(() => window.__communitySeasonsQACloudStatus.settle('error'));
  if (compact) {
    await toast.waitFor();
    row.cloudStatus.sameErrorAfterRetryReopened = true;
  } else assert.equal(await toast.count(), 0);
  await frame.evaluate(() => window.__communitySeasonsQACloudStatus.settle('synced'));
  await closeComplete();
  await frame.waitForFunction(() => window.__communitySeasonsQACloudStatus.snapshot().status === 'synced');
  assert.deepEqual(await snapshot(), { status: 'synced', retries: 1, cloud: 'disabled' });
  row.cloudStatus.retries = 1;
  row.cloudStatus.busyAndSuccessClearedNotice = true;
  await frame.evaluate(() => window.__communitySeasonsQACloudStatus.settle('unsupported'));
  await frame.waitForFunction(() => document.querySelector('.cloud-save-status[data-status="unsupported"]'));
  const unsupportedLabel = row.locale === 'en' ? 'Cloud saving not supported' : '当前环境不支持云存档';
  assert.equal(await trigger.isDisabled(), false, 'Unsupported cloud must keep its retry control available');
  row.cloudStatus.unsupported = { label: unsupportedLabel, retryAvailable: true };
  if (compact) {
    await toast.waitFor();
    await settleLayout(frame, profile.textScale);
    assert.equal(await frame.locator('.cloud-status-title').innerText(), unsupportedLabel);
    const description = await frame.locator('.cloud-status-description').innerText();
    assert.equal(description, row.locale === 'en' ? 'Cloud saving is not supported here.' : '当前环境不支持云存档。', 'Unsupported environments need their own explanation, without temporary-failure advice');
    const retry = frame.getByRole('button', { name: row.locale === 'en' ? 'Retry' : '重试', exact: true });
    assert.equal(await retry.isVisible(), true);
    assert.equal(await retry.isDisabled(), false);
    await retry.scrollIntoViewIfNeeded();
    assertReachable(await retry.evaluate(actionSnapshot), 'Unsupported cloud retry');
    row.cloudStatus.unsupported.description = description;
  } else {
    assert.equal(await toast.count(), 0, 'Desktop unsupported status must remain inline');
    assert.equal(await trigger.innerText(), unsupportedLabel);
  }
  await frame.evaluate(() => window.__communitySeasonsQACloudStatus.settle('synced'));
  await closeComplete();
  await frame.waitForFunction(() => document.querySelector('.cloud-save-status[data-status="synced"]'));
  assert.deepEqual(await snapshot(), { status: 'synced', retries: 1, cloud: 'disabled' });
  row.cloudStatus.unsupported.recoveryClearedNotice = true;
  await noAccidentalStart();
  await settleLayout(frame, profile.textScale);
}

async function verifyExternalMobileCloudStatus(frame, page, profile, row, screenshot) {
  const trigger = frame.locator('.cloud-status-trigger');
  const toast = frame.locator('.cloud-status-toast');
  row.cloudStatus = { compact: true, externalMobile: true };
  await trigger.waitFor();
  assert.equal(await trigger.isDisabled(), true, 'Checking cloud must preserve the busy status control in a mobile browser');
  assert.equal(await toast.count(), 0, 'A mobile user agent must not show a recommendation before cloud failure');
  await frame.evaluate(() => window.__communitySeasonsQACloudStatus.settle('synced'));
  await frame.waitForFunction(() => document.querySelector('.cloud-save-status[data-status="synced"] .cloud-status-trigger'));
  assert.equal(await toast.count(), 0, 'Working cloud sync in a mobile browser must not show a recommendation');
  assert.equal(await trigger.isDisabled(), false);
  row.cloudStatus.checkingAndWorkingCloudPreserved = true;
  await frame.evaluate(() => window.__communitySeasonsQACloudStatus.settle('error'));
  await toast.waitFor();
  assert.equal(await frame.locator('.cloud-status-dismiss').getAttribute('aria-hidden'), 'false', 'Recommendation dismissal must not be aria-hidden before hover or focus');
  assert.equal(await frame.getByRole('button', { name: row.locale === 'en' ? 'Dismiss' : '关闭', exact: true }).isVisible(), true, 'Recommendation dismissal must be discoverable before hover or focus');
  assert.equal(await frame.getByRole('button', { name: row.locale === 'en' ? 'Don’t show again' : '不再提示', exact: true }).isVisible(), true, 'Recommendation opt-out must be discoverable to assistive technology');
  row.cloudStatus.idleTimer = await advanceUnattendedToast(frame, page);
  assert.equal(row.cloudStatus.idleTimer.after.toastVisible, true, 'A triggerless app recommendation must remain open beyond ten unattended seconds');
  assert.equal(await frame.locator('.cloud-status-app-arrow').isVisible(), true, 'The persistent recommendation must retain its arrow');
  assert.equal(await frame.getByRole('button', { name: row.locale === 'en' ? 'Dismiss' : '关闭', exact: true }).isVisible(), true, 'The persistent recommendation must retain Dismiss');
  assert.equal(await frame.getByRole('button', { name: row.locale === 'en' ? 'Don’t show again' : '不再提示', exact: true }).isVisible(), true, 'The persistent recommendation must retain its opt-out action');
  row.cloudStatus.unattendedRecommendationPersists = true;
  assert.equal(await trigger.count(), 0, 'Failed external-mobile cloud status must not leave a status control in the help row');
  assert.equal(await frame.locator('.cloud-save-status').count(), 0, 'Hidden external-mobile cloud status must not reserve help-row space');
  assert.equal(await frame.locator('.cloud-status-retry').count(), 0, 'Bilibili recommendation must not offer an ineffective cloud retry');
  assert.match(await frame.locator('.cloud-status-title').innerText(), /Bilibili|哔哩哔哩/i);
  await settleLayout(frame, profile.textScale);
  row.cloudStatus.toast = await toast.evaluate(actionSnapshot);
  assertReachable(row.cloudStatus.toast, 'Bilibili recommendation');
  assert.ok(row.cloudStatus.toast.top >= 0 && row.cloudStatus.toast.top <= 96, 'Bilibili recommendation should sit near the host open-app button at the top');
  const arrow = frame.locator('.cloud-status-app-arrow');
  assert.equal(await arrow.getAttribute('aria-hidden'), 'true', 'Directional decoration must not add screen-reader noise');
  row.cloudStatus.arrow = await arrow.evaluate(actionSnapshot);
  row.cloudStatus.arrowTipY = await arrow.locator('path').evaluate(element => element.getBoundingClientRect().top);
  assert.ok(row.cloudStatus.arrowTipY >= 0 && row.cloudStatus.arrowTipY <= 2.1, 'Recommendation arrow tip must reach the iframe top edge instead of pointing into the game header');
  assert.ok(row.cloudStatus.arrow.top >= 0 && row.cloudStatus.arrow.top < row.cloudStatus.toast.top && row.cloudStatus.arrow.right >= profile.width - 85,
    'Recommendation arrow should point toward the host top-right open-app control');
  const copy = await toast.innerText();
  assert.doesNotMatch(copy, /cloud|sync|存档|同步/i, 'Open-app instructions must avoid cloud-save terminology');
  assert.doesNotMatch(await frame.locator('.cloud-status-toast-viewport').getAttribute('aria-label'), /cloud|sync|存档|同步/i);
  row.cloudStatus.recommendationCopyIsSimple = true;
  const dismiss = frame.locator('.cloud-status-dismiss');
  row.cloudStatus.toastActions = [];
  for (const button of await toast.locator('button').all()) {
    await button.scrollIntoViewIfNeeded();
    const measured = await button.evaluate(actionSnapshot);
    row.cloudStatus.toastActions.push(measured);
    assertReachable(measured, 'Bilibili recommendation action');
  }
  await toast.evaluate(element => element.scrollTo(0, 0));
  await page.screenshot({ path: screenshot.replace('.png', '-toast-open.png'), fullPage: true });
  await dismiss.click();
  await frame.waitForFunction(() => !document.querySelector('.cloud-status-toast'));
  await frame.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: screenshot.replace('.png', '-recommendation-dismissed.png'), fullPage: true });
  assert.equal(await trigger.count(), 0, 'Dismissing the recommendation must not restore the failed control');
  await frame.evaluate(() => window.__communitySeasonsQACloudStatus.settle('synced'));
  await trigger.waitFor();
  assert.equal(await trigger.isDisabled(), false, 'Recovered working cloud must restore its status control');
  await frame.evaluate(() => window.__communitySeasonsQACloudStatus.settle('unsupported'));
  await toast.waitFor();
  assert.equal(await trigger.count(), 0, 'Unsupported mobile cloud must use the same recommendation fallback');
  assert.equal(await frame.locator('.cloud-status-retry').count(), 0);
  await frame.evaluate(() => window.__communitySeasonsQACloudStatus.settle('synced'));
  await frame.waitForFunction(() => !document.querySelector('.cloud-status-toast'));
  await trigger.waitFor();
  assert.deepEqual(await frame.evaluate(() => window.__communitySeasonsQACloudStatus.snapshot()), { status: 'synced', retries: 0, cloud: 'disabled' });
  row.cloudStatus.failureOnlyRecommendation = true;
  row.cloudStatus.successRestoresControl = true;
  if (profile.optOut) {
    await frame.evaluate(() => window.__communitySeasonsQACloudStatus.settle('error'));
    await toast.waitFor();
    await frame.locator('.cloud-status-opt-out').click();
    await frame.waitForFunction(() => !document.querySelector('.cloud-status-toast'));
    assert.equal(await frame.evaluate(() => Object.fromEntries(Object.entries(localStorage))['qa-community-seasons-v1:community-seasons-bilibili-hint-dismissed']), '1', 'Recommendation preference must use the isolated QA namespace');
    await frame.evaluate(() => window.__communitySeasonsQACloudStatus.settle('synced'));
    await trigger.waitFor();
    await frame.evaluate(() => window.__communitySeasonsQACloudStatus.settle('error'));
    await settleLayout(frame);
    assert.equal(await toast.count(), 0, 'Opt-out must suppress a later failure recommendation');
    await page.reload();
    await frame.locator('.start-screen .run-button').waitFor();
    await frame.addStyleTag({ content: '.qa-console { display: none !important; }' });
    await frame.waitForFunction(() => window.__communitySeasonsQACloudStatus);
    await frame.evaluate(locale => window.__communitySeasonsQACloudStatus.mount(locale), row.locale);
    await settleLayout(frame);
    assert.equal(await toast.count(), 0, 'Opt-out must survive a fresh page load');
    assert.equal(await trigger.count(), 0);
    row.cloudStatus.optOutPersistsInIsolatedStorage = true;
  }
  assert.equal(await frame.locator('.start-screen').count(), 1);
  await settleLayout(frame, profile.textScale);
}

async function inspectLayout(frame, row) {
  await frame.evaluate(() => window.scrollTo(0, 0));
  row.layout = await frame.evaluate(layoutSnapshot);
  const { document: doc, title, blankTail } = row.layout;
  assert.ok(doc.scrollWidth <= doc.width + 1, `Document overflows horizontally by ${doc.scrollWidth - doc.width}px`);
  assert.ok(!/^(auto|scroll)$/.test(title.overflowY) || title.scrollHeight <= title.clientHeight + 1,
    `Home title has its own ${title.scrollHeight - title.clientHeight}px vertical scroll range`);
  assert.ok(blankTail <= 24, `Blank space after credits footer: ${blankTail}px`);

  // Exercise actual scrolling before measuring clipping. A visible DOM node
  // alone does not prove a control can be reached inside overflow:hidden.
  row.actions = [];
  for (const action of await frame.locator('.topbar button, .start-screen button, .start-screen a, .licenses-launcher').all()) {
    if (!await action.isVisible()) continue;
    await action.scrollIntoViewIfNeeded();
    const measured = await action.evaluate(actionSnapshot);
    row.actions.push(measured);
    assertReachable(measured, 'Home action');
  }
  const heading = frame.locator('.start-screen h1');
  await heading.scrollIntoViewIfNeeded();
  const headingBounds = await heading.evaluate(actionSnapshot);
  row.heading = headingBounds;
  assert.ok(headingBounds.top >= headingBounds.clip.top - 1, 'Beginning of the home title is unreachable');
  await frame.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
  row.scrolledToBottom = await frame.evaluate(layoutSnapshot);
  assert.ok(row.scrolledToBottom.title.scrollTop <= 1, 'Reaching home actions scrolled the title independently');
}

async function runCase(browser, engine, profile, locale, origin, reportDirectory, sourceHashes) {
  const row = { engine, profile: profile.id, locale, ...profile, browserVersion: browser.version(), passed: false, errors: [], blockedRequests: [], failedRequests: [] };
  const phoneUserAgent = devices[engine === 'webkit' ? 'iPhone 14' : 'Pixel 7'].userAgent;
  const userAgent = profile.bilibili ? `${phoneUserAgent} BiliApp/8.31.0` : profile.touch ? (profile.width <= 750 ? phoneUserAgent : devices['iPad (gen 11)'].userAgent) : undefined;
  const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, screen: { width: profile.width, height: profile.height }, userAgent, isMobile: !!profile.touch, hasTouch: !!profile.touch, deviceScaleFactor: 1, locale, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(engine === 'webkit' ? 30000 : 10000);
  page.on('pageerror', error => row.errors.push(String(error)));
  page.on('requestfailed', request => row.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  let timer;
  const screenshot = path.join(reportDirectory, `${engine}-${profile.id}-${locale}.png`);
  try {
    if (profile.cloudError) await page.clock.install({ time: Date.now() });
    await context.addInitScript(initializeBrowserEmulation, { entries: { 'community-seasons-best': '918273645', ...(profile.bilibili ? { [storagePrefix + 'community-seasons-bilibili-hint-dismissed']: '1' } : {}) }, platform: engine === 'webkit' && profile.touch ? 'ios' : 'web' });
    await context.route('**/*', async route => {
      if (new URL(route.request().url()).origin !== origin) {
        row.blockedRequests.push(route.request().url());
        await route.abort();
      } else await route.continue();
    });
    await Promise.race([
      (async () => {
        await page.goto(origin + (profile.frameHeight ? `/host/${profile.frameHeight}` : previewPath));
        const frame = profile.frameHeight ? await (await page.locator('iframe').elementHandle()).contentFrame() : page;
        await frame.locator('.start-screen .run-button').waitFor();
        await frame.evaluate(() => document.fonts.ready);
        await frame.waitForFunction(expected => document.documentElement.lang === expected, locale);
        row.userAgent = await frame.evaluate(() => navigator.userAgent);
        await frame.addStyleTag({ content: '.qa-console { display: none !important; }' });
        const probe = await frame.evaluate(() => window.__communitySeasonsQA.report());
        assert.equal(probe.id, 'community-seasons-qa-v1');
        assert.equal(probe.storagePrefix, storagePrefix);
        assert.equal(probe.cloud, 'disabled');
        assert.deepEqual(probe.build, { version: 1, sourceHashes });
        if (profile.resizeHeight) {
          row.beforeResize = {};
          await inspectLayout(frame, row.beforeResize);
          await page.setViewportSize({ width: profile.width, height: profile.resizeHeight });
          await frame.waitForFunction(height => innerHeight === height && document.querySelector('.game-shell').classList.contains('compact-viewport'), profile.resizeHeight);
        }
        if (profile.cloudError) {
          await frame.waitForFunction(() => window.__communitySeasonsQACloudStatus);
          await frame.evaluate(({ locale, externalMobile }) => window.__communitySeasonsQACloudStatus.mount(locale, externalMobile ? 'checking' : 'error'), { locale, externalMobile: profile.externalMobile });
          await (profile.externalMobile ? verifyExternalMobileCloudStatus : verifyCloudStatus)(frame, page, profile, row, screenshot);
        }
        await settleLayout(frame, profile.textScale);
        if (profile.textScale) {
          row.textScaling = await frame.evaluate(scale => {
            const mismatches = [];
            let elements = 0;
            for (const [element, { fontSize }] of window.__qaResponsiveTextStyles) {
              if (!element.isConnected) continue;
              elements++;
              const actual = parseFloat(getComputedStyle(element).fontSize);
              if (Math.abs(actual - fontSize * scale) > 0.1) mismatches.push({ element: element.tagName, className: element.getAttribute('class'), expected: fontSize * scale, actual });
            }
            return { scale, elements, mismatches };
          }, profile.textScale);
          assert.deepEqual(row.textScaling.mismatches, [], 'Enlarged text must remain at the requested scale after toast transitions');
        }
        await inspectLayout(frame, row);
        if (profile.resizeHeight) {
          await frame.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: screenshot.replace('.png', '-short.png'), fullPage: true });
          await page.setViewportSize({ width: profile.width, height: profile.height });
          await frame.waitForFunction(height => innerHeight === height && !document.querySelector('.game-shell').classList.contains('compact-viewport'), profile.height);
          row.afterRestoringHeight = {};
          await inspectLayout(frame, row.afterRestoringHeight);
        }
        const entries = await frame.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
        assert.equal(entries['community-seasons-best'], '918273645');
        assert.deepEqual(Object.keys(entries).filter(key => !key.startsWith(storagePrefix)), ['community-seasons-best']);
        row.storageIsolationPassed = true;
        assert.deepEqual(row.errors, []);
        assert.deepEqual(row.failedRequests, []);
        assert.deepEqual(row.blockedRequests, []);
        await frame.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: screenshot, fullPage: true });
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Responsive scenario exceeded its 120-second bound')), 120000); }),
    ]);
    row.passed = true;
  } catch (error) {
    row.error = String(error);
    row.stack = error.stack;
    await page.screenshot({ path: screenshot, fullPage: true, timeout: 10000 }).catch(() => {});
  } finally {
    clearTimeout(timer);
    await context.close();
  }
  return row;
}

async function main() {
  const selected = parseSelection(process.argv.slice(2));
  if (!selected) return;
  const sourceHashes = await assertPreviewBuildIsCurrent(root, previewDist);
  const reportDirectory = path.join(root, 'results/qa', `responsive-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await fs.mkdir(reportDirectory, { recursive: true });
  const report = { version: 1, startedAt: new Date().toISOString(), method: 'Isolated built preview in desktop Chromium and WebKit; browser simulation only, not native-device or performance evidence. The constrained iframe has its own smaller viewport. Viewport resize checks 844 to 664 pixels and back without reloading. Cloud status renders the production component with isolated in-memory state and an inert retry counter; no cloud connection. Enlarged text multiplies snapshotted computed font sizes and line heights by 200%, including newly mounted toast portals.', sourceHashes, distHashes: await fileHashes(root, [previewDist]), rows: [], errors: [] };
  const servePreview = fixtureHandler(previewDist, previewPath);
  const server = http.createServer((request, response) => {
    const host = /^\/host\/(\d+)$/.exec(request.url);
    if (!host) return servePreview(request, response);
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    response.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Constrained QA host</title><style>html,body{margin:0;background:#ddd}iframe{display:block;width:100%;height:${Number(host[1])}px;border:0}</style><iframe title="Isolated game preview" src="${previewPath}"></iframe>`);
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const engine of selected.engine === 'all' ? ['chromium', 'webkit'] : [selected.engine]) {
      let browser;
      try {
        browser = await ({ chromium, webkit })[engine].launch({ headless: true });
        for (const profile of profiles.filter(profile => !selected.profile || profile.id === selected.profile || (selected.profile === 'cloud' && profile.cloudError) || (selected.profile === 'external' && profile.externalMobile))) for (const locale of ['en', 'zh-CN']) {
          const row = await runCase(browser, engine, profile, locale, origin, reportDirectory, sourceHashes);
          report.rows.push(row);
          console.log(`${row.passed ? 'PASS' : 'FAIL'} ${engine} / ${profile.id} / ${locale}${row.error ? `: ${row.error}` : ''}`);
        }
      } catch (error) { report.errors.push(`${engine}: ${String(error)}`); }
      finally { if (browser) await browser.close(); }
    }
  } catch (error) { report.errors.push(String(error)); }
  finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    report.changedSourceFiles = changedFiles(sourceHashes, await previewSourceHashes(root));
    report.status = report.rows.length > 0 && report.rows.every(row => row.passed) && report.errors.length === 0 && report.changedSourceFiles.length === 0 ? 'passed' : 'failed';
    report.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(reportDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`${report.status.toUpperCase()}: ${path.relative(root, reportDirectory)}/report.json`);
    if (report.status !== 'passed') process.exitCode = 1;
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
