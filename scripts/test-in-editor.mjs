#!/usr/bin/env node
/* test-in-editor.mjs: run the extension inside a REAL VS Code or VSCodium.
 *
 *   node scripts/test-in-editor.mjs                 finds VSCodium (flatpak or on PATH) or VS Code
 *   DSSL_EDITOR="code" node scripts/test-in-editor.mjs
 *
 * It opens a real editor window (a throwaway profile, so yours is untouched), loads the extension
 * from this checkout, runs dssl-vscode/test/host/index.js in the extension host, and prints the
 * results. Needs a display, so it is not part of test-all.mjs.
  * The UI half (typing, hover, the designer panel) is scripts/test-editor-ui.mjs. */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ext, findEditor, scratchWorkspace, editorArgs } from './lib/editor.mjs';

const { dir, ws } = scratchWorkspace('host');
const out = path.join(dir, 'results.json');
const editor = findEditor({ DSSL_TEST_OUT: out });
if (!editor) { console.error('No VS Code or VSCodium found. Install one, or set DSSL_EDITOR to its command.'); process.exit(2); }
console.log(`launching: ${editor.cmd} ${editor.pre.filter((a) => !a.startsWith('--env')).join(' ')} ...`);
const r = spawnSync(editor.cmd, editorArgs(editor, dir, ws, [`--extensionTestsPath=${path.join(ext, 'test/host')}`]), { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: { ...process.env, DSSL_TEST_OUT: out }, timeout: 120000 });

if (!existsSync(out)) {
  console.error('The editor exited without writing results.');
  console.error((r.stdout || '').slice(-1500)); console.error((r.stderr || '').slice(-2500));
  process.exit(1);
}
const results = JSON.parse(readFileSync(out, 'utf8'));
let pass = 0, fail = 0;
for (const x of results) { if (x.ok) { pass++; console.log(`  ok  ${x.name}`); } else { fail++; console.log(`FAIL  ${x.name}; ${x.extra}`); } }
console.log(`\n${pass} passed, ${fail} failed (in a real editor)`);
process.exit(fail ? 1 : 0);
