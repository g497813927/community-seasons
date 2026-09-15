import { startArchivedPreview } from '../browser-bootstrap.mjs';

void startArchivedPreview({
  origin: 'http://127.0.0.1:3029', prefix: 'qa-archive-licenses:',
  initialize() {
    const params = new URLSearchParams(location.search);
    localStorage.setItem('community-seasons-controls-seen', '1');
    localStorage.setItem('community-seasons-locale', params.get('lang') || 'en');
    window.__licensesQA = { created: 0 };
  },
  loadGame: () => import('../../../src/main'),
});
