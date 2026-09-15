// This pacing-only test never reads or writes Toy cloud storage.
export { isToyPage, loadToySdk } from '../../../src/lib/game/toy-sdk';
export async function loadToyCloudStorage() { return null; }
