import { isolateStorage, STORAGE_PREFIX } from './storage.mjs';
import { readEmbeddedBuildInfo } from './provenance.mjs';
import { createFrameMetrics } from './frame-metrics.mjs';

export function installProbe(host = window) {
  const { document, performance, navigator } = host;
  isolateStorage(host.Storage.prototype);
  const build = readEmbeddedBuildInfo(document);
  const intervals = createFrameMetrics(), errors = [];
  const interruptions = { visibilityLosses: 0, pageHides: 0, focusLosses: 0 };
  let startedAt = performance.now(), previous = startedAt;
  const push = (rows, value, cap) => { rows.push(value); if (rows.length > cap) rows.shift(); };
  const frame = now => {
    // A callback already queued for this animation frame can predate a reset.
    // Keep the reset timestamp until a callback reaches the capture interval.
    if (previous === null || now >= previous) {
      if (previous !== null && document.visibilityState === 'visible') intervals.record(now - previous);
      previous = now;
    }
    host.requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') interruptions.visibilityLosses++;
    previous = document.visibilityState === 'visible' ? performance.now() : null;
  });
  host.addEventListener('pagehide', () => { interruptions.pageHides++; previous = null; });
  host.addEventListener('blur', () => { interruptions.focusLosses++; });
  host.requestAnimationFrame(frame);
  host.addEventListener('error', event => push(errors, String(event.message).slice(0, 500), 50));
  host.addEventListener('unhandledrejection', event => push(errors, String(event.reason?.message ?? event.reason).slice(0, 500), 50));
  const report = () => {
    return {
      id: 'community-seasons-qa-v1', storagePrefix: STORAGE_PREFIX, cloud: 'disabled',
      build,
      environment: {
        userAgent: navigator.userAgent, locale: document.documentElement.lang,
        viewport: { width: host.innerWidth, height: host.innerHeight, dpr: host.devicePixelRatio },
        visible: document.visibilityState === 'visible', focused: document.hasFocus(),
        activated: navigator.userActivation?.hasBeenActive ?? false,
      },
      metrics: {
        elapsedMs: performance.now() - startedAt, ...intervals.report(), interruptions: { ...interruptions }, errors: [...errors],
      },
      note: 'Foreground animation-frame cadence only; no native hardware or render-CPU claim. Save values are never exported.',
    };
  };
  host.__communitySeasonsQA = Object.freeze({
    id: 'community-seasons-qa-v1', storagePrefix: STORAGE_PREFIX, cloud: 'disabled', build, report,
    resetMetrics() {
      intervals.reset(); errors.length = 0;
      for (const key of Object.keys(interruptions)) interruptions[key] = 0;
      startedAt = performance.now(); previous = startedAt;
      return report();
    },
  });
  document.querySelector('#qa-export').addEventListener('click', () => {
    const url = host.URL.createObjectURL(new host.Blob([JSON.stringify(report(), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `community-seasons-qa-${Date.now()}.json`; link.click();
    host.setTimeout(() => host.URL.revokeObjectURL(url), 1000);
  });
}
