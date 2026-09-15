import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { compileGameModules } from '../../tests/helpers/compile-game-modules.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (args.length && !(args.length === 2 && args[0] === '--locale' && ['en', 'zh-CN'].includes(args[1]))) {
  throw Error('Usage: node scripts/readme-thumbnail/generate.mjs [--locale en|zh-CN]');
}
const locale = args[1] ?? 'en';
const output = path.join(root, 'docs/images', `community-seasons-${locale}.png`);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'community-seasons-thumbnail-'));
let browser, server;
try {
  const compiled = path.join(temporary, 'compiled');
  compileGameModules(pathToFileURL(compiled + path.sep));
  await fs.copyFile(new URL('./poster.mjs', import.meta.url), path.join(temporary, 'poster.mjs'));
  const html = `<!doctype html><html lang="${locale}"><meta charset="utf-8"><title>Community Seasons thumbnail</title><style>body{margin:0}canvas{display:block}</style><canvas id="poster" width="1200" height="900"></canvas><script type="module" src="/poster.mjs"></script></html>`;
  server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method !== 'GET') { response.writeHead(405).end(); return; }
      if (url.pathname === '/') { response.writeHead(200, { 'content-type': 'text/html' }).end(html); return; }
      // Serve only generated browser modules from the temporary fixture.
      if (!/^\/(?:poster\.mjs|compiled\/[a-zA-Z0-9_/-]+\.mjs)$/.test(url.pathname)) {
        response.writeHead(404).end(); return;
      }
      const body = await fs.readFile(path.join(temporary, url.pathname.slice(1)));
      response.writeHead(200, { 'content-type': 'text/javascript' }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin);
  try {
    await page.waitForFunction(() => window.thumbnailReady, undefined, { timeout: 15000 });
  } catch (error) {
    if (errors.length) throw Error(`Thumbnail rendering failed: ${errors.join('\n')}`);
    throw error;
  }
  if (errors.length) throw Error(errors.join('\n'));
  const data = await page.locator('#poster').evaluate(canvas => canvas.toDataURL('image/png').split(',')[1]);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, Buffer.from(data, 'base64'));
  console.log(`Rendered ${path.relative(root, output)} (1200 × 900, ${locale}) from the current game renderer.`);
} finally {
  if (browser) await browser.close();
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  await fs.rm(temporary, { recursive: true, force: true });
}
