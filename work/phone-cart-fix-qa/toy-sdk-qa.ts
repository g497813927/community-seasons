// This pacing-only test never reads or writes Toy cloud storage.
export { isToyPage, loadToySdk } from '../../outputs/community-seasons/lib/game/toy-sdk';
export async function loadToyCloudStorage() { return null; }
