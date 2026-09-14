import { createProgress, PROGRESS_KEY } from '../../src/lib/game/store';

// Dedicated fixture origin and fresh browser contexts keep player saves separate.
if (location.hostname !== '127.0.0.1' || location.port !== '3030')
  throw new Error('Boost controls QA must run on its isolated local origin.');
localStorage.clear();
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
void import('../../src/main');
