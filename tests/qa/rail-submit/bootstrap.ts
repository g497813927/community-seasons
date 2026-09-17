import { isolateStorage } from '../preview/storage.mjs';

if (location.hostname !== '127.0.0.1' || !location.pathname.startsWith('/qa/rail-submit/')) {
  throw Error('Rail submission QA requires its dedicated localhost fixture path.');
}
isolateStorage(Storage.prototype, 'qa-rail-submit-v1:');
localStorage.setItem('community-seasons-controls-seen', '1');
await import('../../../src/main');
