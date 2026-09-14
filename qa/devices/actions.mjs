import { selectFrame } from './targets.mjs';
import { fileURLToPath } from 'node:url';
import { changedFiles, previewSourceHashes } from '../preview/build-info.mjs';
import { validateBuildInfo } from '../preview/provenance.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

export const QA_ID = 'community-seasons-qa-v1';
export const QA_PREFIX = 'qa-community-seasons-v1:';

function guardedExpression(frameUrl, body, requireActive = false) {
  return `(() => {
    if (location.href !== ${JSON.stringify(frameUrl)}) throw Error('QA frame navigated away.');
    const qa = window.__communitySeasonsQA;
    if (!qa || qa.id !== ${JSON.stringify(QA_ID)} || qa.storagePrefix !== ${JSON.stringify(QA_PREFIX)} ||
        qa.cloud !== 'disabled' || typeof qa.report !== 'function' || typeof qa.resetMetrics !== 'function')
      throw Error('Selected frame is not the isolated Community Seasons QA preview.');
    ${requireActive ? "if (document.visibilityState !== 'visible' || !document.hasFocus() || navigator.userActivation?.hasBeenActive !== true) throw Error('Keep the device unlocked, preview visible and focused, and tap the real game first.');" : ''}
    ${body}
  })()`;
}

export async function runAction(session, page, action, {
  seconds = 10, wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  getSourceHashes = () => previewSourceHashes(root),
} = {}) {
  if (!['status', 'measure', 'screenshot'].includes(action)) throw Error('Unsupported selected-page action.');
  if (action === 'measure' && (!Number.isInteger(seconds) || seconds < 1 || seconds > 60))
    throw Error('Measurement duration must be an integer from 1 to 60 seconds.');
  await session.call('Runtime.enable');
  await session.call('Page.enable');
  const frame = selectFrame(await session.call('Page.getFrameTree'), page);
  const context = await session.contextForFrame(frame.id);
  async function evaluate(body, requireActive = false) {
    const response = await session.call('Runtime.evaluate', {
      expression: guardedExpression(frame.url, body, requireActive),
      contextId: context.id,
      returnByValue: true,
      awaitPromise: false,
    });
    if (response?.wasThrown || response?.exceptionDetails || response?.result?.type === 'error')
      throw Error('QA guard failed: verify the exact preview, isolated marker, and visible/focused page with a real tap before measurement.');
    if (!response?.result || !Object.hasOwn(response.result, 'value')) throw Error('QA inspector returned no value.');
    return response.result.value;
  }
  const environment = `({userAgent:navigator.userAgent,visible:document.visibilityState,focused:document.hasFocus(),activated:navigator.userActivation?.hasBeenActive === true,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}})`;
  function provenance(build, current) {
    if (!build) return { status: 'unbuilt', reason: 'This page has no embedded build provenance.' };
    try { build = validateBuildInfo(build); }
    catch { return { status: 'invalid', reason: 'The embedded build provenance is invalid.' }; }
    const changedSourceFiles = changedFiles(build.sourceHashes, current);
    return { status: changedSourceFiles.length ? 'stale' : 'current', changedSourceFiles };
  }
  const report = async () => {
    const observed = await evaluate(`return {environment:${environment},qa:qa.report(),build:qa.build ?? null};`);
    return { ...observed, provenance: provenance(observed.build, await getSourceHashes()) };
  };
  function requireCurrent(result) {
    if (result.provenance.status !== 'current')
      throw Error(`QA measurement requires current build provenance (${result.provenance.status}). Run \`npm run qa:build\`, serve the built preview, and reload the selected page.`);
  }
  if (action === 'status') return report();
  if (action === 'screenshot') {
    const observed = await report();
    const screenshot = await session.call('Page.captureScreenshot', { format: 'png' });
    if (typeof screenshot?.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(screenshot.data))
      throw Error('Inspector did not return a PNG screenshot.');
    const png = Buffer.from(screenshot.data, 'base64');
    if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      throw Error('Inspector screenshot is not a PNG.');
    // Do not save an image if the selected frame changed while capturing it.
    const final = await report();
    if (JSON.stringify(observed.build) !== JSON.stringify(final.build)) throw Error('QA build changed while capturing the screenshot.');
    return { ...final, png };
  }
  const baseline = await report();
  requireCurrent(baseline);
  await evaluate('qa.resetMetrics(); return true;', true);
  for (let elapsed = 0; elapsed < seconds; elapsed++) {
    await wait(1000);
    const build = await evaluate('return qa.build ?? null;', true);
    requireCurrent({ provenance: provenance(build, baseline.build.sourceHashes) });
  }
  const result = await report();
  requireCurrent(result);
  return { ...result, seconds };
}
