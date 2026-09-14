export const BUILD_INFO_ELEMENT = 'community-seasons-qa-build';

// Shared by the browser probe and the device inspector; contains no Node APIs.
export function validateBuildInfo(build) {
  if (build?.version !== 1 || !build.sourceHashes || typeof build.sourceHashes !== 'object' || Array.isArray(build.sourceHashes))
    throw Error('Invalid QA build provenance.');
  const entries = Object.entries(build.sourceHashes);
  if (!entries.length || entries.some(([file, hash]) =>
    !file || file.startsWith('/') || file.includes('\\') || file.split('/').some(part => !part || part === '.' || part === '..') ||
    typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)))
    throw Error('Invalid QA build source hashes.');
  return Object.freeze({ version: 1, sourceHashes: Object.freeze(Object.fromEntries(entries)) });
}

export function readEmbeddedBuildInfo(document) {
  const element = document.getElementById(BUILD_INFO_ELEMENT);
  // Development/HMR pages remain inspectable, but cannot become measured builds.
  return element ? validateBuildInfo(JSON.parse(element.textContent)) : null;
}
