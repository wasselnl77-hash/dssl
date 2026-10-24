#!/usr/bin/env node
/* texture-gallery.mjs: render every texture preset on a swatch and save a PNG.
 *   node scripts/texture-gallery.mjs out.png [--base "#b8a58a"] [--cols 6]
 * Useful for eyeballing a new preset, and the tests use the same page to check
 * that each one actually paints something. */
import { withBrowser } from './lib/browser-harness.mjs';

const args = process.argv.slice(2);
const out = args.find((a) => a.endsWith('.png')) || 'texture-gallery.png';
const flag = (name, d) => { const i = args.indexOf(name); return i === -1 ? d : args[i + 1]; };
const base = flag('--base', '#b8a58a');
const cols = Number(flag('--cols', 6));

export const galleryPage = (base, cols) => `<!doctype html><meta charset=utf-8><body style="margin:0;background:#f4f2f7;font:12px system-ui">
<div id=g style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px;padding:10px"></div>
<script type=module>
import { PRESET_NAMES, parseTexture, buildTexture } from '/dssl/texture.js';
import { parseColor } from '/dssl/color.js';
const hooks = { error: (m) => console.error(m), color: (w) => w, suggest: () => null };
const g = document.getElementById('g');
window.report = {};
for (const name of PRESET_NAMES) {
  const tex = buildTexture(parseTexture(name, hooks), parseColor);
  const cell = document.createElement('div');
  cell.innerHTML = '<div class=sw style="height:96px;border-radius:6px;background-color:${base}"></div><div style="padding:3px 2px">' + name + '</div>';
  const sw = cell.firstChild;
  sw.style.backgroundImage = tex.image; sw.style.backgroundSize = tex.size; sw.style.backgroundRepeat = tex.repeat;
  sw.style.backgroundPosition = tex.position; sw.style.backgroundBlendMode = tex.blend;
  g.appendChild(cell);
  window.report[name] = tex.count;
}
window.ready = true;
</script>`;

if (import.meta.url === `file://${process.argv[1]}`) {
  await withBrowser(async ({ open }) => {
    const page = await open('/gallery');
    await page.waitForFunction('window.ready === true');
    await page.waitForTimeout(400);
    await page.screenshot({ path: out, fullPage: true });
    console.log('wrote', out);
  }, { pages: { '/gallery': galleryPage(base, cols) }, viewport: { width: 1100, height: 700 } });
}
