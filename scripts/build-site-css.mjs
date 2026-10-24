#!/usr/bin/env node
/* build-site-css.mjs: compile the site's own stylesheets into public/site.css (+ site.css.map).
 *
 * The site is written in DSSL and the engine applies it in the browser. This also ships the same sheets as plain CSS, so
 * the page is styled on first paint, with JavaScript off, in a crawler, and in server-rendered HTML, which is exactly what
 * `dssl build` is for. The engine then adds what a build cannot keep (tilt, aura, animation, bend and stretch...).
 * Runs before `next build` (see package.json). */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHEETS = ['tokens', 'site', 'home', 'docs', 'playground', 'changelog', 'bench'];   // the order the page loads them in
mkdirSync(path.join(root, 'public'), { recursive: true });
const r = spawnSync(process.execPath, ['--no-warnings', path.join(root, 'cli/dssl.mjs'), 'build', ...SHEETS.map((s) => path.join('public/styles', s + '.dssl')), '-o', 'public/site.css', '--reset', '--sourcemap', '--no-banner'], { cwd: root, encoding: 'utf8' });
process.stdout.write(r.stdout); process.stderr.write(r.stderr);
process.exit(r.status || 0);
