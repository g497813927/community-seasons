import { isolateStorage } from '../preview/storage.mjs';
import { installFunctionalProbe, FUNCTIONAL_PREFIX } from './functional-probe';

// Install isolation before any production module reads saves or initializes.
isolateStorage(Storage.prototype, FUNCTIONAL_PREFIX);
localStorage.setItem('community-seasons-controls-seen', '1');
localStorage.setItem('community-seasons-locale', 'en');
installFunctionalProbe();
await import('../../../src/main');
