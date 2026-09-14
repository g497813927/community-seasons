import { createCartMeasurement, deriveCartCheckpoint, MAX_CART_WALL_MS } from './cart-helper';

const PREFIX = 'qa-cart-20260910-';
const host = window as any;
const qa = host.__phoneQA;
if (!qa || qa.prefix !== PREFIX) throw Error('Cart measurement requires its isolated QA save namespace.');

let active: ReturnType<typeof createCartMeasurement> | null = null;
let result: any = null;
let metadata: ReturnType<typeof deriveCartCheckpoint>['metadata'] | null = null;
let raf: number | null = null;
let deadline: ReturnType<typeof setTimeout> | null = null;
let startedAt: string | null = null;
let armTimer: ReturnType<typeof setInterval> | null = null;
const lifecycle: Array<{ at: number; kind: string; detail?: string }> = [];
const event = (kind: string, detail?: string) => {
  if (active && lifecycle.length < 32) lifecycle.push({ at: performance.now(), kind, detail: detail?.slice(0, 200) });
};
function visible(element: Element) {
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
}
function pauseThroughHud() {
  if (qa.run?.mode !== 'running') return { attempted: false, mode: qa.run?.mode };
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.hud-buttons > button')];
  const button = buttons.find(candidate => ['Pause game', '暂停游戏'].includes(candidate.getAttribute('aria-label') ?? '') &&
    !candidate.disabled && visible(candidate));
  if (!button) return { attempted: false, mode: qa.run?.mode, error: 'Visible enabled pause HUD control unavailable.' };
  button.focus({ preventScroll: true });
  button.click();
  return { attempted: true, mode: qa.run?.mode, successful: qa.run?.mode === 'paused' };
}
function finish(reason: string) {
  if (!active) return result;
  if (raf !== null) cancelAnimationFrame(raf);
  if (deadline !== null) clearTimeout(deadline);
  raf = null; deadline = null;
  active.finish(reason);
  const measurement = active.export();
  const pause = pauseThroughHud();
  result = { version: 1, startedAt, finishedAt: new Date().toISOString(), prefix: PREFIX,
    checkpoint: metadata, measurement, lifecycle: [...lifecycle], pause,
    probe: qa.export({ includeFrames: true }),
    limitation: 'RAF callback cadence, not compositor-presented frames. The 62-second natural checkpoint was simulated before measurement; only the remaining approach ran in real time on this device.' };
  active = null;
  return result;
}
function frame(wallMs: number) {
  if (!active) return;
  const end = active.sample(qa.run, wallMs, document.visibilityState === 'visible');
  if (end) { finish(end); return; }
  raf = requestAnimationFrame(frame);
}

host.__cartQA = {
  arm() {
    if (active) throw Error('Measurement already running');
    if (armTimer) clearInterval(armTimer);
    const until = performance.now() + 180000;
    armTimer = setInterval(() => {
      if (performance.now() > until) { clearInterval(armTimer!); armTimer = null; return; }
      if (document.visibilityState !== 'visible' || !document.hasFocus() || !navigator.userActivation.hasBeenActive || qa.run?.mode !== 'running') return;
      try { host.__cartQA.start(); clearInterval(armTimer!); armTimer = null; } catch { /* Wait for an actual run with no open dialog. */ }
    }, 100);
    return { status: 'armed', expiresInSeconds: 180, requires: 'Real touch and the actual Begin run control' };
  },
  start() {
    if (active) throw Error('The targeted cart measurement is already running.');
    if (document.visibilityState !== 'visible' || !document.hasFocus()) throw Error('Keep Safari visible and focused.');
    if (navigator.userActivation?.hasBeenActive !== true) throw Error('Tap the real game and complete Start / Begin first.');
    if (qa.run?.mode !== 'running') throw Error('Start the actual game using its controls before starting the measurement.');
    if (['.cloud-save-dialog', '.store-dialog', '.controls-guide-dialog', '.run-setup-dialog', '.lesson-dialog', '.rotate-device-dialog']
      .some(selector => [...document.querySelectorAll(selector)].some(visible))) throw Error('Close the open game dialog before starting.');
    const checkpoint = deriveCartCheckpoint();
    Object.assign(qa.run, checkpoint.run);
    metadata = checkpoint.metadata;
    lifecycle.length = 0; result = null;
    qa.reset('exact-seed-cart-approach');
    startedAt = new Date().toISOString();
    active = createCartMeasurement(qa.run, performance.now());
    event('measurement-start');
    raf = requestAnimationFrame(frame);
    deadline = setTimeout(() => finish('wall-deadline'), MAX_CART_WALL_MS);
    return { status: 'running', checkpoint: metadata, expectedSeconds: 10, stop: 'First question, with the real HUD pause control.' };
  },
  status() { return active ? { status: 'running', checkpoint: metadata, measurement: active.export() } : armTimer ? { status: 'armed' } :
    { status: result?.measurement.status ?? 'idle', checkpoint: metadata, pause: result?.pause }; },
  export() { return active ? { checkpoint: metadata, measurement: active.export(), lifecycle: [...lifecycle] } : result; },
  stop() { if (armTimer) clearInterval(armTimer); armTimer = null; return finish('manual-stop'); },
};
document.addEventListener('visibilitychange', () => {
  event('visibility', document.visibilityState);
  if (document.visibilityState !== 'visible') finish('hidden');
});
window.addEventListener('blur', () => event('blur'));
window.addEventListener('focus', () => event('focus'));
window.addEventListener('error', e => event('error', e.message));
window.addEventListener('unhandledrejection', e => event('unhandledrejection', String(e.reason?.message ?? e.reason)));
window.addEventListener('pagehide', () => { event('pagehide'); finish('pagehide'); });

await import('../../../src/main.tsx');
// Only this isolated preview arms a bounded measurement after real user input.
host.__cartQA.arm();
