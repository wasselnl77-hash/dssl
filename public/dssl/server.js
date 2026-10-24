/* =========================================================================
 * DSSL: server.js (0.13.0): use DSSL where there is no browser
 *
 *   import { compileSheets, styleTag } from './dssl/server.js'
 *
 *   const { css } = compileSheets([tokensSource, siteSource])        // strings, in load order
 *   const head = styleTag(css, { nonce })                            // '<style nonce="...">...</style>'
 *
 * Nothing here touches window or document, so it runs in a Node server, a build script, an edge function, a static
 * site generator or a test. Put the CSS in the HTML you render and the page is styled on first paint, before any
 * script, which is what server rendering is for. The engine, if you load it, adds what plain CSS cannot do.
 * ========================================================================= */

import { toCSS, VERSION } from './index.js';

/**
 * Compile one or several DSSL sources (strings, in load order, tokens first) to CSS.
 * Options: reset, sourceMap, sources, nativeSpecificity, banner (see `dssl build --help`).
 * Returns { css, map, report, errors, warnings, ok }.
 */
export function compileSheets(sources, opts = {}) {
  return toCSS(Array.isArray(sources) ? sources : [sources], { banner: false, ...opts });
}

/** a <style> tag for server-rendered HTML. The CSS cannot close the tag early, and a CSP nonce is added when you pass one. */
export function styleTag(css, { nonce } = {}) {
  const safe = String(css).replace(/<\/(style)/gi, '<\\/$1');
  return `<style${nonce ? ` nonce="${String(nonce).replace(/"/g, '&quot;')}"` : ''} data-dssl-compiled>${safe}</style>`;
}

export { VERSION };
