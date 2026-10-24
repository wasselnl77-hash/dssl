/* browser-harness.mjs: the one place the browser tests get a page from.
 *
 * Real behaviour (canvas pixels, SVG-filter textures, ::-webkit-slider-thumb,
 * rAF timing) cannot be checked in Node, so these tests drive a real Chrome.
 * It uses playwright-core, which ships no browser, and finds one that is
 * already installed. Point DSSL_CHROME at a binary if yours is somewhere odd.
 *
 *   import { withBrowser } from './lib/browser-harness.mjs';
 *   await withBrowser(async ({ open }) => { const page = await open('/x.html'); ... });
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.dssl': 'text/plain', '.svg': 'image/svg+xml' };

const CANDIDATES = [
  process.env.DSSL_CHROME,
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

export function findChrome() {
  return CANDIDATES.find((p) => existsSync(p)) || null;
}

/** static server: /dssl/* is public/dssl/*, /styles/* is public/styles/*, /t/* is a scratch dir of test pages */
export function startServer(pages = {}) {
  const server = createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (pages[url]) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(pages[url]); }
    let file;
    if (url.startsWith('/dssl/')) file = join(ROOT, 'public', url);
    else if (url.startsWith('/styles/') || url.startsWith('/showcase/')) file = join(ROOT, 'public', url);
    else file = join(ROOT, url);
    try {
      const body = readFileSync(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'access-control-allow-origin': '*' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port })));
}

export async function withBrowser(fn, { pages = {}, viewport = { width: 1000, height: 700 }, reducedMotion = 'no-preference', colorScheme = 'light', deviceScaleFactor = 1 } = {}) {
  const exe = findChrome();
  if (!exe) throw new Error('no Chrome found; set DSSL_CHROME to a Chrome or Chromium binary');
  const { server, port } = await startServer(pages);
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  const context = await browser.newContext({ viewport, reducedMotion, colorScheme, deviceScaleFactor });
  const base = `http://127.0.0.1:${port}`;
  const errors = [];
  try {
    const open = async (path, { wait = 'load' } = {}) => {
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(base + path, { waitUntil: wait });
      return page;
    };
    return await fn({ open, base, errors, context, browser });
  } finally {
    await browser.close();
    server.close();
  }
}
