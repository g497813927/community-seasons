import { createProgress, PROGRESS_KEY } from '../../../../src/lib/game/store';
import { startArchivedPreview } from '../browser-bootstrap.mjs';

void startArchivedPreview({
  origin: 'http://127.0.0.1:3030', prefix: 'qa-archive-boost-controls:',
  initialize() {
    const params = new URLSearchParams(location.search);
    const progress = createProgress();
    progress.wallet = 10000;
    progress.inventory = { headstart: 2, shield: 2, doubleCoins: 1, portal: 1 };
    progress.skills.magnet.unlocked = true;
    progress.equippedSkill = 'magnet';
    progress.portalDestination = 'summer';
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    localStorage.setItem('community-seasons-controls-seen', '1');
    localStorage.setItem('community-seasons-locale', params.get('lang') || 'en');
    window.__boostQA = { created: 0, frozen: true };
  },
  loadGame: () => import('../../../../src/main'),
});
