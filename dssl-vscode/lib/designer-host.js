/* designer-host.js: the editor-side half of the designer, with no vscode import so it can be tested.
 * extension.js hands it the real vscode API; the tests hand it a fake one. */

const TABS = ['aura', 'texture', 'slider'];

/** the HTML shell for the panel. `uri('media/designer.js')` turns an extension-relative path into a webview URI. */
export function designerHtml({ cspSource, uri, tab = 'aura' }) {
  const t = TABS.includes(tab) ? tab : 'aura';
  // The panel needs: its own module scripts (script-src), data: images for textures, and
  // inline <style> for the slider preview (style-src 'unsafe-inline'); nothing from the network.
  const csp = `default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource}; font-src ${cspSource};`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DSSL designer</title>
<link rel="stylesheet" href="${uri('media/designer.css')}">
</head><body data-tab="${t}">
<div id="app"></div>
<script type="module" src="${uri('media/designer.js')}"></script>
</body></html>`;
}

/**
 * Handle a message from the panel. `api` is the editor, however it is spelled:
 *   api.activeDsslEditor()        -> { insert(text), replaceSelection(text), selectionText() } | null
 *   api.copy(text)                -> Promise
 *   api.info(message)             show a small notice
 *   api.post(message)             send a message to the panel
 */
export async function handleMessage(msg, api) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'insert') {
    const ed = api.activeDsslEditor();
    if (!ed) { api.info('Open a .dssl file first, then press Insert. The text is still in the box: use Copy.'); return; }
    if (typeof msg.text !== 'string' || !msg.text) return;
    await ed.insert(msg.text);
    api.info('Inserted.');
  } else if (msg.type === 'copy') {
    if (typeof msg.text === 'string') await api.copy(msg.text);
  } else if (msg.type === 'requestSelection') {
    const ed = api.activeDsslEditor();
    if (!ed) { api.info('Open a .dssl file and select a declaration (for example aura-glow: ...) to load it.'); return; }
    api.post({ type: 'selection', text: ed.selectionText() });
  }
}

export const DESIGNER_TABS = TABS;
