/* A shared playground link carries HTML as well as styles, and anyone can write a link.
 * So the canvas never receives that text as markup. It is parsed in an inert document and
 * rebuilt element by element from a short allow-list: layout and text tags, a few form
 * controls, class names and data attributes. No scripts, no event handlers, no style
 * attributes, no URLs, no ids (which could collide with the site). */

const TAGS = new Set([
  "div", "span", "p", "section", "article", "header", "footer", "nav", "main", "aside", "figure", "figcaption",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "a", "b", "i", "em", "strong", "small", "code", "pre", "kbd", "mark",
  "blockquote", "hr", "br", "button", "input", "label", "progress", "meter", "table", "thead", "tbody", "tr", "th", "td",
]);
const ATTRS = new Set(["class", "title", "value", "min", "max", "step", "checked", "disabled", "placeholder", "aria-label", "aria-hidden", "aria-describedby", "role", "low", "high", "optimum"]);
const INPUT_TYPES = new Set(["range", "checkbox", "radio", "text", "number", "button"]);
const MAX_CHARS = 30000;
const MAX_NODES = 1500;

/** parse `html` and append a safe copy to `target` (any existing children are removed first) */
export function renderSafeHtml(target: HTMLElement, html: string): { nodes: number; dropped: number; truncated: boolean } {
  target.replaceChildren();
  let dropped = 0, nodes = 0, truncated = false;
  const text = html.length > MAX_CHARS ? ((truncated = true), html.slice(0, MAX_CHARS)) : html;
  const doc = new DOMParser().parseFromString(text, "text/html");
  const copy = (src: Node, into: Node) => {
    for (const n of Array.from(src.childNodes)) {
      if (nodes >= MAX_NODES) { truncated = true; return; }
      if (n.nodeType === Node.TEXT_NODE) { into.appendChild(document.createTextNode(n.textContent || "")); continue; }
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      const el = n as Element;
      const tag = el.tagName.toLowerCase();
      if (!TAGS.has(tag)) { dropped++; continue; }
      nodes++;
      const out = document.createElement(tag);
      for (const a of Array.from(el.attributes)) {
        const name = a.name.toLowerCase();
        if (name === "type" && tag === "input") { if (INPUT_TYPES.has(a.value)) out.setAttribute("type", a.value); else dropped++; continue; }
        if (name.startsWith("data-") && /^data-[a-z0-9-]{1,40}$/.test(name)) { out.setAttribute(name, a.value.slice(0, 200)); continue; }
        if (ATTRS.has(name)) { out.setAttribute(name, a.value.slice(0, 400)); continue; }
        dropped++;
      }
      if (tag === "a") out.setAttribute("tabindex", "-1");
      copy(el, out);
      into.appendChild(out);
    }
  };
  copy(doc.body, target);
  return { nodes, dropped, truncated };
}
