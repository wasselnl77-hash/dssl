// A ~40-line DSSL syntax highlighter for code samples.
// Emits <span class="tok-*"> markup; colors come from DSSL itself (site.dssl).

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const STATES = new Set([
  "hover", "focus", "focus-visible", "active", "disabled", "checked", "empty",
  "target", "invalid", "valid", "required", "open", "placeholder-shown",
]);

export function highlightDssl(src: string): string {
  const lines = src.split("\n");
  const out: string[] = [];

  for (const line of lines) {
    let html = "";
    let i = 0;
    const n = line.length;

    while (i < n) {
      const rest = line.slice(i);

      // comments
      const com = rest.match(/^\/\/.*/);
      if (com) { html += `<span class="tok-com">${escapeHtml(com[0])}</span>`; break; }

      const ws = rest.match(/^\s+/);
      if (ws) { html += ws[0]; i += ws[0].length; continue; }

      // strings
      const str = rest.match(/^"[^"]*"|^'[^']*'/);
      if (str) { html += `<span class="tok-str">${escapeHtml(str[0])}</span>`; i += str[0].length; continue; }

      // at-rules
      const at = rest.match(/^@[a-z-]+/);
      if (at) { html += `<span class="tok-at">${escapeHtml(at[0])}</span>`; i += at[0].length; continue; }

      // numbers with optional unit
      const num = rest.match(/^-?\d*\.?\d+(?:[a-z%]+)?/);
      if (num) { html += `<span class="tok-num">${escapeHtml(num[0])}</span>`; i += num[0].length; continue; }

      // use keyword
      const use = rest.match(/^use\s+[\w-]+/);
      if (use) { html += `<span class="tok-use">${escapeHtml(use[0])}</span>`; i += use[0].length; continue; }

      // identifiers (may contain dots for token refs)
      const id = rest.match(/^--?[A-Za-z_][\w.\\-]*/);
      if (id) {
        const word = id[0];
        const after = line.slice(i + word.length).trimStart();
        const isBlock = after.startsWith("{");
        const isState = STATES.has(word);
        const isHeader = isBlock && !word.includes(".") && !word.startsWith("-") && !word.startsWith("&");
        if (isState) html += `<span class="tok-state">${escapeHtml(word)}</span>`;
        else if (word.startsWith("--")) html += `<span class="tok-num">${escapeHtml(word)}</span>`;
        else if (isHeader) html += `<span class="tok-sel">${escapeHtml(word)}</span>`;
        else {
          // declaration property vs bare value identifier (like `pin` or a selector fragment)
          const colonNext = /^[\w.\\-]*\s*:/.test(rest) && !after.startsWith(":");
          const looksProp = /^[a-z][a-z0-9-]*$/i.test(word) && /^\s*:/.test(line.slice(i + word.length));
          html += `<span class="${looksProp || colonNext && looksProp ? "tok-prop" : isBlock ? "tok-sel" : "tok-val"}">${escapeHtml(word)}</span>`;
        }
        i += word.length;
        continue;
      }

      // pseudo classes in selectors
      const pseudo = rest.match(/^::?[a-z-]+/);
      if (pseudo) { html += `<span class="tok-state">${escapeHtml(pseudo[0])}</span>`; i += pseudo[0].length; continue; }

      // punctuation
      const punct = rest.match(/^[{}:,()[\]&*>~+.#/-]+/);
      if (punct) {
        const cls = punct[0].startsWith(".") || punct[0].startsWith("#") ? "tok-sel" : "tok-punct";
        html += `<span class="${cls}">${escapeHtml(punct[0])}</span>`;
        i += punct[0].length;
        continue;
      }

      html += escapeHtml(line[i]);
      i++;
    }
    out.push(html);
  }
  return out.join("\n");
}
