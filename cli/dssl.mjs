#!/usr/bin/env node
/* =========================================================================
 * dssl — the command line for the DSSL style language
 *
 *   dssl check styles.dssl [more.dssl …] [--json] [--strict] [--quiet]
 *       Compile files with the REAL parser + resolver (the same engine the
 *       browser runs). Prints file:line diagnostics with did-you-mean hints.
 *       Exit 1 on errors, 2 on usage problems. --strict makes warnings fatal.
 *       --json emits machine-readable diagnostics for CI and editors.
 *
 *   dssl build styles.dssl [-o out.css] [--json] [--no-banner]
 *       The exit lane: compile the static subset to a real .css file.
 *       Tokens become custom properties, states become :hover, layers become
 *       @layer, motions become @keyframes, raw { } passes through verbatim.
 *       @signal rules and animate:/engine-native properties stay in the
 *       runtime — the report says exactly what was left behind.
 *
 * Files are compiled in the order given; every bundle's tokens fold into the
 * next (name a tokens.dssl first, exactly like <link> order in the browser).
 * ========================================================================= */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve as pathResolve, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// the engine is plain ESM in public/dssl — import directly, no build step
const here = pathResolve(dirname(fileURLToPath(import.meta.url)), '..');
const { parse } = await import('file://' + join(here, 'public/dssl/parser.js'));
const { resolve } = await import('file://' + join(here, 'public/dssl/resolver.js'));
const { toCSS } = await import('file://' + join(here, 'public/dssl/static.js'));
const { VERSION } = await import('file://' + join(here, 'public/dssl/index.js'));

const USAGE = `dssl v${VERSION} — the DSSL style language

  dssl check <files…>    compile with the real engine, print diagnostics
                         --json    machine-readable output
                         --strict  warnings are errors too (exit 1)
                         --quiet   only print diagnostics, no summary
  dssl build <file>      compile the static subset to a real .css file
                         -o <out.css>   output path (default: <file>.css)
                         --json         machine-readable report
                         --no-banner    omit the generated-file header
  dssl --version         print the version`;

const readArg = (args, flag) => {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  args.splice(i, 1);
  return args.splice(i, 1)[0] || null;
};

const readSource = (file) => {
  try {
    statSync(file);
    return readFileSync(file, 'utf8');
  } catch {
    console.error(`dssl: cannot read ${file}`);
    process.exit(2);
  }
};

/** compile files in order, folding tokens forward like the browser does */
function compileAll(files) {
  const out = [];
  let tokenBase = null;
  for (const file of files) {
    const src = readSource(file);
    const name = basename(file);
    const { ast, errors: parseErrors } = parse(src, name);
    let doc;
    try {
      doc = resolve(ast, name, tokenBase);
    } catch (e) {
      // the compiler must never throw — this is a bug report if it happens
      doc = { rules: [], shadowRules: [], raws: [], errors: [{ file: name, line: 0, message: `internal compiler error: ${e.message}`, hint: 'please report this — a snippet that crashes the compiler is a bug in DSSL, not in your code' }], warnings: [], tokens: {} };
    }
    const all = [...parseErrors.map(e => ({ ...e, file: name })), ...doc.errors.map(e => ({ ...e, file: e.file || name }))];
    out.push({ file, name, doc, errors: all, warnings: doc.warnings || [] });
    tokenBase = { ...(tokenBase || {}), ...doc.tokens };
  }
  return out;
}

const printDiags = (results, quiet) => {
  let errCount = 0, warnCount = 0;
  for (const r of results) {
    for (const e of r.errors) {
      errCount++;
      console.error(`${e.file || r.name}:${e.line ?? 0} — error — ${e.message}${e.hint ? `\n    ${e.hint}` : ''}`);
    }
    for (const w of r.warnings) {
      warnCount++;
      console.error(`${w.file || r.name}:${w.line ?? 0} — warning — ${w.message}${w.hint ? `\n    ${w.hint}` : ''}`);
    }
  }
  if (!quiet && results.length > 1) {
    console.error(`\n${results.length} file(s), ${errCount} error(s), ${warnCount} warning(s)`);
  }
  return { errCount, warnCount };
};

const args = process.argv.slice(2);
const cmd = args.shift();

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(USAGE);
  process.exit(cmd ? 0 : 2);
}
if (cmd === '--version' || cmd === '-v') {
  console.log(VERSION);
  process.exit(0);
}

if (cmd === 'check') {
  const json = args.includes('--json');
  const strict = args.includes('--strict');
  const quiet = args.includes('--quiet');
  for (const f of ['--json', '--strict', '--quiet']) { const i = args.indexOf(f); if (i !== -1) args.splice(i, 1); }
  if (!args.length) { console.error('dssl check: give me at least one .dssl file'); process.exit(2); }
  const results = compileAll(args);
  if (json) {
    console.log(JSON.stringify({
      version: VERSION,
      files: results.map(r => ({
        file: r.file,
        ok: r.errors.length === 0 && (!strict || r.warnings.length === 0),
        errors: r.errors.map(e => ({ file: e.file || r.name, line: e.line ?? 0, message: e.message, hint: e.hint || null })),
        warnings: r.warnings.map(w => ({ file: w.file || r.name, line: w.line ?? 0, message: w.message, hint: w.hint || null })),
      })),
    }, null, 2));
  } else {
    printDiags(results, quiet);
  }
  const bad = results.some(r => r.errors.length || (strict && r.warnings.length));
  process.exit(bad ? 1 : 0);
}

if (cmd === 'build') {
  const json = args.includes('--json');
  const banner = !args.includes('--no-banner');
  for (const f of ['--json', '--no-banner']) { const i = args.indexOf(f); if (i !== -1) args.splice(i, 1); }
  const outPath = readArg(args, '-o') || readArg(args, '--out');
  if (!args.length) { console.error('dssl build: give me a .dssl file to build'); process.exit(2); }
  const input = args[0];
  const results = compileAll([input]);
  const r = results[0];
  const built = toCSS(r.doc, { file: r.name, banner });
  const outputPath = outPath || (input.replace(/\.dssl$/i, '') + '.css');
  if (json) {
    console.log(JSON.stringify({
      version: VERSION,
      input: r.file,
      output: outputPath,
      ok: r.errors.length === 0,
      errors: r.errors.map(e => ({ file: e.file || r.name, line: e.line ?? 0, message: e.message, hint: e.hint || null })),
      warnings: r.warnings.map(w => ({ file: w.file || r.name, line: w.line ?? 0, message: w.message, hint: w.hint || null })),
      report: built.report,
      css: built.css,
    }, null, 2));
  } else {
    writeFileSync(outputPath, built.css);
    const rep = built.report;
    console.log(`built ${outputPath} from ${r.file}`);
    console.log(`  ${rep.rules} rule(s), ${rep.shadowRules} pseudo-element rule(s), ${rep.keyframes} @keyframes, ${rep.raws} raw block(s)`);
    if (rep.layers.length) console.log(`  layers: ${rep.layers.join(' < ')}`);
    if (rep.seenStripped) console.log(`  ${rep.seenStripped} seen rule(s) applied unconditionally (the no-JS state)`);
    if (rep.skippedSignals || rep.skippedEngine) {
      console.log(`  stays in the runtime: ${rep.skippedSignals} @signal rule(s), ${rep.skippedEngine} engine-native rule(s)`);
    }
    printDiags(results, true);
  }
  process.exit(r.errors.length ? 1 : 0);
}

console.error(`dssl: unknown command "${cmd}"\n\n${USAGE}`);
process.exit(2);
