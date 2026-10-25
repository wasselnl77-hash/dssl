#!/usr/bin/env node
/* =========================================================================
 * dssl - the command line for the DSSL style language
 *
 *   dssl check styles.dssl [more.dssl …] [--json] [--strict] [--quiet]
 *       Compile files with the REAL parser + resolver (the same engine the
 *       browser runs). Prints file:line diagnostics with did-you-mean hints.
 *       Exit 1 on errors, 2 on usage problems. --strict makes warnings fatal.
 *       --json emits machine-readable diagnostics for CI and editors.
 *
 *   dssl import styles.css [-o out.dssl] [--stdout] [--json]
 *       Convert CSS to DSSL (semicolons, px, transition order, font:, @keyframes,
 *       !important, raw blocks) and report what could not be carried over.
 *
 *   dssl dev [dir] [--port 3000] [--inspect]
 *       A tiny static server that never caches and adds DSSL.watch() to every page it
 *       serves, so saving a .dssl file restyles the open page in place. Pages that load
 *       /dssl/boot.js get it from the engine folder if the served folder has none.
 *
 *   dssl build styles.dssl [-o out.css] [--json] [--strict] [--no-banner]
 *       The exit lane: compile the static subset to a real .css file.
 *       Tokens become custom properties, states become :hover, layers become
 *       @layer, motions become @keyframes, raw { } passes through verbatim.
 *       @signal rules and animate:/engine-native properties stay in the
 *       runtime - the report says exactly what was left behind.
 *
 * Files are compiled in the order given; every bundle's tokens fold into the
 * next (name a tokens.dssl first, exactly like <link> order in the browser).
 * ========================================================================= */
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { dirname, resolve as pathResolve, basename, join, relative as pathRelative } from 'node:path';
import { fileURLToPath } from 'node:url';

// the engine is plain ESM, import it directly, no build step. In a repo checkout
// it lives in public/dssl/. In the downloaded package (dssl-engine.zip) it sits
// next to cli/ as dssl/. 0.8.0 only knew the first layout, so the packaged CLI
// crashed with "module not found" for everyone who installed it.
const here = pathResolve(dirname(fileURLToPath(import.meta.url)), '..');
// 0.15.0: `--engine ./dssl` (or DSSL_ENGINE=./dssl) points at the engine folder wherever it is, so the CLI file can live anywhere
let engineDir = existsSync(join(here, 'public/dssl/parser.js')) ? join(here, 'public/dssl') : join(here, 'dssl');
{
  const i = process.argv.indexOf('--engine');
  let want = process.env.DSSL_ENGINE || null;
  if (i !== -1) { want = process.argv[i + 1] || null; process.argv.splice(i, want === null ? 1 : 2); if (want === null) { console.error('dssl: --engine needs a folder, e.g. --engine ./dssl'); process.exit(2); } }
  if (want) {
    const dir = pathResolve(want);
    if (!existsSync(join(dir, 'parser.js'))) { console.error(`dssl: ${dir} has no parser.js, so it is not the engine folder (the folder that holds parser.js, resolver.js, index.js...)`); process.exit(2); }
    engineDir = dir;
  }
}
const { parse } = await import('file://' + join(engineDir, 'parser.js'));
const { resolve } = await import('file://' + join(engineDir, 'resolver.js'));
const { toCSS } = await import('file://' + join(engineDir, 'static.js'));
const { VERSION } = await import('file://' + join(engineDir, 'index.js'));
const { importCss } = await import('file://' + join(engineDir, 'import.js'));
const { shadowWarnings } = await import('file://' + join(engineDir, 'lint.js'));

const USAGE = `dssl v${VERSION} - the DSSL style language

  dssl check <files…>    compile with the real engine, print diagnostics. A page (index.html) works too:
                         it takes the stylesheets in the order the page loads them
                         --json    machine-readable output
                         --strict  warnings are errors too (exit 1)
                         --quiet   only print diagnostics, no summary
  dssl build <files…>    (or a page, index.html) compile the static subset to a real .css file (several files: in load order, tokens first)
                         -o <out.css>   output path (default: <first file>.css)
                         --sourcemap    write <out.css>.map so devtools show the .dssl file and line of each rule
                         --map-name <f> file name for the map when your host will not serve *.map (default <out.css>.map)
                         --reset        include the small reset, as a layer that loses to everything
                         --inline-tokens  write each token's value in place of var(--dssl-x) where the token is defined once and
                                        never changed: the fastest CSS, but a token changed at run time will not reach it
                         --native-specificity  keep selectors as written. By default every selector is wrapped in :where(),
                                        so source order wins exactly like in the engine, not CSS specificity
                         --json         machine-readable report
                         --strict       warnings are errors too (exit 1)
                         --no-banner    omit the generated-file header
  dssl import <file.css> convert existing CSS to DSSL and report what could not carry over
                         -o <out.dssl>  output path (default: <file>.dssl)
                         --stdout       print the DSSL instead of writing a file
                         --json         machine-readable report
  dssl dev [dir]         serve a folder with hot reload: edit a .dssl file and the page restyles with no reload
                         --port <n>     port (default 3000)
                         --inspect      also open the in-page inspector (hover an element to see its rules)
  dssl --version         print the version

  every command: --engine <dir> uses the engine in that folder (default: the one next to this file; or set DSSL_ENGINE)`;

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

/**
 * 0.14.0: `dssl check index.html` and `dssl build index.html` read the page and take its stylesheets in the order the browser
 * loads them: every <link rel="stylesheet/dssl"> and every inline <style type="text/dssl"> (or <script type="text/dssl">),
 * top to bottom. Relative links are resolved against the page's folder; a leading / is tried against that folder first.
 * Nobody keeps a second list of files in a script any more, and the order cannot drift from what the runtime does.
 */
function expandInputs(args) {
  const out = [];
  for (const a of args) {
    if (!/\.html?$/i.test(a)) { out.push(a); continue; }
    const html = readSource(a);
    const dir = dirname(pathResolve(a));
    const found = [];
    const re = /<link\b[^>]*>|<(style|script)\b[^>]*type\s*=\s*["']text\/dssl["'][^>]*>([\s\S]*?)<\/\1>/gi;
    let n = 0, m;
    while ((m = re.exec(html))) {
      if (m[0].toLowerCase().startsWith('<link')) {
        if (!/rel\s*=\s*["']stylesheet\/dssl["']/i.test(m[0])) continue;
        const href = (m[0].match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
        if (!href || /^(https?:)?\/\//i.test(href)) continue;
        const clean = href.split(/[?#]/)[0];
        const cands = [join(dir, clean), join(dir, clean.replace(/^\//, '')), pathResolve(clean)];
        const hit = cands.find((c) => existsSync(c));
        if (!hit) { console.error(`dssl: ${a} links ${href}, which is not on disk (looked in ${dir})`); process.exit(2); }
        found.push(hit);
      } else {
        n++;
        const nm = (m[0].match(/data-dssl-name\s*=\s*["']([^"']+)["']/i) || [])[1] || `${basename(a)}#inline-${n}`;
        found.push({ name: nm, text: m[2], file: pathResolve(a) });
      }
    }
    if (!found.length) { console.error(`dssl: ${a} has no <link rel="stylesheet/dssl"> or <style type="text/dssl"> in it`); process.exit(2); }
    out.push(...found);
  }
  return out;
}

/** compile files in order, folding tokens forward like the browser does */
function compileAll(files) {
  const out = [];
  let tokenBase = null, motionBase = {};
  for (const item of expandInputs(files)) {
    const inline = typeof item === 'object';
    const file = inline ? item.file : item;
    const src = inline ? item.text : readSource(file);
    const name = inline ? item.name : basename(file);
    const { ast, errors: parseErrors } = parse(src, name);
    let doc;
    try {
      doc = resolve(ast, name, tokenBase, motionBase);
    } catch (e) {
      // the compiler must never throw - this is a bug report if it happens
      doc = { rules: [], shadowRules: [], raws: [], errors: [{ file: name, line: 0, message: `internal compiler error: ${e.message}`, hint: 'please report this - a snippet that crashes the compiler is a bug in DSSL, not in your code' }], warnings: [], tokens: {} };
    }
    const all = [...parseErrors.map(e => ({ ...e, file: name })), ...doc.errors.map(e => ({ ...e, file: e.file || name }))];
    out.push({ file, name, doc, errors: all, warnings: doc.warnings || [], text: src });
    tokenBase = { ...(tokenBase || {}), ...doc.tokens };
    motionBase = { ...motionBase, ...(doc.motionFrames || {}) };
  }
  // 0.15.0: a rule that can never win because a rule in a later file (or later in the same one) matches all it matches and sets the same thing.
  // Per file this is invisible; across the page's files it is the commonest silent loss.
  try {
    const all = [];
    out.forEach((x, i) => { for (const r of x.doc.rules || []) all.push({ ...r, file: r.file || x.name, order: i * 1e6 + (r.order || 0) }); });
    for (const w of shadowWarnings(all)) {
      const owner = out.find((x) => x.name === w.file) || out[0];
      owner.warnings = [...owner.warnings, w];
    }
  } catch { /* a lint must never break a compile */ }
  return out;
}

const printDiags = (results, quiet) => {
  let errCount = 0, warnCount = 0;
  for (const r of results) {
    for (const e of r.errors) {
      errCount++;
      console.error(`${e.file || r.name}:${e.line ?? 0} - error - ${e.message}${e.hint ? `\n    ${e.hint}` : ''}`);
    }
    for (const w of r.warnings) {
      warnCount++;
      console.error(`${w.file || r.name}:${w.line ?? 0} - warning - ${w.message}${w.hint ? `\n    ${w.hint}` : ''}`);
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
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
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
  if (!args.length) { console.error('dssl check: give me at least one .dssl file, or a page (index.html) to read the stylesheet order from'); process.exit(2); }
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

if (cmd === 'dev') {
  const { createServer } = await import('node:http');
  const { extname } = await import('node:path');
  const { readFile } = await import('node:fs/promises');
  const port = Number(readArg(args, '--port') || 3000);
  const inspectOn = args.includes('--inspect'); if (inspectOn) args.splice(args.indexOf('--inspect'), 1);
  const dir = pathResolve(args[0] || '.');
  if (!existsSync(dir)) { console.error(`dssl dev: ${dir} does not exist`); process.exit(2); }
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.dssl': 'text/plain; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain' };
  const inject = `<script>addEventListener('dssl-ready',function(){if(window.DSSL){DSSL.watch();${inspectOn ? 'DSSL.inspect();' : ''}}});</script>`;
  createServer(async (req, res) => {
    let url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url.endsWith('/')) url += 'index.html';
    const inside = (p) => p.startsWith(dir);
    let file = pathResolve(join(dir, url));
    if (!inside(file)) { res.writeHead(403); return res.end('no'); }
    if (!existsSync(file) && url.startsWith('/dssl/')) file = pathResolve(join(engineDir, url.slice(6)));
    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html');
      let body = await readFile(file);
      if (extname(file) === '.html') body = Buffer.from(String(body).includes('</body>') ? String(body).replace('</body>', inject + '</body>') : String(body) + inject);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found: ' + url); }
  }).listen(port, () => {
    console.log(`dssl dev: serving ${dir}`);
    console.log(`  http://localhost:${port}/   (hot reload on${inspectOn ? ', inspector on' : ''}; Ctrl+C to stop)`);
  });
} else if (cmd === 'build') {
  const json = args.includes('--json');
  const banner = !args.includes('--no-banner');
  const strict = args.includes('--strict');
  const sourcemap = args.includes('--sourcemap');
  const reset = args.includes('--reset');
  const nativeSpecificity = args.includes('--native-specificity');
  const inlineTokens = args.includes('--inline-tokens');
  for (const f of ['--json', '--no-banner', '--strict', '--sourcemap', '--reset', '--native-specificity', '--inline-tokens']) { const i = args.indexOf(f); if (i !== -1) args.splice(i, 1); }
  const outPath = readArg(args, '-o') || readArg(args, '--out');
  const mapName = readArg(args, '--map-name');   // some hosts refuse to serve *.map; a different name is the same map
  if (!args.length) { console.error('dssl build: give me a .dssl file to build (or several, in load order: tokens first)'); process.exit(2); }
  const inputs = [...args];
  const results = compileAll(inputs);
  inputs.length = 0; inputs.push(...results.map((x) => x.file));
  const errors = results.flatMap((x) => x.errors), warnings = results.flatMap((x) => x.warnings);
  const outputPath = outPath || (inputs[0].replace(/\.dssl$/i, '') + '.css');
  const outDir = dirname(pathResolve(outputPath));
  const sources = {};
  for (const x of results) sources[x.name] = { path: pathRelative(outDir, pathResolve(x.file)).split('\\').join('/'), content: x.text };
  const built = toCSS(results.map((x) => x.doc), {
    file: inputs.map((f) => basename(f)).join(' + '), banner, version: VERSION, reset, nativeSpecificity, inlineTokens,
    sourceMap: sourcemap, sources, mapFile: basename(outputPath), sourceMapUrl: sourcemap ? (mapName || basename(outputPath) + '.map') : undefined,
  });
  if (json) {
    console.log(JSON.stringify({
      version: VERSION,
      input: results[0].file, inputs: results.map((x) => x.file),
      output: outputPath,
      ok: errors.length === 0 && (!strict || warnings.length === 0),
      errors: errors.map(e => ({ file: e.file, line: e.line ?? 0, message: e.message, hint: e.hint || null })),
      warnings: warnings.map(w => ({ file: w.file, line: w.line ?? 0, message: w.message, hint: w.hint || null })),
      report: built.report,
      css: built.css, map: built.map,
    }, null, 2));
  } else {
    writeFileSync(outputPath, built.css);
    if (built.map) writeFileSync(mapName ? join(dirname(outputPath), mapName) : outputPath + '.map', JSON.stringify(built.map));
    const rep = built.report;
    console.log(`built ${outputPath} from ${results.map((x) => x.file).join(', ')}`);
    console.log(`  ${rep.rules} rule(s), ${rep.shadowRules} pseudo-element rule(s), ${rep.keyframes} @keyframes, ${rep.raws} raw block(s)`);
    if (rep.layers.length) console.log(`  layers: ${rep.layers.join(' < ')}`);
    if (built.map) console.log(`  source map: ${mapName ? join(dirname(outputPath), mapName) : outputPath + '.map'} (browser devtools show the .dssl file and line for each rule)`);
    if (rep.seenStripped) console.log(`  ${rep.seenStripped} seen rule(s) applied unconditionally (the no-JS state)`);
    if (rep.bakedTextures) console.log(`  ${rep.bakedTextures} texture(s) baked into the CSS as background images`);
    for (const n of rep.notBaked || []) console.log(`  texture on "${n.sel}" stays in the runtime: ${n.why}`);
    if (rep.needsBox && rep.needsBox.length) {
      console.log(`  ${rep.needsBox.length} rule(s) align their children without saying display, so the engine would make them grids and this CSS will not:`);
      for (const n of rep.needsBox.slice(0, 8)) console.log(`    ${n.file || ''}:${n.line} ${n.sel} { ${n.prop} }  ->  add display: grid (or flex)`);
      if (rep.needsBox.length > 8) console.log(`    ...and ${rep.needsBox.length - 8} more`);
    }
    if (rep.skippedSignals || rep.engineDecls) {
      const kinds = rep.engineKinds.length ? ` (${rep.engineKinds.join(', ')})` : '';
      console.log(`  stays in the runtime: ${rep.skippedSignals} @signal rule(s), ${rep.engineDecls} engine-native declaration(s)${kinds}`);
    }
    printDiags(results, true);
  }
  process.exit(errors.length || (strict && warnings.length) ? 1 : 0);
}

if (cmd === 'import') {
  const json = args.includes('--json');
  const toStdout = args.includes('--stdout');
  for (const f of ['--json', '--stdout']) { const i = args.indexOf(f); if (i !== -1) args.splice(i, 1); }
  const outPath = readArg(args, '-o') || readArg(args, '--out');
  if (!args.length) { console.error('dssl import: give me a .css file to convert'); process.exit(2); }
  const input = args[0];
  const { dssl, report } = importCss(readSource(input));
  const target = outPath || (input.replace(/\.css$/i, '') + '.dssl');
  if (json) {
    console.log(JSON.stringify({ version: VERSION, input, output: toStdout ? null : target, report, dssl: toStdout ? dssl : undefined }, null, 2));
  } else if (toStdout) {
    process.stdout.write(dssl);
  } else {
    writeFileSync(target, dssl);
    console.log(`imported ${target} from ${input}`);
    console.log(`  ${report.rules} rule(s), ${report.declarations} declaration(s), ${report.converted} rewritten, ${report.pinned} moved to pin, ${report.motions} motion(s), ${report.raw} at-rule(s) kept in raw { }`);
    for (const d of report.dropped) console.log(`  dropped line ${d.line}: ${d.text}\n    ${d.reason}`);
    for (const n of report.notes) console.log(`  note line ${n.line}: ${n.message}${n.hint ? `\n    ${n.hint}` : ''}`);
    console.log(report.compile.ok ? `  the result compiles${report.compile.warnings ? ` (${report.compile.warnings} warning(s))` : ''}` : `  the result still has ${report.compile.errors.length} error(s):\n` + report.compile.errors.map((e) => `    line ${e.line}: ${e.message}`).join('\n'));
  }
  process.exit(report.compile.ok ? 0 : 1);
}

if (cmd !== 'dev') {   // dev keeps the process alive
  console.error(`dssl: unknown command "${cmd}"\n\n${USAGE}`);
  process.exit(2);
}
