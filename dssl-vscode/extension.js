/* extension.js - thin vscode wiring over lib/analysis.js.
 * The analysis layer (and the DSSL compiler it wraps) is ESM; the extension
 * host is happy with a dynamic import from CommonJS. Everything testable
 * lives in lib/, this file only talks to the editor. */

const vscode = require('vscode');

let mod = null;          // lib/analysis.js module
let analysis = null;     // current workspace analysis result
let diags = null;        // DiagnosticCollection (created once)
let debounceTimer = null;
let designerHost = null;  // lib/designer-host.js
let designerPanel = null;
let lastDsslEditor = null; // the panel steals focus, so remember which .dssl editor to insert into

const KIND = {
  property: vscode.CompletionItemKind.Property,
  value: vscode.CompletionItemKind.Value,
  keyword: vscode.CompletionItemKind.Keyword,
  block: vscode.CompletionItemKind.Snippet,
};

function debounceMs() {
  return vscode.workspace.getConfiguration('dssl').get('diagnostics.debounce', 250);
}

/* Fold the whole workspace: every .dssl file parsed once, tokens chained in
 * docs-first order (tokens*.dssl before the rest, then alphabetical). */
async function runAnalysis() {
  if (!mod) return;
  const uris = await vscode.workspace.findFiles('**/*.dssl', '**/node_modules/**');
  const docs = new Map();
  await Promise.all(uris.map(async (uri) => {
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      docs.set(uri.fsPath, doc.getText());
    } catch { /* file vanished mid-scan */ }
  }));

  analysis = mod.analyzeWorkspace(docs);

  const next = new Map();
  for (const [p] of analysis.perFile) {
    next.set(vscode.Uri.file(p), mod.diagnosticsFor(analysis, p).map((d) => {
      const range = new vscode.Range(d.line, d.col, d.line, 400);
      const sev = d.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
      const diag = new vscode.Diagnostic(range, d.message, sev);
      diag.source = 'dssl';
      return diag;
    }));
  }
  // clear stale files (deleted from disk or emptied) then set fresh entries
  diags.clear();
  for (const [uri, items] of next) diags.set(uri, items);
}

function scheduleAnalysis() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { runAnalysis().catch(() => {}); }, debounceMs());
}

function registerCompletion() {
  return vscode.languages.registerCompletionItemProvider(
    { language: 'dssl' },
    {
      provideCompletionItems(document, position) {
        if (!analysis || !mod) return [];
        const text = document.getText();
        const offset = document.offsetAt(position);
        const result = mod.completionsAt(analysis, document.uri.fsPath, text, offset);
        return result.items.map((it) => {
          const item = new vscode.CompletionItem(it.label, KIND[it.kind] || vscode.CompletionItemKind.Text);
          item.detail = it.detail;
          if (it.documentation) item.documentation = new vscode.MarkdownString(it.documentation);
          return item;
        });
      },
    },
    '.', ':', ' ',
  );
}

function registerHover() {
  return vscode.languages.registerHoverProvider({ language: 'dssl' }, {
    provideHover(document, position) {
      if (!analysis || !mod) return null;
      const text = document.getText();
      const offset = document.offsetAt(position);
      const h = mod.hoverAt(analysis, document.uri.fsPath, text, offset);
      if (!h) return null;
      return new vscode.Hover(new vscode.MarkdownString(h.contents));
    },
  });
}

/* ---- the designer panel ---------------------------------------------- */

/** the .dssl editor to talk to: the last one the user was in, if it is still on screen */
function findDsslEditor() {
  const visible = vscode.window.visibleTextEditors.filter((e) => e.document.languageId === 'dssl');
  if (lastDsslEditor && visible.includes(lastDsslEditor)) return lastDsslEditor;
  return visible[0] || null;
}

/** the editor, as designer-host.js wants it. New lines keep the indentation of the line you insert on. */
function editorBridge() {
  return {
    activeDsslEditor() {
      const ed = findDsslEditor();
      if (!ed) return null;
      return {
        async insert(text) {
          const sel = ed.selection;
          const indent = (ed.document.lineAt(sel.start.line).text.match(/^\s*/) || [''])[0];
          const body = text.replace(/\n/g, '\n' + indent);
          await ed.edit((b) => (sel.isEmpty ? b.insert(sel.active, body) : b.replace(sel, body)));
        },
        selectionText() { return ed.document.getText(ed.selection); },
      };
    },
    copy: (text) => vscode.env.clipboard.writeText(text),
    info: (m) => vscode.window.setStatusBarMessage('DSSL designer: ' + m, 4000),
    post: (m) => designerPanel && designerPanel.webview.postMessage(m),
  };
}

async function openDesigner(context, tab) {
  if (!designerHost) designerHost = await import('./lib/designer-host.js');
  if (designerPanel) {
    designerPanel.reveal(undefined, true);
    designerPanel.webview.postMessage({ type: 'tab', tab });
    return;
  }
  const column = vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active;
  designerPanel = vscode.window.createWebviewPanel('dsslDesigner', 'DSSL designer', { viewColumn: column, preserveFocus: true }, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [context.extensionUri],
  });
  const uri = (rel) => designerPanel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, ...rel.split('/'))).toString();
  designerPanel.webview.html = designerHost.designerHtml({ cspSource: designerPanel.webview.cspSource, uri, tab });
  const bridge = editorBridge();
  designerPanel.webview.onDidReceiveMessage((msg) => designerHost.handleMessage(msg, bridge).catch((e) => vscode.window.showErrorMessage('DSSL designer: ' + e.message)));
  designerPanel.onDidDispose(() => { designerPanel = null; });
}

/* ---- CSS to DSSL -------------------------------------------------------- */

let importChannel = null;

async function convertCss(uri) {
  const target = uri || (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri);
  if (!target || !/\.css$/i.test(target.fsPath)) { vscode.window.showInformationMessage('DSSL: pick a .css file to convert (right-click it in the Explorer, or open it first).'); return; }
  const { importCss } = await import('./lib/engine/import.js');
  const text = Buffer.from(await vscode.workspace.fs.readFile(target)).toString('utf8');
  const { dssl, report } = importCss(text);
  const out = vscode.Uri.file(target.fsPath.replace(/\.css$/i, '.dssl'));
  let exists = true;
  try { await vscode.workspace.fs.stat(out); } catch { exists = false; }
  if (exists) {
    const pick = await vscode.window.showWarningMessage(`${out.fsPath.split(/[\\/]/).pop()} already exists.`, { modal: true }, 'Overwrite');
    if (pick !== 'Overwrite') return;
  }
  await vscode.workspace.fs.writeFile(out, Buffer.from(dssl, 'utf8'));
  if (!importChannel) importChannel = vscode.window.createOutputChannel('DSSL import');
  importChannel.clear();
  importChannel.appendLine(`Converted ${target.fsPath}`);
  importChannel.appendLine(`  ${report.rules} rule(s), ${report.declarations} declaration(s), ${report.converted} rewritten, ${report.pinned} moved to pin { }, ${report.motions} motion(s), ${report.raw} at-rule(s) kept in raw { }`);
  for (const d of report.dropped) importChannel.appendLine(`  dropped line ${d.line}: ${d.text}\n    ${d.reason}`);
  for (const n of report.notes) importChannel.appendLine(`  note line ${n.line}: ${n.message}${n.hint ? '\n    ' + n.hint : ''}`);
  importChannel.appendLine(report.compile.ok ? '  The result compiles.' : `  The result still has ${report.compile.errors.length} error(s).`);
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(out), { preview: false });
  const bits = [`${report.converted} values rewritten`];
  if (report.dropped.length) bits.push(`${report.dropped.length} line(s) dropped`);
  vscode.window.showInformationMessage(`DSSL: converted to ${out.fsPath.split(/[\\/]/).pop()} (${bits.join(', ')}).`, 'Show the report').then((c) => { if (c) importChannel.show(true); });
}

async function activate(context) {
  mod = await import('./lib/analysis.js');
  diags = vscode.languages.createDiagnosticCollection('dssl');
  context.subscriptions.push(diags);

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId === 'dssl') scheduleAnalysis();
    }),
    vscode.workspace.onDidOpenTextDocument((d) => { if (d.languageId === 'dssl') scheduleAnalysis(); }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => scheduleAnalysis()),
    registerCompletion(),
    registerHover(),
    vscode.window.onDidChangeActiveTextEditor((ed) => { if (ed && ed.document.languageId === 'dssl') lastDsslEditor = ed; }),
    vscode.commands.registerCommand('dssl.openDesigner', () => openDesigner(context, 'aura')),
    vscode.commands.registerCommand('dssl.openAuraDesigner', () => openDesigner(context, 'aura')),
    vscode.commands.registerCommand('dssl.openTextureDesigner', () => openDesigner(context, 'texture')),
    vscode.commands.registerCommand('dssl.openSliderDesigner', () => openDesigner(context, 'slider')),
    vscode.commands.registerCommand('dssl.convertCss', (uri) => convertCss(uri)),
  );
  if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'dssl') lastDsslEditor = vscode.window.activeTextEditor;

  // run once so diagnostics are present before the first keystroke
  await runAnalysis();
}

function deactivate() {
  clearTimeout(debounceTimer);
}

module.exports = { activate, deactivate };
