#!/usr/bin/env node
/* sync-extension-engine.mjs - copy the real compiler into the editor
 * extension so diagnostics in the editor are the SAME errors the browser
 * shows. Run after any engine change, before packaging the .vsix. */
import { copyFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// the resolver imports the others, so the editor needs every one of them
const files = ['parser.js', 'resolver.js', 'utils.js', 'color.js', 'texture.js', 'aura.js', 'slider.js', 'lint.js', 'import.js'];

for (const f of files) {
  const src = path.join(root, 'public', 'dssl', f);
  const dst = path.join(root, 'dssl-vscode', 'lib', 'engine', f);
  copyFileSync(src, dst);
  const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12);
  const ok = hash(src) === hash(dst);
  console.log(`${ok ? 'synced' : 'MISMATCH'} ${f}`);
}
console.log('engine copies now identical to public/dssl/');
