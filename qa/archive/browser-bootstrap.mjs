import { isolateStorage } from '../preview/storage.mjs';

export function startArchivedPreview({ origin, prefix, initialize, loadGame }, host = window) {
  if (typeof origin !== 'string' || !origin || host.location.origin !== origin)
    throw Error('Archived QA must run on its explicitly configured fixture origin.');
  if (typeof initialize !== 'function' || typeof loadGame !== 'function')
    throw Error('Archived QA initialization and game loader are required.');
  // Origin validation must happen before even accessing browser storage. Both
  // local and session storage receive the same prefix-limited methods.
  isolateStorage(host.Storage.prototype, prefix);
  host.localStorage.clear();
  initialize();
  return loadGame();
}
