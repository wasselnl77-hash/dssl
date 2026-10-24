/* test-designer-host.mjs: the editor side of the designer and the extension's wiring.
 * There is no VS Code in this environment, so the real extension.js is loaded against a FAKE
 * `vscode` module. That is enough to catch the failures that actually break extensions:
 * a command declared in package.json but never registered (or the reverse), a webview that
 * points at a file that is not in the package, and an Insert that edits the wrong place.
 * It is not a substitute for opening the .vsix in VS Code once. */
import { createRequire } from 'node:module';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Module from 'node:module';
import { VERSION } from '../public/dssl/index.js';
import { designerHtml, handleMessage, DESIGNER_TABS } from '../dssl-vscode/lib/designer-host.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name}${extra !== undefined ? '; ' + extra : ''}`); } };
const section = (t) => console.log(`\n== ${t}`);
const ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'dssl-vscode');
const pkg = JSON.parse(readFileSync(join(EXT, 'package.json'), 'utf8'));

section('the package manifest');
ok('the version matches the engine it bundles', pkg.version === VERSION, `${pkg.version} vs ${VERSION}`);
ok('main points at a file that exists', existsSync(join(EXT, pkg.main)));
ok('the icon exists', existsSync(join(EXT, pkg.icon)));
const declared = pkg.contributes.commands.map((c) => c.command);
ok('every command has a title and the DSSL category', pkg.contributes.commands.every((c) => c.title && c.category === 'DSSL'));
ok('every command can activate the extension (onCommand or a language event)', declared.every((c) => pkg.activationEvents.includes(`onCommand:${c}`)));
const menuCmds = Object.values(pkg.contributes.menus).flat().map((m) => m.command);
ok('every menu entry points at a declared command', menuCmds.every((c) => declared.includes(c)), menuCmds.filter((c) => !declared.includes(c)).join());
ok('the extension ships the engine copies it needs (every module the resolver imports)', ['parser', 'resolver', 'utils', 'color', 'texture', 'aura', 'slider', 'lint', 'import'].every((f) => existsSync(join(EXT, 'lib', 'engine', f + '.js'))));
const same = ['parser', 'resolver', 'utils', 'color', 'texture', 'aura', 'slider', 'lint', 'import'].filter((f) => readFileSync(join(EXT, 'lib', 'engine', f + '.js'), 'utf8') !== readFileSync(join(ROOT, 'public', 'dssl', f + '.js'), 'utf8'));
ok('and they are byte-identical to the engine (run scripts/sync-extension-engine.mjs if not)', same.length === 0, same.join());

section('the panel HTML');
const html = designerHtml({ cspSource: 'vscode-webview://abc', uri: (p) => `vscode-webview://abc/${p}`, tab: 'texture' });
ok('it carries a strict content security policy', /default-src 'none'/.test(html) && /script-src vscode-webview:\/\/abc;/.test(html) && !/unsafe-eval/.test(html));
ok('scripts only run from the extension itself, with no inline script', !/<script(?![^>]*src=)/.test(html));
ok('it opens on the requested tab, and falls back for nonsense', /data-tab="texture"/.test(html) && /data-tab="aura"/.test(designerHtml({ cspSource: 'x', uri: (p) => p, tab: '"><script>' })));
const refs = [...html.matchAll(/(?:src|href)="vscode-webview:\/\/abc\/([^"]+)"/g)].map((m) => m[1]);
ok('every file the page names exists in the package', refs.length === 2 && refs.every((r) => existsSync(join(EXT, r))), refs.join());
{
  // follow the ES-module imports of the panel script: each must resolve inside the extension
  const seen = new Set(), missing = [];
  const walk = (rel) => {
    if (seen.has(rel)) return; seen.add(rel);
    const full = join(EXT, rel);
    if (!existsSync(full)) { missing.push(rel); return; }
    for (const m of readFileSync(full, 'utf8').matchAll(/from '(\.[^']+)'/g)) walk(pathResolve(dirname(full), m[1]).slice(EXT.length + 1));
  };
  walk('media/designer.js');
  ok(`all ${seen.size} modules the panel imports resolve inside the extension`, missing.length === 0 && seen.size >= 10, missing.join());
}
ok('the three tabs are known', DESIGNER_TABS.join() === 'aura,texture,slider');

section('messages from the panel');
{
  const calls = [];
  const editor = { insert: async (t) => calls.push(['insert', t]), selectionText: () => 'aura-glow: #fff 20' };
  const api = (ed) => ({ activeDsslEditor: () => ed, copy: async (t) => calls.push(['copy', t]), info: (m) => calls.push(['info', m]), post: (m) => calls.push(['post', m]) });
  await handleMessage({ type: 'insert', text: 'texture: grain' }, api(editor));
  ok('insert goes to the .dssl editor', calls.some((c) => c[0] === 'insert' && c[1] === 'texture: grain'));
  calls.length = 0;
  await handleMessage({ type: 'insert', text: 'texture: grain' }, api(null));
  ok('with no .dssl editor open it says so (and keeps the text in the panel)', calls.length === 1 && calls[0][0] === 'info' && /Open a \.dssl file/.test(calls[0][1]));
  calls.length = 0;
  await handleMessage({ type: 'insert', text: '' }, api(editor)); await handleMessage({ type: 'insert' }, api(editor)); await handleMessage({ type: 'insert', text: 5 }, api(editor));
  ok('an empty or non-text insert does nothing', calls.length === 0);
  await handleMessage({ type: 'copy', text: 'x' }, api(editor));
  ok('copy writes the clipboard', calls.some((c) => c[0] === 'copy' && c[1] === 'x'));
  calls.length = 0;
  await handleMessage({ type: 'requestSelection' }, api(editor));
  ok('requestSelection answers with the selected text', calls.length === 1 && calls[0][1].type === 'selection' && calls[0][1].text === 'aura-glow: #fff 20');
  calls.length = 0;
  for (const bad of [null, undefined, 5, 'str', [], {}, { type: 'rm -rf' }, { type: 'insert', text: {} }]) await handleMessage(bad, api(editor));
  ok('junk messages are ignored without throwing', calls.length === 0);
}

section('the real extension.js against a fake vscode');
{
  const registered = new Map();
  const createdPanels = [];
  const infos = [];
  const editors = [];
  const noop = () => {};
  const disposable = { dispose: noop };
  class Range { constructor(...a) { this.a = a; } }
  const makeEditor = (lines, line = 1, col = 0, selected = '') => {
    const edits = [];
    const ed = {
      document: { languageId: 'dssl', lineAt: (n) => ({ text: lines[n] }), getText: () => selected, uri: { fsPath: '/x/a.dssl' } },
      selection: { start: { line, character: col }, active: { line, character: col }, isEmpty: !selected },
      edit: async (fn) => { fn({ insert: (pos, t) => edits.push(['insert', t]), replace: (sel, t) => edits.push(['replace', t]) }); return true; },
      edits,
    };
    return ed;
  };
  const vscode = {
    CompletionItemKind: new Proxy({}, { get: () => 0 }), DiagnosticSeverity: { Error: 0, Warning: 1 }, ViewColumn: { Beside: 2, Active: -1 },
    Range, Diagnostic: class { constructor(r, m, s) { Object.assign(this, { r, m, s }); } }, MarkdownString: class { constructor(v) { this.value = v; } }, Hover: class {},
    Uri: { file: (p) => ({ fsPath: p }), joinPath: (base, ...p) => ({ fsPath: join(base.fsPath, ...p) }) },
    languages: { createDiagnosticCollection: () => ({ clear: noop, set: noop, dispose: noop }), registerCompletionItemProvider: () => disposable, registerHoverProvider: () => disposable },
    workspace: {
      onDidChangeTextDocument: () => disposable, onDidOpenTextDocument: () => disposable, onDidChangeWorkspaceFolders: () => disposable,
      findFiles: async () => [], getConfiguration: () => ({ get: (k, d) => d }), openTextDocument: async () => ({ getText: () => '' }),
      fs: { readFile: async () => Buffer.from(''), writeFile: async () => {}, stat: async () => { throw new Error('none'); } },
    },
    window: {
      activeTextEditor: null, visibleTextEditors: editors, onDidChangeActiveTextEditor: () => disposable,
      showInformationMessage: async (m) => { infos.push(m); }, showErrorMessage: async (m) => { infos.push('ERR ' + m); }, setStatusBarMessage: (m) => infos.push(m),
      createOutputChannel: () => ({ clear: noop, appendLine: noop, show: noop }), showTextDocument: async () => ({}),
      createWebviewPanel: (id, title, col, opts) => {
        const messages = [];
        let onMsg = null, onDispose = null;
        const panel = {
          id, title, opts, revealed: 0, reveal() { this.revealed++; },
          webview: { cspSource: 'vscode-webview://test', html: '', asWebviewUri: (u) => ({ toString: () => 'vscode-webview://test' + u.fsPath.slice(EXT.length) }), onDidReceiveMessage: (fn) => { onMsg = fn; return disposable; }, postMessage: async (m) => { messages.push(m); return true; } },
          onDidDispose: (fn) => { onDispose = fn; return disposable; },
          messages, send: (m) => onMsg(m), dispose: () => onDispose && onDispose(),
        };
        createdPanels.push(panel);
        return panel;
      },
    },
    commands: { registerCommand: (id, fn) => { registered.set(id, fn); return disposable; } },
    env: { clipboard: { writeText: async () => {} } },
  };
  const origLoad = Module._load;
  Module._load = function (request, ...rest) { return request === 'vscode' ? vscode : origLoad.call(this, request, ...rest); };
  const req = createRequire(import.meta.url);
  const ext = req(join(EXT, 'extension.js'));
  const context = { subscriptions: [], extensionUri: { fsPath: EXT } };
  await ext.activate(context);
  Module._load = origLoad;

  ok('activate() succeeds against the fake editor API', true);
  ok('every command declared in package.json is registered', declared.every((c) => registered.has(c)), declared.filter((c) => !registered.has(c)).join());
  ok('and nothing is registered that package.json does not declare', [...registered.keys()].every((c) => declared.includes(c)), [...registered.keys()].filter((c) => !declared.includes(c)).join());

  await registered.get('dssl.openTextureDesigner')();
  const panel = createdPanels[0];
  ok('opening the texture designer creates one panel with scripts on and the extension as its only resource root', panel && panel.opts.enableScripts === true && panel.opts.localResourceRoots.length === 1);
  ok('its HTML opens on the texture tab', /data-tab="texture"/.test(panel.webview.html));
  const files = [...panel.webview.html.matchAll(/vscode-webview:\/\/test\/([^"]+)"/g)].map((m) => m[1]);
  ok('and names files that exist', files.length === 2 && files.every((f) => existsSync(join(EXT, f))), files.join());
  await registered.get('dssl.openSliderDesigner')();
  ok('opening again reuses the panel and just switches tab', createdPanels.length === 1 && panel.revealed === 1 && panel.messages.some((m) => m.type === 'tab' && m.tab === 'slider'));

  // the editor the panel inserts into
  const ed = makeEditor(['.card {', '  color: red', '}'], 1, 14);
  editors.push(ed);
  panel.send({ type: 'insert', text: 'aura-glow: #f00 20\naura-particle: #fff 10' });
  await new Promise((r) => setTimeout(r, 30));
  ok('Insert edits the .dssl editor and indents every new line like the line it sits on', ed.edits.length === 1 && ed.edits[0][0] === 'insert' && ed.edits[0][1] === 'aura-glow: #f00 20\n  aura-particle: #fff 10', JSON.stringify(ed.edits));
  const sel = makeEditor(['  x'], 0, 2, 'texture: grain');
  editors.length = 0; editors.push(sel);
  panel.send({ type: 'insert', text: 'texture: wood' }); await new Promise((r) => setTimeout(r, 30));
  ok('with a selection, Insert replaces it', sel.edits[0] && sel.edits[0][0] === 'replace');
  panel.send({ type: 'requestSelection' }); await new Promise((r) => setTimeout(r, 30));
  ok('Load from selection sends the selected text back to the panel', panel.messages.some((m) => m.type === 'selection' && m.text === 'texture: grain'));
  editors.length = 0;
  panel.send({ type: 'insert', text: 'x: 1' }); await new Promise((r) => setTimeout(r, 30));
  ok('with no .dssl editor visible the panel is told to open one', infos.some((m) => /Open a \.dssl file/.test(m)));
  panel.dispose();
  await registered.get('dssl.openDesigner')();
  ok('closing the panel and opening the designer again makes a fresh one', createdPanels.length === 2);

  await registered.get('dssl.convertCss')({ fsPath: '/tmp/not-a-css.txt' });
  ok('converting something that is not .css explains instead of failing', infos.some((m) => /pick a \.css file/.test(m)));
}

section('the media folder');
{
  const media = readdirSync(join(EXT, 'media'));
  ok('the panel assets are all in the package folder', ['designer.js', 'designer.css', 'designer-core.js'].every((f) => media.includes(f)));
  const ignore = readFileSync(join(EXT, '.vscodeignore'), 'utf8');
  ok('.vscodeignore does not exclude the panel, the engine copies or the media', !/^(media|lib)/m.test(ignore));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
