import { withBrowser } from './lib/browser-harness.mjs';
import { writeFileSync } from 'node:fs';
const [,, out, w = '700', h = '420', wait = '900'] = process.argv;
const css = process.env.CSS, body = process.env.BODY;
const page = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#0b0d16;height:2000px"><style type="text/dssl">${css}</style>${body}<script type="module" src="/dssl/boot.js"></script>`;
await withBrowser(async ({ open, errors }) => {
  const p = await open('/p'); await p.waitForFunction(`window.DSSL && document.documentElement.classList.contains('dssl-ready')`); await p.waitForTimeout(+wait);
  writeFileSync(out, await p.screenshot({ clip: { x: 0, y: 0, width: +w, height: +h } }));
  console.log('errors', errors, await p.evaluate(() => JSON.stringify(DSSL.errors())));
}, { pages: { '/p': page }, viewport: { width: +w, height: +h } });
