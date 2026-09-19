import path from 'node:path';

// Evidence paths are relative links as well as filesystem paths. Persist them
// with URL separators, even when a caller supplies Windows path segments.
export function reportPath(...segments) {
  return path.posix.join(...segments.map(segment => segment.replaceAll('\\', '/')));
}
