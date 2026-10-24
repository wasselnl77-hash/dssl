#!/usr/bin/env node
/* gen-site-vocab.mjs: turn the vocabulary modules into data the website imports, so the docs
 * pages can list every texture preset and every setting without a second copy that could drift.
 *   writes src/lib/vocab.json
 *   rewrites the generated block of swatch rules in public/styles/docs.dssl
 * It runs before every build (npm "prebuild") and a test checks the committed files are current. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { PRESETS, PRESET_NAMES, GENERATORS, TEXTURE_KEYS } from '../public/dssl/texture.js';
import { GLOW_KEYS, PARTICLE_KEYS } from '../public/dssl/aura.js';
import { SLIDER_CLAUSES } from '../public/dssl/slider.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function buildVocab() {
  const keys = (o) => Object.entries(o).map(([key, v]) => ({ key, doc: v.doc }));
  return {
    presets: PRESET_NAMES.map((name) => ({ name, doc: PRESETS[name].doc })),
    generators: GENERATORS,
    textureKeys: Object.entries(TEXTURE_KEYS).map(([key, v]) => ({ key, doc: v.doc, words: v.words })),
    glowKeys: keys(GLOW_KEYS),
    particleKeys: keys(PARTICLE_KEYS),
    sliderClauses: Object.entries(SLIDER_CLAUSES).map(([key, form]) => ({ key, form })),
  };
}

export function swatchRules() {
  return PRESET_NAMES.map((n) => `.tx-${n} { texture: ${n} }`).join('\n');
}

const BEGIN = '// <generated: texture swatches. Run scripts/gen-site-vocab.mjs, do not edit by hand>';
const END = '// </generated>';

export function applyToDocsDssl(src) {
  const a = src.indexOf(BEGIN), b = src.indexOf(END);
  if (a === -1 || b === -1) throw new Error('docs.dssl has no generated block');
  return src.slice(0, a + BEGIN.length) + '\n' + swatchRules() + '\n' + src.slice(b);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const json = JSON.stringify(buildVocab(), null, 2) + '\n';
  writeFileSync(join(root, 'src/lib/vocab.json'), json);
  const f = join(root, 'public/styles/docs.dssl');
  writeFileSync(f, applyToDocsDssl(readFileSync(f, 'utf8')));
  console.log(`vocab: ${PRESET_NAMES.length} presets, ${Object.keys(TEXTURE_KEYS).length} texture settings, ${Object.keys(GLOW_KEYS).length} glow and ${Object.keys(PARTICLE_KEYS).length} particle settings`);
}
