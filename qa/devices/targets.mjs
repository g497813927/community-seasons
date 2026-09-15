const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const PREVIEW_PATH = /^\/toy\/preview\/preview_\w+\/index\.html$/;
const TOY_HOSTS = new Set(['www.bilibili.com', 'bilibili.com']);
const GAME_HOSTS = new Set(['www.bilibilitoy.com', 'bilibilitoy.com']);

function plainUrl(value, label) {
  let url;
  try { url = new URL(value); } catch { throw Error(`${label} must be an absolute URL.`); }
  if (url.username || url.password || url.hash)
    throw Error(`${label} cannot contain credentials or a fragment.`);
  return url;
}

export function validateEndpoint(value) {
  const url = plainUrl(value, 'Inspector endpoint');
  if (!['http:', 'https:'].includes(url.protocol) || !LOOPBACK.has(url.hostname) ||
      url.pathname !== '/' || url.search)
    throw Error('Inspector endpoint must be a loopback HTTP(S) origin, such as http://127.0.0.1:9222.');
  return url;
}

function isLanHost(host) {
  if (LOOPBACK.has(host) || host.endsWith('.local')) return true;
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
}

export function validatePage(value) {
  const url = plainUrl(value, 'Selected preview');
  if (!['http:', 'https:'].includes(url.protocol)) throw Error('Selected preview must use HTTP(S).');
  // Accept the dedicated qa-… suffix or a shortened <build>-<team> suffix.
  // Both require at least two nonempty segments after community-seasons-.
  if (/^community-seasons-[a-z0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.vercel\.app$/.test(url.hostname)) {
    if (url.protocol !== 'https:' || url.port || url.search || !['/', '/index.html'].includes(url.pathname))
      throw Error('Open the private Vercel access link first, then select its query-free HTTPS QA page.');
    return { url, hosted: false };
  }
  if (url.search) throw Error('Selected preview cannot contain query parameters.');
  if (TOY_HOSTS.has(url.hostname)) {
    if (url.protocol !== 'https:' || url.port || !PREVIEW_PATH.test(url.pathname) || url.search)
      throw Error('Select an isolated Toy /toy/preview/preview_…/index.html URL, never a published game.');
    return { url, hosted: true };
  }
  if (!isLanHost(url.hostname)) throw Error('Select a local/LAN QA preview, protected Vercel QA preview, or isolated Toy preview.');
  return { url, hosted: false };
}

export function matchingTargets(rows, page) {
  if (!Array.isArray(rows)) throw Error('Inspector did not return a target list.');
  return rows.filter(row => row && row.type === 'page' && row.url === page.url.href);
}

export function selectTarget(rows, page, id) {
  if (!id) throw Error('Select a target explicitly with --target ID after listing the matching preview.');
  const matches = matchingTargets(rows, page).filter(row => String(row.id) === id);
  if (matches.length !== 1) throw Error('The selected target must match exactly one page with the exact preview URL.');
  return matches[0];
}

export function validateWebSocket(value, endpoint) {
  const url = plainUrl(value, 'Inspector WebSocket');
  const protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
  const port = url.port || (url.protocol === 'wss:' ? '443' : '80');
  const endpointPort = endpoint.port || (endpoint.protocol === 'https:' ? '443' : '80');
  if (url.protocol !== protocol || url.hostname !== endpoint.hostname || port !== endpointPort || url.search)
    throw Error('Inspector WebSocket must use the selected loopback endpoint host and port.');
  return url.href;
}

export function selectFrame(tree, page) {
  const frames = [];
  function visit(branch) {
    if (!branch?.frame) return;
    frames.push(branch.frame);
    for (const child of branch.childFrames ?? []) visit(child);
  }
  visit(tree.frameTree);
  if (!frames.length || frames[0].url !== page.url.href)
    throw Error('The selected target navigated away from the exact preview.');
  if (!page.hosted) return frames[0];
  const matches = frames.slice(1).filter(frame => {
    try {
      const url = new URL(frame.url);
      return url.protocol === 'https:' && GAME_HOSTS.has(url.hostname) && !url.port &&
        !url.username && !url.password && !url.search && !url.hash && url.pathname === page.url.pathname;
    } catch { return false; }
  });
  if (matches.length !== 1) throw Error('The selected Toy preview must contain exactly one matching game iframe.');
  return matches[0];
}

export function selectContext(contexts, frameId) {
  const matches = contexts.filter(context => context.auxData?.frameId === frameId && context.auxData?.isDefault === true);
  if (matches.length > 1) throw Error('The selected QA frame has ambiguous default execution contexts.');
  return matches[0] ?? null;
}
