import fs from 'node:fs/promises';
import path from 'node:path';

export function fixtureHandler(previewDist, previewPath, files = fs) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
  return async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const relative = decodeURIComponent(pathname.slice(previewPath.length)) || 'index.html';
      const file = path.resolve(previewDist, relative);
      if (!['GET', 'HEAD'].includes(request.method) || !pathname.startsWith(previewPath) || !file.startsWith(previewDist + path.sep)) {
        response.writeHead(404); response.end(); return;
      }
      // HEAD checks existence and file type without loading the response body.
      if (!(await files.stat(file)).isFile()) {
        response.writeHead(404); response.end(); return;
      }
      const contents = request.method === 'HEAD' ? undefined : await files.readFile(file);
      response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(contents);
    } catch {
      response.writeHead(404); response.end();
    }
  };
}

// Playwright serializes this function into the page; keep it self-contained.
export function initializeBrowserEmulation({ entries, platform }) {
  for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  const original = { type: screen.orientation?.type, angle: screen.orientation?.angle, windowOrientation: window.orientation };
  const metadata = { orientationBeforeAdjustment: original, orientationAdjusted: false, orientationAdjustmentError: null };
  window.__qaBrowserEmulation = metadata;
  // Correct only Playwright WebKit's contradictory portrait simulation. This
  // never establishes actual Safari orientation support or changes game code.
  if (platform !== 'ios' || !original.type?.startsWith('portrait') || Math.abs(original.angle) !== 90 || original.windowOrientation !== 0 || innerHeight <= innerWidth) return;
  const descriptor = Object.getOwnPropertyDescriptor(screen.orientation, 'angle');
  if (descriptor?.configurable === false) {
    metadata.orientationAdjustmentError = 'screen.orientation.angle is not configurable.';
    return;
  }
  try {
    Object.defineProperty(screen.orientation, 'angle', { configurable: true, get: () => 0 });
    metadata.orientationAdjusted = true;
    metadata.reason = 'WebKit emulation exposed portrait-primary with angle 90; aligned the simulated angle with portrait viewport and window.orientation=0.';
  } catch (error) {
    metadata.orientationAdjustmentError = String(error);
  }
}
