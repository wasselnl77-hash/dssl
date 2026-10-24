#!/usr/bin/env node
/* test-all.mjs: run every suite and say plainly what passed.
 *   node scripts/test-all.mjs               everything (needs Chrome for the browser suites)
 *   node scripts/test-all.mjs --no-browser  the fast ones only
 * Exit code is 0 only if every suite passed. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { findChrome } from './lib/browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const skipBrowser = process.argv.includes('--no-browser');
const withEditor = process.argv.includes('--editor');   // also run the extension inside a real VS Code / VSCodium (needs a display)
const SUITES = [
  ['engine 0.5', 'test-v050.mjs'], ['engine 0.6', 'test-v060.mjs'], ['engine 0.7', 'test-v070.mjs'], ['parser lines 0.7.1', 'test-v071.mjs'],
  ['review fixes 0.7.2', 'test-v072.mjs'], ['exit lane 0.8.0', 'test-v073.mjs'], ['follow-up 0.8.1', 'test-v081.mjs'], ['cascade 0.8.2', 'test-v082.mjs'],
  ['color, texture, aura, slider, lint, import, share 0.9.0', 'test-v090.mjs'], ['editor extension', 'test-extension-lib.mjs'],
  ['site stylesheets compile', 'dssl-styles-check.mjs'], ['guide examples compile', 'test-guide-examples.mjs'],
  ['designer: state to DSSL and back', 'test-designer.mjs'], ['designer: editor wiring (fake vscode)', 'test-designer-host.mjs'],
  ['guide examples in a browser', 'test-guide-browser.mjs', true], ['0.9.0 in a browser', 'test-browser-v090.mjs', true], ['designer panel in a browser', 'test-designer-browser.mjs', true], ['glass, tilt, wood, baked textures, counters 0.10-0.11', 'test-v0100.mjs', true], ['symmetrical, fonts, gradients, inspector, hot reload 0.12', 'test-v0120.mjs', true], ['build fidelity, source maps, strict CSP, server rendering 0.13', 'test-v0130.mjs', true], ['built CSS with JavaScript off vs the engine, every page', 'test-static-parity.mjs', true],
];

if (!skipBrowser && !findChrome()) {
  console.error('No Chrome or Chromium found for the browser suites. Install one, set DSSL_CHROME, or run with --no-browser.');
  process.exit(2);
}
const rows = [];
if (withEditor) SUITES.push(['extension inside a real editor', 'test-in-editor.mjs', true], ['designer and typing in a real editor', 'test-editor-ui.mjs', true]);
for (const [name, file, browser] of SUITES) {
  if (browser && skipBrowser) { rows.push([name, 'skipped', '']); continue; }
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--no-warnings', join(here, file)], { encoding: 'utf8', cwd: join(here, '..') });
  const out = (r.stdout || '') + (r.stderr || '');
  const all = [...out.matchAll(/(\d+) passed, (\d+) failed/g)];
  const m = all.length ? all[all.length - 1] : /(\d+) blocks checked/.exec(out);
  const passed = r.status === 0;
  rows.push([name, passed ? 'ok' : 'FAILED', `${m ? m[0] : (/CHECK OK/.test(out) ? 'all compile' : '')} ${((Date.now() - t0) / 1000).toFixed(1)}s`]);
  if (!passed) console.log(`\n---- ${file} ----\n${out.split('\n').filter((l) => /FAIL|rror/.test(l)).slice(0, 12).join('\n')}\n`);
}
const w = Math.max(...rows.map((r) => r[0].length));
console.log('');
for (const [n, s, d] of rows) console.log(`${s === 'ok' ? '  ok     ' : s === 'skipped' ? '  skipped' : '  FAILED '} ${n.padEnd(w)}  ${d}`);
const bad = rows.filter((r) => r[1] === 'FAILED').length;
console.log(`\n${bad ? bad + ' suite(s) failed' : 'everything passed'}`);
process.exit(bad ? 1 : 0);
