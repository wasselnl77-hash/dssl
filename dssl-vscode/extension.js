/* extension.js — thin vscode wiring over lib/analysis.js.
 * The analysis layer (and the DSSL compiler it wraps) is ESM; the extension
 * host is happy with a dynamic import from CommonJS. Everything testable
 * lives in lib/, this file only talks to the editor. */

const vscode = require('vscode');

let mod = null;          // lib/analysis.js module
let analysis = null;     // current workspace analysis result
let diags = null;        // DiagnosticCollection (created once)
let debounceTimer = null;

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
  );

  // run once so diagnostics are present before the first keystroke
  await runAnalysis();
}

function deactivate() {
  clearTimeout(debounceTimer);
}

module.exports = { activate, deactivate };
