import { startArchivedPreview } from '../browser-bootstrap.mjs';

void startArchivedPreview({
  origin: 'http://127.0.0.1:3028', prefix: 'qa-archive-android-text:',
  initialize() {
    const params = new URLSearchParams(location.search);
    localStorage.setItem('community-seasons-controls-seen', '1');
    localStorage.setItem('community-seasons-locale', params.get('lang') || 'en');
    window.__androidQA = { mode: params.get('mode') || 'over', maxNumbers: params.get('numbers') === 'max' };
  },
  async loadGame() {
    const [{ createRoot }, { default: Game }] = await Promise.all([import('react-dom/client'), import('@/app/page')]);
    await import('@/app/globals.css');
    createRoot(document.getElementById('root')!).render(<Game/>);
  },
});
