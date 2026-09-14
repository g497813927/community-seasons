import { isolateStorage, STORAGE_PREFIX } from './storage.mjs';

export function installProbe() {
  isolateStorage(Storage.prototype);
  const samples = [], errors = [];
  let startedAt = performance.now(), previous = null;
  const push = (rows, value, cap) => { rows.push(value); if (rows.length > cap) rows.shift(); };
  const frame = now => {
    if (previous !== null && document.visibilityState === 'visible') push(samples, now - previous, 1200);
    previous = now;
    requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', () => { previous = null; });
  requestAnimationFrame(frame);
  addEventListener('error', event => push(errors, String(event.message).slice(0, 500), 50));
  addEventListener('unhandledrejection', event => push(errors, String(event.reason?.message ?? event.reason).slice(0, 500), 50));
  const report = () => {
    const sorted = [...samples].sort((a, b) => a - b);
    return {
      id: 'community-seasons-qa-v1', storagePrefix: STORAGE_PREFIX, cloud: 'disabled',
      environment: {
        userAgent: navigator.userAgent, locale: document.documentElement.lang,
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        visible: document.visibilityState === 'visible', focused: document.hasFocus(),
        activated: navigator.userActivation?.hasBeenActive ?? false,
      },
      metrics: {
        elapsedMs: performance.now() - startedAt, frames: sorted.length,
        frameGapP95Ms: sorted.length ? sorted[Math.floor((sorted.length - 1) * .95)] : null,
        frameGapMaxMs: sorted.at(-1) ?? null, errors: [...errors],
      },
      note: 'Foreground animation-frame cadence only; no native hardware or render-CPU claim. Save values are never exported.',
    };
  };
  window.__communitySeasonsQA = Object.freeze({
    id: 'community-seasons-qa-v1', storagePrefix: STORAGE_PREFIX, cloud: 'disabled', report,
    resetMetrics() { samples.length = 0; errors.length = 0; previous = null; startedAt = performance.now(); return report(); },
  });
  document.querySelector('#qa-export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report(), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `community-seasons-qa-${Date.now()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
