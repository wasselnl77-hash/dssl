/* =========================================================================
 * DSSL — resolver.js
 * Walks the parsed tree and produces flat, engine-ready rules:
 *
 *   rule = {
 *     id, sel,                       // full structural selector (may contain native pseudo-classes)
 *     media: [query],                // all must match
 *     signals: [{name, op, value}],  // JS-driven conditions
 *     containers: [query],           // container-query conditions
 *     layer, order,                  // cascade: (layer, order) — no specificity
 *     decls: [{prop, value} | special],
 *     file, line
 *   }
 *
 * Also resolves tokens (→ custom properties on <html>), semantic properties,
 * behaviors (`use`), motions (→ Web Animations keyframes) and pseudo-element
 * rules (→ generated "shadow" CSS, the only thing inline styles can't reach).
 * ========================================================================= */

import { levenshtein, didYouMean, composeDeform } from './utils.js';
// v0.5.0 — the resolver validates the `::name` half of full selectors so a
// typo like .card::befor is a LOUD error, never a silently dead rule.
import { PSEUDO_ELEMENTS, VENDOR_PSEUDO, STATE_WORDS } from './parser.js';

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */

// exported for the editor extension: completions ride the same list the
// compiler validates against, so the two can never drift apart
export const CSS_KEYWORDS = new Set(('inherit,initial,unset,revert,revert-layer,none,auto,currentcolor,transparent,' +
  'black,silver,gray,white,maroon,red,purple,fuchsia,green,lime,olive,yellow,navy,blue,teal,aqua,' +
  'orange,gold,pink,brown,violet,cyan,magenta,indigo,crimson,coral,tomato,goldenrod,khaki,' +
  'slategray,slategrey,dimgray,dimgrey,lightgray,lightgrey,darkgray,darkgrey,gainsboro,whitesmoke,' +
  'ghostwhite,ivory,beige,linen,seashell,snow,honeydew,mintcream,azure,aliceblue,lavender,' +
  'canvas,canvastext,linktext,visitedtext,activetext,buttonface,buttontext,buttonborder,field,fieldtext,highlight,highlighttext,' +
  'solid,dashed,dotted,double,groove,ridge,inset,outset,hidden,visible,' +
  'block,inline,inline-block,flex,inline-flex,grid,inline-grid,flow-root,contents,table,table-row,table-cell,list-item,' +
  'relative,absolute,fixed,sticky,static,sticky,' +
  'start,end,center,left,right,between,around,evenly,baseline,stretch,normal,space-between,space-around,space-evenly,' +
  'wrap,nowrap,reverse,row,column,row-reverse,column-reverse,' +
  'bold,bolder,lighter,italic,oblique,small-caps,uppercase,lowercase,capitalize,underline,overline,line-through,blink,' +
  'ellipsis,clip,break-word,anywhere,pre,pre-wrap,pre-line,subpixel-antialiased,antialiased,' +
  'pointer,progress,default,move,text,wait,help,grab,grabbing,not-allowed,zoom-in,zoom-out,copy,alias,crosshair,' +
  'serif,sans-serif,monospace,cursive,fantasy,system-ui,ui-sans-serif,ui-monospace,ui-serif,ui-rounded,' +
  'system-ui,-apple-system,Roboto,Helvetica,Arial,Menlo,Consolas,SFMono-Regular,Liberation-Mono,Inter,Noto-Sans,Ubuntu,Cantarell,Oxygen,Fira-Sans,Droid-Sans,' +
  'border-box,content-box,padding-box,fill-box,stroke-box,view-box,' +
  // v0.8.0 — the background repeat/attachment words the url() fix exposed:
  // `background: url(a.png) no-repeat` was a false error because "no-repeat"
  // was missing while "repeat" existed
  'no-repeat,repeat-x,repeat-y,space,round,scroll,local,' +
  'contain,cover,fill,fit-content,min-content,max-content,minmax,repeat,clamp,calc,var,url,env,attr,' +
  'auto-fill,auto-fit,subgrid,dense,stretch,span,' +
  'scaleX,scaleY,translateX,translateY,translate,rotate,skew,skewX,skewY,matrix,' +
  'ease,ease-in,ease-out,ease-in-out,linear,step-start,step-end,steps,cubic-bezier,spring,bounce,smooth,snap,' +
  'forwards,backwards,both,infinite,alternate,alternate-reverse,running,paused,reverse,' +
  'safe,unsafe,legacy,loose,strict,spell-out,letters,isolate,isolation,blend,multiply,screen,overlay,darken,lighten,color-dodge,color-burn,hard-light,soft-light,difference,exclusion,hue,saturation,color,luminosity,plus-lighter,' +
  'blur,brightness,contrast,grayscale,invert,opacity,sepia,saturate,drop-shadow,' +
  'pointer coarse fine hover interactive,first,last,odd,even,all,portrait,landscape,print,screen,and,not,only,' +
  'inline-size,size,scroll-state,normal,snapped,physical,logical,' +
  'in,oklab,oklch,srgb,srgb-linear,display-p3,a98-rgb,prophoto-rgb,rec2020,xyz,xyz-d50,xyz-d65,shorter,longer,deg,grad,rad,turn,' +
  'to,top,bottom,left,right,above,below,closest-side,farthest-side,ellipse,circle,at,padding-box,border-box,' +
  'isolate,plaintext,sideways,upright,mixed,ltr,rtl,transform,auto,' +
  '-webkit-box,-webkit-inline-box,' +
  'thin,thick,medium,separate,collapse,vertical,horizontal,balance,pretty,orphans,' +
  // v0.5.0 — hyphens: manual used to be rejected ("unknown value") even though
  // the property existed; plus the rendering keywords people actually type.
  'manual,pixelated,crisp-edges,optimizeSpeed,optimizeLegibility,geometricPrecision,' +
  'flex-start,flex-end,self-start,self-end,snap-block,snap-inline').split(','));

const UNITLESS_PROPS = new Set([
  'opacity', 'line-height', 'z-index', 'font-weight', 'flex-grow', 'flex-shrink',
  'flex', 'order', 'scale', 'widows', 'orphans', 'column-count', 'aspect-ratio',
  'animation-iteration-count', 'flood-opacity', 'fill-opacity', 'stop-opacity',
  'shape-image-threshold',
  // grid line placement takes integers, not lengths:  grid-column: span 2
  'grid-row', 'grid-column', 'grid-area',
]);

// v0.7.2 — time properties: a bare number is milliseconds, never px, and
// never unitless (both used to emit values the browser silently rejected).
// transition-delay/animation-delay used to sit in UNITLESS_PROPS, which is
// why `transition-delay: 200` shipped as invalid unitless 200.
const TIME_PROPS = new Set([
  'transition-delay', 'transition-duration', 'animation-delay', 'animation-duration',
  // v0.8.0 — the animation shorthand takes bare numbers as ms too:
  // `animation: spin 1s infinite` is fine, but `animation: ghost 400` used
  // to become "ghost 400px" (invalid). 400 → 400ms, matching animate:.
  'animation',
]);

// A practical whitelist of standard CSS properties (loud errors beat silent ones)
const KNOWN_PROPS = new Set(('all,appearance,accent-color,align-content,align-items,align-self,align-tracks,aspect-ratio,' +
  'backdrop-filter,backface-visibility,background,background-attachment,background-blend-mode,background-clip,background-color,background-image,background-origin,background-position,background-repeat,background-size,' +
  'block-size,border,border-block,border-block-color,border-block-end,border-block-end-color,border-block-end-style,border-block-end-width,border-block-start,border-block-start-color,border-block-start-style,border-block-start-width,border-block-style,border-block-width,' +
  'border-bottom,border-bottom-color,border-bottom-left-radius,border-bottom-right-radius,border-bottom-style,border-bottom-width,' +
  'border-collapse,border-color,border-end-end-radius,border-end-start-radius,border-image,border-image-outset,border-image-repeat,border-image-slice,border-image-source,border-image-width,' +
  'border-inline,border-inline-color,border-inline-end,border-inline-end-color,border-inline-end-style,border-inline-end-width,border-inline-start,border-inline-start-color,border-inline-start-style,border-inline-start-width,border-inline-style,border-inline-width,' +
  'border-left,border-left-color,border-left-style,border-left-width,border-radius,border-right,border-right-color,border-right-style,border-right-width,' +
  'border-spacing,border-start-end-radius,border-start-start-radius,border-style,border-top,border-top-color,border-top-left-radius,border-top-right-radius,border-top-style,border-top-width,border-width,' +
  'bottom,box-decoration-break,box-shadow,box-sizing,break-after,break-before,break-inside,caret-color,caret-shape,clear,clip,clip-path,color,color-scheme,column-count,column-fill,column-gap,column-rule,column-rule-color,column-rule-style,column-rule-width,column-span,column-width,columns,contain,contain-intrinsic-size,container,container-name,container-type,content,content-visibility,cursor,caret,display,empty-cells,filter,flex,flex-basis,flex-direction,flex-flow,flex-grow,flex-shrink,flex-wrap,float,fill,fill-rule,fill-opacity,stroke,stroke-dasharray,stroke-dashoffset,stroke-linecap,stroke-linejoin,stroke-opacity,stroke-width,font,font-family,font-feature-settings,font-kerning,font-language-override,font-optical-sizing,font-palette,font-size,font-size-adjust,font-stretch,font-style,font-synthesis,font-variant,font-variant-caps,font-variant-east-asian,font-variant-ligatures,font-variant-numeric,font-variant-position,font-variation-settings,font-weight,forced-color-adjust,gap,grid,grid-area,grid-auto-columns,grid-auto-flow,grid-auto-rows,grid-column,grid-column-end,grid-column-gap,grid-column-start,grid-gap,grid-row,grid-row-end,grid-row-gap,grid-row-start,grid-template,grid-template-areas,grid-template-columns,grid-template-rows,' +
  'hanging-punctuation,height,hyphenate-character,hyphenate-limit-chars,hyphens,image-orientation,image-rendering,inline-size,inset,inset-block,inset-block-end,inset-block-start,inset-inline,inset-inline-end,inset-inline-start,isolation,justify-content,justify-items,justify-self,justify-tracks,left,letter-spacing,line-break,line-height,list-style,list-style-image,list-style-position,list-style-type,margin,margin-block,margin-block-end,margin-block-start,margin-bottom,margin-inline,margin-inline-end,margin-inline-start,margin-left,margin-right,margin-top,margin-trim,mask,mask-border,mask-border-mode,mask-border-outset,mask-border-repeat,mask-border-slice,mask-border-source,mask-border-width,mask-clip,mask-composite,mask-image,mask-mode,mask-origin,mask-position,mask-repeat,mask-size,max-height,max-inline-size,max-width,min-block-size,min-height,min-inline-size,min-width,mix-blend-mode,object-fit,object-position,offset,offset-anchor,offset-distance,offset-path,offset-rotate,opacity,order,outline,outline-color,outline-offset,outline-style,outline-width,overflow,overflow-anchor,overflow-clip-margin,overflow-wrap,overflow-x,overflow-y,overscroll-behavior,overscroll-behavior-block,overscroll-behavior-inline,overscroll-behavior-x,overscroll-behavior-y,padding,padding-block,padding-block-end,padding-block-start,padding-bottom,padding-inline,padding-inline-end,padding-inline-start,padding-left,padding-right,padding-top,page-break-after,page-break-before,page-break-inside,paint-order,perspective,perspective-origin,place-content,place-items,place-self,pointer-events,position,print-color-adjust,quotes,resize,right,rotate,row-gap,ruby-align,ruby-merge,scale,scroll-behavior,scroll-margin,scroll-margin-block,scroll-margin-block-end,scroll-margin-block-start,scroll-margin-bottom,scroll-margin-inline,scroll-margin-inline-end,scroll-margin-inline-start,scroll-margin-left,scroll-margin-right,scroll-margin-top,scroll-padding,scroll-padding-block,scroll-padding-bottom,scroll-padding-inline,scroll-padding-left,scroll-padding-right,scroll-padding-top,scroll-snap-align,scroll-snap-stop,scroll-snap-type,scrollbar-color,scrollbar-gutter,scrollbar-width,shape-image-threshold,shape-margin,shape-outside,tab-size,table-layout,text-align,text-align-last,text-combine-upright,text-decoration,text-decoration-color,text-decoration-line,text-decoration-skip-ink,text-decoration-style,text-decoration-thickness,text-emphasis,text-emphasis-color,text-emphasis-position,text-emphasis-style,text-indent,text-justify,text-orientation,text-overflow,text-rendering,text-shadow,text-transform,text-underline-offset,text-underline-position,text-wrap,top,touch-action,transform,transform-box,transform-origin,transform-style,transition,transition-behavior,transition-delay,transition-duration,transition-property,transition-timing-function,translate,unicode-bidi,user-select,vertical-align,visibility,white-space,white-space-collapse,width,will-change,word-break,word-spacing,word-wrap,writing-mode,z-index,zoom,' +
  'animation,animation-composition,animation-delay,animation-direction,animation-duration,animation-fill-mode,animation-iteration-count,animation-name,animation-play-state,animation-range,animation-timeline,animation-timing-function,' +
  'view-transition-name,interpolate-size,text-box,text-box-edge,text-box-trim,dynamic-range-limit,field-sizing,anchor-name,position-anchor,position-area,scroll-timeline,scroll-timeline-axis,scroll-timeline-name,timeline-scope,view-timeline,view-timeline-axis,view-timeline-name,' +
  '-webkit-background-clip,-webkit-text-fill-color,-webkit-box-orient,-webkit-line-clamp,-webkit-tap-highlight-color,-webkit-font-smoothing,-moz-osx-font-smoothing,-webkit-box-shadow,-webkit-text-stroke').split(','));

/* ------------------------------------------------------------------ *
 * Built-in token defaults (overridable via `tokens { }`)
 * ------------------------------------------------------------------ */

export const DEFAULT_TOKENS = {
  'color.ink': '#16161d',
  'color.paper': '#faf7f2',
  'color.card': '#ffffff',
  'color.muted': '#6f6a7a',
  'color.line': '#e5ded2',
  'color.accent': 'oklch(62% 0.19 35)',
  'color.accent-ink': '#fff6ee',
  'color.ok': '#2e7d4f',
  'color.err': '#b3372e',
  'space.1': '4', 'space.2': '8', 'space.3': '12', 'space.4': '16',
  'space.5': '24', 'space.6': '32', 'space.7': '48', 'space.8': '64',
  'radius.sm': '8', 'radius.md': '14', 'radius.lg': '22', 'radius.full': '999',
  'shadow.sm': '0 1 2 color.ink/8, 0 1 3 color.ink/6',
  'shadow.md': '0 2 4 color.ink/10, 0 4 12 color.ink/8',
  'shadow.lg': '0 4 8 color.ink/12, 0 12 32 color.ink/12',
  'shadow.xl': '0 8 16 color.ink/14, 0 24 64 color.ink/16',
  'font.sans': 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  'font.mono': 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
};

const EASINGS = {
  snap: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
  smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
  bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  linear: 'linear',
  ease: 'ease',
  'ease-in': 'ease-in',
  'ease-out': 'ease-out',
  'ease-in-out': 'ease-in-out',
};

const PLACE_WORDS = {
  center: ['center', 'center'], start: ['start', 'flex-start'], end: ['end', 'flex-end'],
  between: ['center', 'space-between'], around: ['center', 'space-around'],
  evenly: ['center', 'space-evenly'], stretch: ['stretch', 'flex-start'],
  baseline: ['baseline', 'flex-start'],
};

/* ------------------------------------------------------------------ *
 * Value resolution
 * ------------------------------------------------------------------ */

const IDENT_RE = /^-?(?:[A-Za-z_]|--[A-Za-z_])[A-Za-z0-9_.\\-]*/;

// functions whose numeric arguments are NOT lengths — numbers stay bare
const UNITLESS_FN = new Set(('oklch,oklab,lab,lch,hsl,hsla,rgb,rgba,hwb,color,color-mix,light-dark,' +
  'brightness,saturate,contrast,grayscale,sepia,invert,opacity,' +
  'scale,scalex,scaley,scalez,scale3d,steps,cubic-bezier,linear,radial,conic').split(','));
// functions whose bare numbers ARE lengths (px)
const LENGTH_FN = new Set('calc,min,max,clamp,round,mod,rem,abs,sign,hypot,pow,sqrt,log,exp,blur,drop-shadow'.split(','));

/**
 * Resolve a raw value string into its final form:
 *   - bare numbers get `px` (unless ctx.unitless)
 *   - token references become var(--dssl-…), `token/NN` becomes color-mix
 *   - unknown identifiers are errors (with did-you-mean)
 */
function resolveValue(raw, ctx) {
  let out = '';
  let i = 0;
  const n = raw.length;

  const err = (msg, hint) => ctx.errors.push({ file: ctx.file, line: ctx.line, message: msg, hint });

  while (i < n) {
    const c = raw[i];

    if (/\s/.test(c)) { out += c; i++; continue; }

    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && raw[j] !== c) j++;
      out += raw.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(raw[i + 1] || '')) || ((c === '-' || c === '+') && /[0-9.]/.test(raw[i + 1] || ''))) {
      let j = i + 1;
      while (j < n && /[0-9.]/.test(raw[j])) j++;
      const num = raw.slice(i, j);
      // optional unit
      let unit = '';
      if (j < n && /[a-z%]/i.test(raw[j])) {
        let k = j;
        while (k < n && /[a-z%]/i.test(raw[k])) k++;
        unit = raw.slice(j, k).toLowerCase();
        j = k;
      }
      out += num + (unit ? unit : (ctx.unitless ? '' : TIME_PROPS.has(ctx.prop) ? 'ms' : 'px'));
      i = j;
      continue;
    }

    const idm = raw.slice(i).match(IDENT_RE);
    if (idm) {
      let ident = idm[0];
      i += ident.length;

      if (ident.startsWith('--')) { out += ident; continue; } // custom property

      // function call — resolve the inside
      if (raw[i] === '(') {
        let depth = 1, j = i + 1;
        while (j < n && depth > 0) {
          if (raw[j] === '(') depth++;
          if (raw[j] === ')') depth--;
          if (depth > 0 && (raw[j] === '"' || raw[j] === "'")) {
            const q = raw[j]; j++;
            while (j < n && raw[j] !== q) j++;
          }
          j++;
        }
        const inner = raw.slice(i + 1, j - 1);
        const fname = ident.toLowerCase();
        // v0.8.0 — url() is atomic. The validator used to tokenize INSIDE it,
        // so `url(a.png)` raised "unknown value a.png" (quoted urls worked
        // only because strings were already consumed whole). CSS allows the
        // unquoted form; DSSL passes it through untouched now.
        if (fname === 'url') {
          out += 'url(' + inner.trim() + ')';
          i = j;
          continue;
        }
        // v0.3.2 fix: repeat(COUNT, tracks) — the leading count is an integer,
        // never a length. `repeat(4, 1fr)` used to become `repeat(4px, 1fr)`,
        // which the browser rejected and the whole grid silently collapsed.
        if (fname === 'repeat') {
          const rm = inner.match(/^\s*(\d+(?:\.\d+)?)\s*,([\s\S]*)$/);
          if (rm) {
            out += ident + '(' + rm[1] + ',' + resolveValue(rm[2], { ...ctx, unitless: ctx.unitless }) + ')';
            i = j;
            continue;
          }
          // auto-fill / auto-fit / nested weirdness — fall through to generic
        }
        // color-ish functions keep bare numbers bare; calc-family gets px
        const innerUnitless = UNITLESS_FN.has(fname) ? true : LENGTH_FN.has(fname) ? false : ctx.unitless;
        const resolvedInner = resolveValue(inner, { ...ctx, unitless: innerUnitless });
        out += ident + '(' + resolvedInner + ')';
        i = j;
        continue;
      }

      // token reference?
      const tokenKey = findToken(ctx.tokens, ident);
      if (tokenKey) {
        const varRef = 'var(--dssl-' + tokenKey.replace(/\./g, '-') + ')';
        // alpha modifier:  ink/20
        let rest = raw.slice(i).match(/^\s*\/\s*([0-9.]+)\s*%?/);
        if (rest) {
          out += `color-mix(in oklab, ${varRef} ${rest[1]}%, transparent)`;
          i += rest[0].length;
          continue;
        }
        out += varRef;
        continue;
      }

      // known keyword?
      if (CSS_KEYWORDS.has(ident) || CSS_KEYWORDS.has(ident.toLowerCase())) {
        out += ident;
        continue;
      }

      // v0.5.0 — font names are proper nouns: JetBrains Mono, IBM Plex Serif.
      // In font-family values and font.* tokens, bare multi-word names pass
      // through instead of demanding quotes. Everywhere else stays loud.
      if (ctx.bareIdents && /^[A-Za-z][A-Za-z0-9_-]*$/.test(ident)) {
        out += ident;
        continue;
      }

      err(`unknown value "${ident}" for property "${ctx.prop}"`,
        didYouMean(ident, [...ctx.tokenNames, ...CSS_KEYWORDS]));
      out += ident; // keep going so the rest still resolves
      continue;
    }

    // punctuation: copy (handles / , + * # etc.)
    if (c === '#') { // hex color
      let j = i + 1;
      while (j < n && /[0-9a-fA-F]/.test(raw[j])) j++;
      const hex = raw.slice(i, j);
      out += hex;
      i = j;
      // v0.7.2 — alpha on a raw hex color: #ff0000/50 used to become
      // #ff0000/50px (the bare number got the generic px treatment) — invalid
      // CSS, silently dropped by the browser. Tokens always had /NN via
      // color-mix; raw hex now gets the same treatment.
      const am = raw.slice(i).match(/^\s*\/\s*([0-9.]+)\s*%?/);
      if (am) {
        out = out.slice(0, out.length - hex.length) + `color-mix(in oklab, ${hex} ${am[1]}%, transparent)`;
        i += am[0].length;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** paren-aware split on the `->` arrow — gradient stops use it as a separator */
function splitArrow(s) {
  const out = [];
  let cur = '', depth = 0, q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === q && s[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    if (depth === 0 && c === '-' && s[i + 1] === '>') { out.push(cur); cur = ''; i++; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

/** split on a top-level separator (parens-aware) — commas inside fn() survive */
function topSplit(str, sep) {
  const out = [];
  let cur = '', depth = 0;
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function findToken(tokens, ident) {
  if (tokens.has(ident)) return ident;
  // try progressive dot paths (a.b.c defined, user typed a.b.c — exact only, plus flat fallback)
  if (ident.includes('.')) {
    const parts = ident.split('.');
    for (let k = parts.length - 1; k > 0; k--) {
      const key = parts.slice(0, k).join('.');
      if (tokens.has(key)) return key; // hmm — partial match would change meaning; require exact
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Semantic properties
 * ------------------------------------------------------------------ */

const len = (raw, ctx) => resolveValue(raw, { ...ctx, unitless: false });
const num = (raw, ctx) => resolveValue(raw, { ...ctx, unitless: true });

// v0.6.0 — the deform family speaks degrees, not lengths: bare numbers are
// angles and `20deg` is accepted for people with CSS muscle memory.
const degNum = (raw, what, ctx) => {
  const t = String(raw).trim();
  const m = t.match(/^(-?\d*\.?\d+)(deg)?$/i);
  if (!m) {
    ctx.errors.push({
      file: ctx.file, line: ctx.line,
      message: `${what} takes a bare number of degrees`,
      hint: `try  ${what}: 20  or  ${what}: -12  — bare numbers are degrees here`,
    });
    return null;
  }
  return parseFloat(m[1]);
};

/** v0.6.0 — shared grammar for gradient / gradient-text: kind · prefix · stops.
 *  Stops may be arrow-joined (`a -> b -> c`) or comma-joined (`linear 135, a, b`);
 *  the prefix is whatever the grammar calls direction/shape — everything else is a stop. */
// Stops are colors by construction, so a bare word that is not a color name is
// a typo the browser would only mutter about at apply time. Say it NOW instead.
const COLOR_WORDS = new Set(('black,silver,gray,white,maroon,red,purple,fuchsia,green,lime,olive,yellow,navy,blue,teal,aqua,' +
  'orange,gold,pink,brown,violet,cyan,magenta,indigo,crimson,coral,tomato,goldenrod,khaki,' +
  'slategray,slategrey,dimgray,dimgrey,lightgray,lightgrey,darkgray,darkgrey,gainsboro,whitesmoke,' +
  'ghostwhite,ivory,beige,linen,seashell,snow,honeydew,mintcream,azure,aliceblue,lavender,' +
  'canvas,canvastext,linktext,visitedtext,activetext,buttonface,buttontext,buttonborder,field,fieldtext,highlight,highlighttext,' +
  'currentcolor,transparent').split(','));

function buildGradient(v, ctx) {
  const t = String(v).trim();
  const m = t.match(/^(linear|radial|conic)\b([\s\S]*)$/i);
  if (!m) {
    ctx.errors.push({
      file: ctx.file, line: ctx.line,
      message: `gradient needs a kind: "linear", "radial" or "conic"`,
      hint: 'try  gradient: linear 135, color.accent -> color.ok',
    });
    return null;
  }
  const kind = m[1].toLowerCase();
  const rest = m[2].trim();
  const DIR_RE = /^to\s+(top|bottom|left|right)(\s+(top|bottom|left|right))?$/i;
  const isPrefixShaped = (seg) => {
    const s = seg.toLowerCase();
    if (kind === 'linear') return /^-?\d+(\.\d+)?(deg)?$/.test(s) || DIR_RE.test(s);
    if (kind === 'conic') return /^from\s+-?\d+(\.\d+)?(deg)?(\s+at\s+.+)?$/.test(s) || /^at\s+.+$/.test(s);
    // radial: every atom is shape/size/position vocabulary (possibly around `at`)
    return s.split(/\s+/).every(a => a === 'at' ||
      /^(circle|ellipse|center|top|bottom|left|right|closest-side|farthest-side|closest-corner|farthest-corner|-?\d+(\.\d+)?(%|px|em|rem)?)$/.test(a));
  };
  let head = '';
  let stopStrs = [];
  const arrowParts = splitArrow(rest).map(s => s.trim()).filter(Boolean);
  if (arrowParts.length >= 2) {
    head = arrowParts[0];
    stopStrs = arrowParts.slice(1);
    // mixed styles like `linear 135, a -> b`: the comma belongs to the stop list
    const hc = topSplit(head, ',').map(s => s.trim()).filter(Boolean);
    if (hc.length > 1) { head = hc[0]; stopStrs = [...hc.slice(1), ...stopStrs]; }
  } else {
    const segs = topSplit(rest, ',').map(s => s.trim()).filter(Boolean);
    while (segs.length > 1 && isPrefixShaped(segs[0])) head = head ? head + ' ' + segs.shift() : segs.shift();
    stopStrs = segs;
  }
  if (stopStrs.length < 2) {
    ctx.errors.push({
      file: ctx.file, line: ctx.line,
      message: `gradient needs at least two stops`,
      hint: 'try  gradient: linear 135, #ff0055 -> #00d4ff  — commas work too: linear 135, #ff0055, #00d4ff',
    });
    return null;
  }
  let lead = '';
  const POS_ATOM = /^(center|top|bottom|left|right|closest-side|farthest-side|closest-corner|farthest-corner|-?\d+(?:\.\d+)?(%|px|em|rem)?)$/i;
  if (kind === 'linear') {
    if (!head) lead = '180deg';
    else if (/^-?\d+(\.\d+)?$/.test(head)) lead = head + 'deg';
    else if (/^-?\d+(\.\d+)?deg$/i.test(head)) lead = head.toLowerCase();
    else if (DIR_RE.test(head)) lead = head.toLowerCase();
    else {
      ctx.errors.push({
        file: ctx.file, line: ctx.line,
        message: `"${head}" is not a linear gradient direction`,
        hint: 'use an angle (linear 135, …) or words (linear to bottom right, …)',
      });
      return null;
    }
  } else if (kind === 'radial') {
    if (head) {
      for (const a of head.split(/\s+/)) {
        if (a.toLowerCase() === 'at' || a.toLowerCase() === 'circle' || a.toLowerCase() === 'ellipse' || POS_ATOM.test(a)) continue;
        ctx.errors.push({
          file: ctx.file, line: ctx.line,
          message: `"${a}" is not part of a radial gradient shape`,
          hint: 'try  gradient: radial circle at center, #fff -> #000',
        });
        return null;
      }
      lead = head;
    }
  } else { // conic
    if (head) {
      const fm = head.match(/^from\s+(-?\d+(?:\.\d+)?)(deg)?(?:\s+(at\s+[\s\S]+))?$/i);
      if (fm) lead = 'from ' + fm[1] + 'deg' + (fm[3] ? ' ' + fm[3].trim() : '');
      else if (/^at\s+[\s\S]+$/i.test(head)) lead = head;
      else {
        ctx.errors.push({
          file: ctx.file, line: ctx.line,
          message: `"${head}" is not a conic gradient prefix`,
          hint: 'use  from <angle>  and/or  at <position> — try conic from 45 at center, …',
        });
        return null;
      }
    }
  }
  const stops = [];
  for (const s of stopStrs) {
    let colorPart = s, pos = '';
    const pm = s.match(/\s+(\d+(?:\.\d+)?)%$/);   // trailing per-stop position
    if (pm) { pos = pm[1] + '%'; colorPart = s.slice(0, pm.index).trim(); }
    if (!colorPart) {
      ctx.errors.push({ file: ctx.file, line: ctx.line, message: `a gradient stop is missing its color (got "${s}")` });
      return null;
    }
    const val = resolveValue(colorPart, ctx);
    if (/^[a-z-]+$/i.test(val) && !COLOR_WORDS.has(val.toLowerCase())) {
      ctx.errors.push({
        file: ctx.file, line: ctx.line,
        message: `gradient stop "${s}" is not a color`,
        hint: (didYouMean(val, [...COLOR_WORDS]) || 'colors, tokens (color.ink) and alpha mixes (ink/40) all work'),
      });
      return null;
    }
    stops.push(pos ? `${val} ${pos}` : val);
  }
  const fn = kind === 'linear' ? 'linear-gradient' : kind === 'radial' ? 'radial-gradient' : 'conic-gradient';
  return `${fn}(${[lead, ...stops].filter(Boolean).join(', ')})`;
}

function parseFlexWords(value, ctx, dir) {
  const out = [{ prop: 'display', value: 'flex' }, { prop: 'flex-direction', value: dir }];
  // v0.8.0 — axis roles. Every place word used to write BOTH axes, so
  // `row: gap 8 between center` (the guide's own example) compiled to
  // justify-content: space-between followed by justify-content: center —
  // and center won, bunching everything in the middle. Words now declare
  // the axis they are actually about: distribution words (between/around/
  // evenly) own the main axis, stretch/baseline own the cross axis, and
  // center/start/end fill whichever axes are still free. A word whose axes
  // are all taken is a loud warning instead of a silent overwrite.
  const FLEX_AXIS = {
    between: 'main', around: 'main', evenly: 'main',
    stretch: 'cross', baseline: 'cross',
    center: 'both', start: 'both', end: 'both',
  };
  const atoms = value.split(/\s+/).filter(Boolean);
  let mainSet = null, crossSet = null;
  for (let k = 0; k < atoms.length; k++) {
    const a = atoms[k];
    if (a === 'gap') {
      const v = atoms[++k];
      if (v === undefined) { ctx.errors.push({ file: ctx.file, line: ctx.line, message: 'gap needs a value' }); break; }
      out.push({ prop: 'gap', value: len(v, ctx) });
      continue;
    }
    if (a === 'wrap') { out.push({ prop: 'flex-wrap', value: 'wrap' }); continue; }
    if (a === 'nowrap') { out.push({ prop: 'flex-wrap', value: 'nowrap' }); continue; }
    if (a === 'reverse') { out[1].value = dir + '-reverse'; continue; }
    if (a === 'inline') { out[0].value = 'inline-flex'; continue; }
    if (FLEX_AXIS[a]) {
      const role = FLEX_AXIS[a];
      const pc = PLACE_WORDS[a]; // [cross, main]
      const axisWarn = (prop, prev) => {
        ctx.warnings = ctx.warnings || [];
        ctx.warnings.push(prev === a
          ? { file: ctx.file, line: ctx.line, message: `"${a}" is written twice in ${dir} — the second copy wins`, hint: `drop the duplicate; one distribution word + one alignment word is the whole grammar` }
          : { file: ctx.file, line: ctx.line, message: `two words in ${dir} write ${prop}: "${a}" overrides "${prev}"`, hint: `later words win — drop one, or reorder so the distribution word comes first` });
      };
      let wrote = false;
      if (role === 'main' || (role === 'both' && !mainSet)) {
        if (mainSet) axisWarn('justify-content', mainSet);
        out.push({ prop: 'justify-content', value: pc[1] });
        mainSet = a; wrote = true;
      }
      if (role === 'cross' || (role === 'both' && !crossSet)) {
        if (crossSet) axisWarn('align-items', crossSet);
        out.push({ prop: 'align-items', value: pc[0] });
        crossSet = a; wrote = true;
      }
      if (!wrote) {
        ctx.warnings = ctx.warnings || [];
        ctx.warnings.push({
          file: ctx.file, line: ctx.line,
          message: mainSet === a || crossSet === a
            ? `"${a}" is written twice in ${dir} — both axes already came from it`
            : `"${a}" has nowhere to go: justify-content came from "${mainSet}", align-items came from "${crossSet}"`,
          hint: 'one distribution word + one alignment word is the whole grammar — the extra word is dropped',
        });
      }
      continue;
    }
    ctx.errors.push({ file: ctx.file, line: ctx.line, message: `unknown word "${a}" in ${dir}`, hint: didYouMean(a, ['gap', 'center', 'start', 'end', 'between', 'around', 'evenly', 'stretch', 'baseline', 'wrap', 'nowrap', 'reverse', 'inline']) });
  }
  return out;
}

// v0.6.0 — deform members all land in the transform channel, so asking for
// `transition: 200 snap bend` should just work and mean transform.
const DEFORM_TO_TRANSFORM = {
  bend: 'transform', 'bend-y': 'transform', 'bend-up': 'transform',
  fold: 'transform', stretch: 'transform',
};

const SEMANTIC = {
  size(v, ctx) {
    const parts = v.split(/\s+/).filter(Boolean);
    const w = len(parts[0] || 'auto', ctx);
    const h = parts[1] !== undefined ? len(parts[1], ctx) : w;
    return [{ prop: 'width', value: w }, { prop: 'height', value: h }];
  },
  row: (v, ctx) => parseFlexWords(v, ctx, 'row'),
  column: (v, ctx) => parseFlexWords(v, ctx, 'column'),
  grid(v, ctx) {
    const atoms = v.split(/\s+/).filter(Boolean);
    // v0.7.2 — `grid: 3 gap 12` (the documented form) used to die: the gap
    // atoms were fed into grid-template-columns → "3px gap 12px", invalid.
    // gap and rows are now first-class words of the shorthand.
    let gap = null, rows = null;
    const rest = [];
    for (let i = 0; i < atoms.length; i++) {
      if (atoms[i] === 'gap' && atoms[i + 1]) { gap = atoms[++i]; continue; }
      if (atoms[i] === 'rows' && atoms[i + 1]) { rows = atoms[++i]; continue; }
      rest.push(atoms[i]);
    }
    let cols;
    if (!rest.length) {
      ctx.errors.push({ file: ctx.file, line: ctx.line, message: 'grid needs columns', hint: 'grid: 3 · grid: auto-fill 200 · grid: 200px 1fr — optionally with gap N and rows N' });
      cols = 'none';
    } else if (rest.length === 1 && /^[0-9]+$/.test(rest[0])) {
      cols = `repeat(${rest[0]}, 1fr)`;
    } else if ((rest[0] === 'auto-fill' || rest[0] === 'auto-fit') && rest[1]) {
      cols = `repeat(${rest[0]}, minmax(${len(rest[1], ctx)}, 1fr))`;
    } else {
      cols = rest.map(a => len(a, ctx)).join(' ');
    }
    const out = [{ prop: 'display', value: 'grid' }, { prop: 'grid-template-columns', value: cols }];
    if (gap) out.push({ prop: 'gap', value: len(gap, ctx) });
    if (rows) out.push({ prop: 'grid-template-rows', value: /^[0-9]+$/.test(rows) ? `repeat(${rows}, 1fr)` : len(rows, ctx) });
    return out;
  },
  stack(v, ctx) {
    const word = (v || 'center').trim();
    const p = PLACE_WORDS[word];
    if (!p) {
      ctx.errors.push({ file: ctx.file, line: ctx.line, message: `unknown place "${word}" in stack`, hint: didYouMean(word, Object.keys(PLACE_WORDS)) });
      return [{ prop: '@stack', value: '1' }];
    }
    return [{ prop: 'display', value: 'grid' }, { prop: 'place-items', value: `${p[0]} ${p[1]}` }, { prop: '@stack', value: '1' }];
  },
  place(v, ctx) {
    const p = PLACE_WORDS[v.trim()];
    if (!p) {
      ctx.errors.push({ file: ctx.file, line: ctx.line, message: `unknown place "${v}"`, hint: didYouMean(v, Object.keys(PLACE_WORDS)) });
      return [];
    }
    return [{ prop: 'place-items', value: `${p[0]} ${p[1]}` }, { prop: 'place-content', value: `${p[0]} ${p[1]}` }];
  },
  // v0.3.4 — the one-word centering primitive, because "how do I center this
  // thing" is the first question everyone asks. Emits the alignment pair only;
  // the ENGINE guarantees a formatting context for alignment declarations
  // (inline elements → inline-grid, blocks → grid), so `center:` can never
  // silently no-op the way raw place-items did on spans and buttons.
  //   center:       both axes   ·   center: x   horizontal only   ·   center: y   vertical only
  center(v, ctx) {
    const mode = (v || '').trim().toLowerCase() || 'both';
    if (mode === 'x') {
      return [{ prop: 'justify-items', value: 'center' }, { prop: 'justify-content', value: 'center' }];
    }
    if (mode === 'y') {
      return [{ prop: 'align-items', value: 'center' }, { prop: 'align-content', value: 'center' }];
    }
    if (mode !== 'both') {
      ctx.errors.push({ file: ctx.file, line: ctx.line, message: `unknown center axis "${v}"`, hint: didYouMean(mode, ['both', 'x', 'y']) });
      return [];
    }
    return [{ prop: 'place-items', value: 'center center' }, { prop: 'place-content', value: 'center center' }];
  },
  cover(v, ctx) {
    const pos = (v || 'absolute').trim();
    return [{ prop: 'position', value: pos }, { prop: 'inset', value: '0' }];
  },
  sticky(v, ctx) {
    return [{ prop: 'position', value: 'sticky' }, { prop: 'top', value: len(v || '0', ctx) }];
  },
  font(v, ctx) {
    const out = [];
    const slash = v.split('/');
    const head = slash[0].trim().split(/\s+/).filter(Boolean);
    out.push({ prop: 'font-size', value: len(head[0] || '16', ctx) });
    if (slash[1]) {
      const tail = slash[1].trim().split(/\s+/).filter(Boolean);
      out.push({ prop: 'line-height', value: num(tail[0] || '1.5', ctx) });
      if (tail.length > 1) out.push({ prop: 'color', value: resolveValue(tail.slice(1).join(' '), ctx) });
    } else if (head.length > 1) {
      out.push({ prop: 'color', value: resolveValue(head.slice(1).join(' '), ctx) });
    }
    return out;
  },
  fluid(v, ctx) {
    return buildFluidParts(v.split(',').map(s => s.trim()).filter(Boolean), ctx);
  },
  shadow(v, ctx) {
    const t = v.trim();
    if (['sm', 'md', 'lg', 'xl', 'none'].includes(t)) {
      return [{ prop: 'box-shadow', value: t === 'none' ? 'none' : `var(--dssl-shadow-${t})` }];
    }
    return [{ prop: 'box-shadow', value: resolveValue(v, ctx) }];
  },
  radius(v, ctx) {
    const atoms = v.trim().split(/\s+/).filter(Boolean);
    const out = atoms.map(a => {
      if (['sm', 'md', 'lg', 'full', 'xl'].includes(a)) return `var(--dssl-radius-${a})`;
      return resolveValue(a, ctx);
    });
    return [{ prop: 'border-radius', value: out.join(' ') }];
  },
  circle(v, ctx) {
    const s = len(v, ctx);
    return [
      { prop: 'width', value: s },
      { prop: 'height', value: s },
      { prop: 'border-radius', value: '50%' },
    ];
  },
  align(v, ctx) {
    const map = { center: 'center', start: 'start', end: 'end', stretch: 'stretch', baseline: 'baseline' };
    const val = map[v.trim()];
    if (!val) {
      ctx.errors.push({ file: ctx.file, line: ctx.line, message: `unknown align "${v}"`, hint: didYouMean(v, Object.keys(map)) });
      return [];
    }
    return [{ prop: 'align-items', value: val }];
  },
  z(v, ctx) { return [{ prop: 'z-index', value: num(v, ctx) }]; },
  grow(v, ctx) { return [{ prop: 'flex-grow', value: num(v || '1', ctx) }]; },
  shrink(v, ctx) { return [{ prop: 'flex-shrink', value: num(v || '1', ctx) }]; },
  basis(v, ctx) { return [{ prop: 'flex-basis', value: len(v, ctx) }]; },
  truncate() {
    return [
      { prop: 'overflow', value: 'hidden' },
      { prop: 'text-overflow', value: 'ellipsis' },
      { prop: 'white-space', value: 'nowrap' },
    ];
  },
  // v0.4.0 — the accessibility classic: visually hidden, still announced by
  // screen readers. One word instead of nine lines of clip folklore.
  'visually-hidden'() {
    return [
      { prop: 'position', value: 'absolute' },
      { prop: 'width', value: '1px' },
      { prop: 'height', value: '1px' },
      { prop: 'padding', value: '0' },
      { prop: 'margin', value: '-1px' },
      { prop: 'overflow', value: 'hidden' },
      { prop: 'clip-path', value: 'inset(50%)' },
      { prop: 'white-space', value: 'nowrap' },
      { prop: 'border', value: '0' },
    ];
  },
  // v0.4.0 — transition grew per-property specs. Each comma part is
  //   duration [easing] [property]     (property omitted → all)
  // The one-value form keeps working exactly as before:
  //   transition: 200 snap
  //   transition: 150 snap background-color, 300 transform
  transition(v, ctx) {
    const t = v.trim();
    if (t === 'none') return [{ prop: 'transition', value: 'none' }];
    const parts = topSplit(t, ',').map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const part of parts) {
      const atoms = part.split(/\s+/);
      const dur = atoms[0];
      if (!/^\d*\.?\d+(ms|s)?$/.test(dur)) {
        // v0.8.0 — the CSS habit is property-first (`transition: color .2s
        // ease`). That used to be a generic "not a time" error and the part
        // silently dropped. The error now REWRITES the value into the DSSL
        // order (time · easing · property) so the fix is a copy-paste.
        const timeAtom = atoms.find(a => /^\d*\.?\d+(ms|s)?$/.test(a));
        const easeAtom = atoms.find(a => EASINGS[a]);
        const propAtom = atoms.find(a => a !== timeAtom && a !== easeAtom && (KNOWN_PROPS.has(a) || DEFORM_TO_TRANSFORM[a]));
        if (timeAtom) {
          const msOut = /^\d+$/.test(timeAtom) ? timeAtom : /ms$/.test(timeAtom) ? timeAtom.replace(/ms$/, '') : String(parseFloat(timeAtom) * 1000);
          ctx.errors.push({
            file: ctx.file, line: ctx.line,
            message: `transition: the CSS form (property first) is not DSSL`,
            hint: `write  transition: ${msOut}${easeAtom ? ' ' + easeAtom : ''}${propAtom ? ' ' + propAtom : ''}  — time first, easing, property last`,
          });
          continue;
        }
        ctx.errors.push({ file: ctx.file, line: ctx.line, message: `transition duration "${dur}" is not a time`, hint: 'order is duration · easing · property — try 200 or 0.2s' });
        continue;
      }
      const ms = /^\d+$/.test(dur) ? dur + 'ms' : dur;
      let k = 1;
      let easing = 'ease';
      if (atoms[k] && EASINGS[atoms[k]]) { easing = EASINGS[atoms[k]]; k++; }
      else if (atoms[k] && /^(cubic-bezier|steps)\(/.test(atoms[k])) {
        easing = resolveValue(atoms[k], { ...ctx, unitless: true });
        k++;
      }
      let prop = 'all';
      if (atoms.length > k) {
        const raw = atoms.slice(k).join(' ').toLowerCase();
        const p = DEFORM_TO_TRANSFORM[raw] || raw;
        if (p !== 'all' && !KNOWN_PROPS.has(p)) {
          ctx.errors.push({ file: ctx.file, line: ctx.line, message: `unknown transition property "${raw}"`, hint: didYouMean(raw, [...KNOWN_PROPS, ...Object.keys(DEFORM_TO_TRANSFORM)]) });
          continue;
        }
        prop = p;
      }
      out.push(`${prop} ${ms} ${easing}`);
    }
    if (!out.length) return [];
    return [{ prop: 'transition', value: out.join(', ') }];
  },
  animate(v, ctx) {
    const t = v.trim();
    if (t === 'none') return [{ prop: '@animate', value: null }];
    const atoms = t.split(/\s+/);
    const spec = { motion: atoms[0], duration: 400, easing: EASINGS.smooth, fill: 'both', delay: 0 };
    for (let k = 1; k < atoms.length; k++) {
      const a = atoms[k];
      if (/^\d+(ms|s)?$/.test(a)) {
        const ms = a.endsWith('s') && !a.endsWith('ms') ? parseFloat(a) * 1000 : parseFloat(a);
        if (k === 1) spec.duration = ms; else spec.delay = ms;
        continue;
      }
      if (EASINGS[a]) { spec.easing = EASINGS[a]; continue; }
      if (['both', 'forwards', 'backwards', 'none', 'auto'].includes(a)) { spec.fill = a; continue; }
      // v0.5.0 — looping: `infinite` runs forever, `alternate` ping-pongs.
      // animate: pulse 1600 infinite alternate  — was impossible before.
      if (a === 'infinite') { spec.iterations = Infinity; continue; }
      if (['alternate', 'alternate-reverse', 'reverse', 'normal'].includes(a)) { spec.direction = a; continue; }
      ctx.errors.push({ file: ctx.file, line: ctx.line, message: `unknown animate part "${a}"`, hint: didYouMean(a, Object.keys(EASINGS).concat(['both', 'forwards', 'backwards', 'infinite', 'alternate'])) });
    }
    return [{ prop: '@animate', value: spec }];
  },
  // v0.4.0 — choreography: a parent with `stagger: 60` offsets each element
  // child's animation delay by its DOM position. Pairs with `seen` + `animate`
  // on the children: grids and lists cascade in as they scroll into view.
  stagger(v, ctx) {
    const t = (v || '').trim();
    if (t === 'none') return [{ prop: '@stagger', value: null }];
    if (!/^\d+(?:\.\d+)?(?:ms|s)?$/.test(t)) {
      ctx.errors.push({ file: ctx.file, line: ctx.line, message: `stagger needs a duration like "60" or "120ms", or "none"`, hint: 'stagger offsets each child\'s animation delay by its position' });
      return [];
    }
    const ms = t.endsWith('s') && !t.endsWith('ms') ? parseFloat(t) * 1000 : parseFloat(t);
    return [{ prop: '@stagger', value: ms }];
  },
  // v0.5.0 — overlap policy. CSS can stack transparent things all day and say
  // nothing; DSSL refuses. `deny` makes the element always yield out of any
  // overlap; `auto` yields only while the element sits below 100% opacity.
  // Both inherit down the tree, so `body { overlap: auto }` is the site-wide
  // "nothing transparent may overlap anything" switch. Intentional overlays
  // (scrims, veils, translucent navs) opt out with `overlap: allow`.
  overlap(v, ctx) {
    const t = (v || '').trim().toLowerCase();
    if (t === 'allow' || t === 'none') return [{ prop: '@overlap', value: 'allow' }];
    if (t === 'deny') return [{ prop: '@overlap', value: 'deny' }];
    if (t === 'auto') return [{ prop: '@overlap', value: 'auto' }];
    ctx.errors.push({
      file: ctx.file, line: ctx.line,
      message: `unknown overlap policy "${(v || '').trim()}"`,
      hint: 'overlap is allow (default) · deny (always yield out of overlaps) · auto (yield only while below 100% opacity)',
    });
    return [];
  },

  /* ---------------------------------------------------------------- *
   * v0.6.0 — the deform family: bend, bend-y, bend-up, fold, stretch,
   * bend-around. All are engine-native (@-props) that compose into the
   * transform channel, so `transition: 200 snap transform` tweens them
   * and `:active { bend: 14 }` makes a button visibly flex under the
   * pointer. bend-around is the odd one out: it curves a CONTAINER's
   * children along an arc instead of deforming the element itself.
   * ---------------------------------------------------------------- */
  bend(v, ctx) { const n = degNum(v, 'bend', ctx); return n === null ? [] : [{ prop: '@bend', value: n }]; },
  'bend-y'(v, ctx) { const n = degNum(v, 'bend-y', ctx); return n === null ? [] : [{ prop: '@bend-y', value: n }]; },
  'bend-up'(v, ctx) { const n = degNum(v, 'bend-up', ctx); return n === null ? [] : [{ prop: '@bend-up', value: n }]; },
  fold(v, ctx) { const n = degNum(v, 'fold', ctx); return n === null ? [] : [{ prop: '@fold', value: n }]; },
  'bend-around'(v, ctx) {
    const n = degNum(v, 'bend-around', ctx);
    if (n === null) return [];
    if (Math.abs(n) > 170) {
      ctx.errors.push({
        file: ctx.file, line: ctx.line,
        message: `bend-around caps at ±170° — past that the arc folds back on itself`,
        hint: 'try 30..120 for a visible arc',
      });
      return [];
    }
    return [{ prop: '@bend-around', value: n }];
  },
  stretch(v, ctx) {
    const t = String(v).trim();
    const m = t.match(/^(\d*\.?\d+)(?:\s+(horizontal|vertical|x|y))?$/i);
    if (!m) {
      ctx.errors.push({
        file: ctx.file, line: ctx.line,
        message: `stretch needs a positive factor, like "stretch: 1.2" or "stretch: 1.4 vertical"`,
        hint: '1 is neutral · the other axis shrinks so volume stays constant',
      });
      return [];
    }
    const f = parseFloat(m[1]);
    if (f <= 0) {
      ctx.errors.push({
        file: ctx.file, line: ctx.line,
        message: `stretch: ${m[1]} would flatten the element to nothing`,
        hint: 'use a factor above 0 — 1.2 is a gentle pull, 2 is cartoonish',
      });
      return [];
    }
    const axisRaw = (m[2] || 'horizontal').toLowerCase();
    const axis = axisRaw === 'y' ? 'vertical' : axisRaw === 'x' ? 'horizontal' : axisRaw;
    return [{ prop: '@stretch', value: { factor: f, axis } }];
  },

  /* v0.6.0 — gradient tools. `gradient` replaces the CSS function soup with
   * kind · prefix · stop -> stop; stops may be colors, tokens, alpha mixes
   * (ink/40) and carry a trailing % position. gradient-text clips the same
   * gradient into the glyphs. gradient-flow loops background-position so a
   * gradient drifts forever — one line instead of keyframe folklore. */
  gradient(v, ctx) {
    const img = buildGradient(v, ctx);
    return img ? [{ prop: 'background-image', value: img }] : [];
  },
  'gradient-text'(v, ctx) {
    const img = buildGradient(v, ctx);
    if (!img) return [];
    return [
      { prop: 'background-image', value: img },
      { prop: 'background-clip', value: 'text' },
      { prop: '-webkit-background-clip', value: 'text' },
      { prop: 'color', value: 'transparent' },
      { prop: '-webkit-text-fill-color', value: 'transparent' },
    ];
  },
  'gradient-flow'(v, ctx) {
    const t = (v || '').trim();
    if (!t || t === 'none') return [{ prop: '@gradient-flow', value: null }];
    const atoms = t.split(/\s+/);
    const dur = atoms[0];
    if (!/^\d+(\.\d+)?(ms|s)?$/.test(dur)) {
      ctx.errors.push({
        file: ctx.file, line: ctx.line,
        message: `gradient-flow takes a duration like "6s" or "6000ms", or "none"`,
        hint: 'gradient-flow loops the element\'s gradient sideways forever',
      });
      return [];
    }
    const ms = dur.endsWith('s') && !dur.endsWith('ms') ? parseFloat(dur) * 1000 : parseFloat(dur);
    const spec = { duration: ms, easing: 'linear', direction: 'normal' };
    for (let k = 1; k < atoms.length; k++) {
      const a = atoms[k];
      if (EASINGS[a]) { spec.easing = EASINGS[a]; continue; }
      if (a === 'alternate' || a === 'alternate-reverse') { spec.direction = a; continue; }
      ctx.errors.push({
        file: ctx.file, line: ctx.line,
        message: `unknown gradient-flow part "${a}"`,
        hint: didYouMean(a, [...Object.keys(EASINGS), 'alternate', 'alternate-reverse']),
      });
    }
    return [{ prop: '@gradient-flow', value: spec }];
  },
};

/* v0.8.0 — fluid sizing sugar. `fluid: 16, 24` keeps working (font-size),
 * and now any length-ish property takes it inline: `font-size: fluid 16 24`.
 * Both compile to a clamp() that scales linearly between the viewport bounds
 * (360px and 1200px by default) — the formula everyone writes by hand and
 * gets wrong. */
const FLUID_PROPS = new Set(('font-size,width,height,inline-size,block-size,min-width,max-width,min-height,max-height,' +
  'gap,row-gap,column-gap,padding,margin,inset,top,right,bottom,left').split(','));

function buildFluidParts(parts, ctx, prop = 'font-size') {
  const px = (s) => {
    const m = String(s).match(/^([0-9.]+)\s*(px|rem|em|%)?$/);
    if (!m) {
      ctx.errors.push({ file: ctx.file, line: ctx.line, message: `fluid: "${s}" is not a size`, hint: 'fluid takes two sizes and optionally the viewport bounds — fluid 16 24, or fluid 16 24 360 1200' });
      return '0px';
    }
    return m[2] ? `${m[1]}${m[2]}` : `${m[1]}px`;
  };
  const min = px(parts[0]); const max = px(parts[1]);
  const vmin = px(parts[2] || '360'); const vmax = px(parts[3] || '1200');
  const mv = parseFloat(min), xv = parseFloat(max);
  const slope = ((xv - mv) / (parseFloat(vmax) - parseFloat(vmin))) * 100;
  return [{ prop, value: `clamp(${min}, calc(${min} + ${slope.toFixed(3)}vw), ${max})` }];
}

/* ------------------------------------------------------------------ *
 * resolveDecl — one declaration → zero or more engine decls
 * ------------------------------------------------------------------ */

function resolveDecl(prop, value, ctx) {
  const errors = ctx.errors;
  const ctx2 = { ...ctx, prop, errors, warnings: ctx.warnings };

  // v0.8.0 — !important does not exist in DSSL. It used to fall through as a
  // value: the compiler said "unknown value important" AND still emitted
  // `red !important`, which the browser then silently dropped as an invalid
  // inline value. Now: one loud error, nothing emitted, and the pin { }
  // answer to the actual question.
  if (hasImportant(value)) {
    errors.push({
      file: ctx.file, line: ctx.line,
      message: `!important does not exist in DSSL — "${prop}: ${String(value).replace(/\s*!\s*important\s*/i, '')}" was NOT applied`,
      hint: 'the cascade is (layer, order) and later wins — put the rule in pin { } when it genuinely must win',
    });
    return [];
  }

  if (prop.startsWith('--')) {
    // v0.4.0 — scoped tokens. Dotted names are token re-declarations:
    //   .danger { --color.accent: color.err }
    // sets --dssl-color-accent ON the element, and custom properties inherit,
    // so every var() reference in the subtree re-resolves. Plain names
    // (--brand) stay free-form custom properties, passed through unvalidated.
    const outProp = prop.includes('.')
      ? '--dssl-' + prop.slice(2).replace(/\./g, '-')
      : prop;
    return [{ prop: outProp, value: resolveValue(value, { ...ctx2, unitless: false, bareIdents: true }) }];
  }

  const sem = SEMANTIC[prop];
  if (sem) return sem(value, ctx2);

  // v0.8.0 — the animation shorthand passes through (it is legal CSS), but
  // bare motion names must not pay the generic unknown-value tax: "spin"
  // used to error with the surreal suggestion "did you mean span?". Motion
  // names pass silently here and a dedicated warning in the final loop says
  // the DSSL way (motion + animate) when the name matches nothing.
  if (prop === 'animation' || prop === 'animation-name') {
    return [{ prop, value: resolveValue(value, { ...ctx2, unitless: UNITLESS_PROPS.has(prop), bareIdents: true }) }];
  }

  // v0.8.0 — inline fluid sugar on any length-ish property:
  // font-size: fluid 16 24  →  clamp(16px, calc(16px + 0.952vw), 24px)
  const fluidM = /^fluid\s+([\s\S]+)$/.exec(String(value).trim());
  if (fluidM && FLUID_PROPS.has(prop)) {
    return buildFluidParts(fluidM[1].split(/[\s,]+/).filter(Boolean), ctx2, prop);
  }

  if (!KNOWN_PROPS.has(prop)) {
    errors.push({
      file: ctx.file, line: ctx.line,
      message: `unknown property "${prop}"`,
      hint: didYouMean(prop, [...KNOWN_PROPS, ...Object.keys(SEMANTIC)]),
    });
    return [];
  }
  return [{ prop, value: resolveValue(value, { ...ctx2, unitless: UNITLESS_PROPS.has(prop), bareIdents: prop === 'font-family' }) }];
}

/** string-aware !important scan — quoted content: "!important" must not trip it */
function hasImportant(v) {
  const s = String(v);
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q && s[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '!' && /\s*important/i.test(s.slice(i + 1))) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Media / container / signal normalization
 * ------------------------------------------------------------------ */

function normalizeMedia(query, ctx, line) {
  let q = query.trim();
  if (!q) {
    ctx.errors.push({ file: ctx.file, line, message: '@media needs a condition', hint: 'e.g. @media 768  or  @media dark  or  @media (width >= 768)' });
    return '(min-width: 0)';
  }
  // ---- v0.3 one-word sugar (the conditions everyone writes) ----
  if (/^dark$/i.test(q)) return '(prefers-color-scheme: dark)';
  if (/^light$/i.test(q)) return '(prefers-color-scheme: light)';
  if (/^reduced-motion$/i.test(q)) return '(prefers-reduced-motion: reduce)';
  // ---- bare-width sugar ----
  //   @media 768        → (min-width: 768px)   "this wide or wider"
  //   @media <= 768     → (max-width: 768px)   "narrower than this"
  //   @media 480..960   → min + max range
  const m = q.match(/^(<=|>=)?\s*(\d+(?:\.\d+)?)\s*(?:\.\.\s*(\d+(?:\.\d+)?))?$/);
  if (m) {
    const a = m[2] + 'px';
    if (m[3] !== undefined) return `(min-width: ${a}) and (max-width: ${m[3]}px)`;
    if (m[1] === '<=') return `(max-width: ${a})`;
    return `(min-width: ${a})`;
  }
  // bare numbers become px:  (width >= 768)  →  (width >= 768px)
  q = q.replace(/([>=<]\s*)(\d+(?:\.\d+)?)\b(?!\s*(?:px|%|em|rem|vh|vw|vmin|vmax|s|ms|deg|dppx|x))/g, '$1$2px');
  return q;
}

function parseSignal(expr, ctx, line) {
  const m = expr.match(/^([A-Za-z_][\w-]*)\s*(==|!=)\s*(.+)$/);
  if (m) {
    let v = m[3].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return { name: m[1], op: m[2], value: v };
  }
  if (/^[A-Za-z_][\w-]*$/.test(expr.trim())) return { name: expr.trim(), op: 'truthy', value: null };
  ctx.errors.push({ file: ctx.file, line, message: `bad @signal expression "${expr}"`, hint: 'try:  @signal theme == dark   or   @signal compact' });
  return { name: expr.trim(), op: 'truthy', value: null };
}

/* ------------------------------------------------------------------ *
 * The flattener
 * ------------------------------------------------------------------ */

export function resolve(ast, file = 'inline.dssl', baseTokens = null) {
  const errors = [];
  const rules = [];
  const shadowRules = [];
  const raws = []; // v0.8.0 — raw { } / @css { } verbatim passthrough blocks
  const motions = {};
  const behaviors = {};
  // v0.7.0 — compile-time warnings: things that compile and run but are
  // probably not what the author meant. Separate from errors — ok stays ok —
  // but the engine prints them loudly so nobody debugs cascade order by hand
  // ever again.
  const warnings = [];
  let tokenMap = new Map(Object.entries(baseTokens || DEFAULT_TOKENS));
  const tokenLines = new Map(); // for docs/debug
  let order = 0;
  let ruleId = 0;

  /* ---- pass 1: collect tokens / behaviors / motions ---- */

  const collectTokens = (node, path, acc) => {
    for (const child of node.children) {
      if (child.kind === 'decl') {
        const key = path ? path + '.' + child.prop : child.prop;
        tokenMap.set(key, child.value);
        tokenLines.set(key, child.line);
        if (acc) acc.push(key);
      } else if (child.kind === 'selector' || child.kind === 'tokens') {
        // nested groups written as bare words: `color { ink: ... }`
        collectTokens(child, path ? path + '.' + child.sel : child.sel, acc);
      } else {
        errors.push({ file, line: child.line, message: `unexpected "${child.kind}" inside tokens` });
      }
    }
  };

  const prepass = (nodes) => {
    for (const node of nodes) {
      if (node.kind === 'tokens') collectTokens(node, '');
      else if (node.kind === 'behavior') {
        if (behaviors[node.name]) errors.push({ file, line: node.line, message: `behavior "${node.name}" is defined twice` });
        behaviors[node.name] = node;
      } else if (node.kind === 'motion') {
        motions[node.name] = node;
      } else {
        // v0.8.0 — defensive `|| []`: a malformed tree can throw from here
        // and take the whole stylesheet down (the @font-face crash report).
        // The parser now skips unknown at-rules whole, but the guard stays.
        for (const child of (node.children || [])) if (child.kind !== 'decl') prepass([child]);
      }
    }
  };
  prepass(ast.children);

  /* ---- motions → keyframes ---- */

  const parseMotion = (name) => {
    const node = motions[name];
    if (!node) return null;
    if (node._parsed) return node._parsed;
    node._parsed = { essential: false, frames: [] };
    const frameOf = (label) => {
      if (label === 'from') return 0;
      if (label === 'to') return 100;
      const m = label.match(/^at\s+([0-9.]+)\s*%?$/);
      return m ? parseFloat(m[1]) : null;
    };
    const ctxBase = { file, line: node.line, errors, warnings, tokens: tokenMap, tokenNames: [...tokenMap.keys()], prop: 'motion', unitless: false };
    for (const child of node.children) {
      if (child.kind === 'decl' && child.prop === 'essential') {
        node._parsed.essential = child.value === '' || child.value === 'true';
        continue;
      }
      if (child.kind === 'decl') {
        errors.push({ file, line: child.line, message: `"${child.prop}" is not allowed inside motion`, hint: 'motions take from/to/at blocks and `essential`' });
        continue;
      }
      if (child.kind === 'selector') {
        const offset = frameOf(child.sel);
        if (offset === null) {
          errors.push({ file, line: child.line, message: `bad keyframe selector "${child.sel}"`, hint: 'use from, to, or at 40%' });
          continue;
        }
        const props = {};
        const deform = {};   // v0.6.0 — bend/stretch/fold in keyframes compose into transform
        const DEFORM_KEY = { '@bend': 'bend', '@bend-y': 'bendY', '@fold': 'fold', '@bend-up': 'bendUp' };
        for (const d of child.children) {
          if (d.kind !== 'decl') continue;
          const resolved = resolveDecl(d.prop, d.value, { ...ctxBase, line: d.line });
          for (const r of resolved) {
            if (r.prop.startsWith('--')) continue;
            if (r.prop.startsWith('@')) {
              if (r.prop === '@stretch' && r.value) {
                deform.stretch = typeof r.value === 'object' ? Number(r.value.factor) : parseFloat(r.value);
                deform.stretchAxis = (r.value && r.value.axis) || 'horizontal';
              } else if (DEFORM_KEY[r.prop]) deform[DEFORM_KEY[r.prop]] = Number(r.value) || 0;
              continue;
            }
            const camel = r.prop.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
            props[camel] = r.value;
          }
        }
        if (deform.bend !== undefined || deform.bendY !== undefined || deform.stretch !== undefined ||
            deform.fold !== undefined || deform.bendUp !== undefined) {
          // no box exists at resolve time, so edge-pinned members ride a
          // transformOrigin keyframe property instead of baked translates.
          // Presence (not truthiness) — `bend: 0` in a frame is a real reset.
          const c = composeDeform(deform, props.transform || '', null);
          props.transform = c.transform;
          if (c.origin) props.transformOrigin = c.origin;
        }
        node._parsed.frames.push({ offset, props });
      }
    }
    node._parsed.frames.sort((a, b) => a.offset - b.offset);
    return node._parsed;
  };

  /* ---- token emission ---- */

  const tokenNames = () => [...tokenMap.keys()];

  const resolveTokenDecls = (keys, conds) => {
    const decls = [];
    const ctxBase = { file, line: 0, errors, warnings, tokens: tokenMap, tokenNames: tokenNames(), prop: 'token', unitless: false };
    for (const key of keys) {
      const raw = tokenMap.get(key);
      const prop = '--dssl-' + key.replace(/\./g, '-');
      // font.* tokens hold font stacks — proper nouns, not keywords (v0.5.0)
      decls.push({ prop, value: resolveValue(raw, { ...ctxBase, prop: key, bareIdents: /^font/.test(key) }) });
    }
    if (!decls.length) return null;
    return {
      id: ruleId++, sel: ':root', media: conds.media, signals: conds.signals,
      containers: conds.containers, layer: 'tokens', order: order++,
      decls, file, line: 0, pseudo: null, states: new Set(),
    };
  };

  /** used by index.js to install the shared registry as a base bundle */
  // Built immediately, before the walk, so its cascade order sorts below every
  // author rule (engine cascade: layer first, then source order).
  const registryRule = resolveTokenDecls([...tokenMap.keys()], { media: [], signals: [], containers: [] });

  /* ---- main recursive walk ---- */

  const walk = (children, ctx, ctxRule) => {
    // v0.7.2 — parent-first flush. Two real bugs lived here. (1) A nested
    // block (hover { }, @media, a nested selector) was emitted BEFORE the
    // parent's own declarations got their cascade order, so `background: red`
    // on the parent always beat `hover { background: red }` nested inside it
    // — the exact pattern the docs taught, and the external review's headline
    // finding. (2) media/container/signal/layer blocks flushed with the
    // PARENT context, dropping the condition or layer entirely: a nested
    // `@media dark` was silently unconditional AND sorted before base.
    // Nested blocks now flush everything the parent has said so far first,
    // and every block flushes with the context it was actually walked with.
    const flushPending = (line) => {
      if (ctxRule && ctxRule.decls.length && ctx.sel) {
        flush(ctxRule, ctx, line);
        ctxRule.decls = [];
      }
    };
    for (const node of children) {
      switch (node.kind) {
        case 'decl': {
          if (node.prop === 'use') {
            const name = node.value.trim();
            const bh = behaviors[name];
            if (!bh) {
              errors.push({ file, line: node.line, message: `unknown behavior "${name}"`, hint: didYouMean(name, Object.keys(behaviors)) });
              break;
            }
            if (bh._active) { errors.push({ file, line: node.line, message: `behavior cycle involving "${name}"` }); break; }
            bh._active = true;
            walk(bh.children, ctx, ctxRule);
            bh._active = false;
            break;
          }
          const resolved = resolveDecl(node.prop, node.value, { file, line: node.line, errors, warnings, tokens: tokenMap, tokenNames: tokenNames(), prop: node.prop, unitless: false });
          for (const r of resolved) {
            // v0.7.0 — remember WHICH source property wrote a display value,
            // so the ordering linter can tell an explicit "display:" from a
            // shorthand that expanded into one (column: → display: flex).
            if (r.prop === 'display' && node.prop !== 'display') r.via = node.prop;
            ctxRule.decls.push({ ...r, line: node.line });
          }
          break;
        }
        case 'selector': {
          if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(node.sel) && ctx.sel) {
            const near = didYouMean(node.sel.toLowerCase(), [...STATE_WORDS]);
            if (near) warnings.push({ file, line: node.line, message: `"${node.sel}" compiled as a descendant selector ("${combine(ctx.sel, node.sel)}")`, hint: `if you meant the state, it is spelled "${near}" — this block currently styles descendants called <${node.sel}>` });
          }
          flushPending(node.line);
          const sel = ctx.sel === '' ? node.sel : combine(ctx.sel, node.sel);
          const childCtx = { ...ctx, sel };
          const sub = { decls: [] };
          walk(node.children, childCtx, sub);
          flush(sub, childCtx, node.line);
          break;
        }
        case 'state': {
          if (!ctx.sel) {
            errors.push({ file, line: node.line, message: `"${node.name}" needs a selector around it` });
            break;
          }
          flushPending(node.line);
          const childCtx = { ...ctx, sel: ctx.sel + ':' + node.name };
          // v0.7.2 — the arrow is motion/gradient-stop syntax; inside a seen
          // block it compiled into an inline style the browser rejects, so the
          // element just sat at its base style forever. Say so, loudly, and
          // point at the two real patterns (final value, or a motion).
          if (node.name === 'seen') {
            for (const d of node.children) {
              if (d.kind === 'decl' && typeof d.value === 'string' && d.value.includes('->')) {
                errors.push({ file, line: d.line, message: `"${d.prop}: ${d.value}" — the -> arrow is motion syntax and does nothing inside seen { }`, hint: 'write the final style (seen { opacity: 1 }) or attach a motion (seen { animate: rise-in 400 })' });
              }
            }
          }
          const sub = { decls: [] };
          walk(node.children, childCtx, sub);
          flush(sub, childCtx, node.line);
          break;
        }
        case 'media': {
          const q = normalizeMedia(node.query, { errors, file, line: node.line }, node.line);
          flushPending(node.line);
          const childCtx = { ...ctx, media: [...ctx.media, q] };
          const sub = { decls: [] };
          walk(node.children, childCtx, sub);
          flush(sub, childCtx, node.line);
          break;
        }
        case 'container': {
          const q = normalizeMedia(node.query || '(min-width: 0)', { errors, file, line: node.line }, node.line);
          flushPending(node.line);
          const childCtx = { ...ctx, containers: [...ctx.containers, q] };
          const sub = { decls: [] };
          walk(node.children, childCtx, sub);
          flush(sub, childCtx, node.line);
          break;
        }
        case 'signal': {
          const sig = parseSignal(node.expr, { errors, file, line: node.line }, node.line);
          flushPending(node.line);
          const childCtx = { ...ctx, signals: [...ctx.signals, sig] };
          const sub = { decls: [] };
          walk(node.children, childCtx, sub);
          flush(sub, childCtx, node.line);
          break;
        }
        case 'layer':
        case 'pin': {
          const layer = node.kind === 'pin' ? 'pin' : (['tokens', 'base', 'components', 'utilities', 'pin'].includes(node.name) ? node.name : 'components');
          flushPending(node.line);
          const childCtx = { ...ctx, layer };
          const sub = { decls: [] };
          walk(node.children, childCtx, sub);
          flush(sub, childCtx, node.line);
          break;
        }
        case 'pseudo': {
          const base = ctx.sel || '*'; // top-level ::selection etc. means every element
          const srule = {
            id: ruleId++, sel: base, pseudo: node.name,
            media: ctx.media, signals: ctx.signals, containers: ctx.containers,
            layer: ctx.layer, order: order++, decls: [], file, line: node.line,
          };
          for (const d of node.children) {
            if (d.kind !== 'decl') { errors.push({ file, line: d.line, message: 'only declarations may appear inside a pseudo-element block (v0.2)' }); continue; }
            if (d.prop === 'content' && d.value === '') { srule.decls.push({ prop: 'content', value: '""', line: d.line }); continue; }
            const resolved = resolveDecl(d.prop, d.value, { file, line: d.line, errors, warnings, tokens: tokenMap, tokenNames: tokenNames(), prop: d.prop, unitless: false });
            // v0.5.0 — engine-native properties have no pseudo-element story:
            // there is no DOM handle to nudge, animate, stack or stagger. They
            // used to leak into the shadow sheet as junk CSS the browser
            // silently dropped — exactly the silence this language refuses.
            for (const r of resolved) {
              if (r.prop.startsWith('@')) {
                errors.push({ file, line: d.line, message: `"${d.prop}" is engine-native and has no meaning on ::${node.name} — a pseudo-element has no DOM handle`, hint: 'put it on the element itself, not inside the pseudo block' });
                continue;
              }
              srule.decls.push({ ...r, line: d.line });
            }
          }
          if (srule.decls.length) shadowRules.push(srule);
          break;
        }
        case 'tokens': {
          if (ctx.sel) { errors.push({ file, line: node.line, message: 'tokens must be top-level or inside @media / @signal' }); break; }
          // structural tracking: only keys THIS block declares are emitted,
          // so conditional palettes don't shadow unrelated tokens
          const ownKeys = [];
          collectTokens(node, '', ownKeys);
          const tr = ownKeys.length ? resolveTokenDecls(ownKeys, ctx) : null;
          if (tr) rules.push(tr);
          break;
        }
        case 'raw': {
          // v0.8.0 — verbatim CSS escape hatch (@font-face, @keyframes,
          // @supports, @import, @property…). The parser captured the body
          // untouched; it rides the same document stylesheet as the
          // pseudo-element rules and survives `dssl build` verbatim.
          if ((node.css || '').trim()) raws.push({ css: node.css.trim(), file, line: node.line, order: order++ });
          break;
        }
        case 'behavior':
        case 'motion':
          if (ctx.depth) errors.push({ file, line: node.line, message: `${node.kind} "${node.name}" must be top-level` });
          break;
        default:
          break;
      }
    }
  };

  function flush(sub, ctx, line) {
    if (!sub.decls.length) return;
    if (!ctx.sel) {
      errors.push({ file, line, message: 'declarations must live inside a selector', hint: 'top-level blocks are tokens, behavior, motion, @layer, @media… — or a selector like .card' });
      return;
    }
    // v0.5.0 — the pseudo-element trap fix. A full selector like `.card::before`
    // used to compile ok and then match NOTHING: inline styles can never reach
    // pseudo-elements. Now the selector is split into element + pseudo halves
    // and the rule rides the shadow-CSS pipeline — exactly what the nested
    // form (`.card { ::before { } }`) always did. Both forms are now one thing.
    const ps = analyzePseudo(ctx.sel);
    if (ps.mode === 'all') {
      // parity with the nested path: bare `content:` becomes content: ""
      // v0.5.0 — and engine-native properties fail loud here too (see the
      // nested pseudo path): no DOM handle means no nudge, animate or stack.
      const decls = [];
      for (const d of sub.decls) {
        if (d.prop && d.prop.startsWith('@')) {
          errors.push({ file, line, message: `"${d.prop}" is engine-native and has no meaning on ::${ps.parts[0].pseudo.split(/[\s:(]/)[0]} — a pseudo-element has no DOM handle`, hint: 'put it on the element itself, not inside the pseudo rule' });
          continue;
        }
        decls.push(d.prop === 'content' && d.value === '' ? { ...d, value: '""' } : d);
      }
      for (const { el, pseudo } of ps.parts) {
        const name = pseudo.split(/[\s:(]/)[0];
        if (!PSEUDO_ELEMENTS.has(name) && !VENDOR_PSEUDO.test(name)) {
          errors.push({
            file, line,
            message: `unknown pseudo-element "::${pseudo}"`,
            hint: 'try ::before, ::after, ::selection, ::part(name), or a vendor one like ::-webkit-scrollbar-thumb',
          });
          continue;
        }
        if (name === 'slotted') {
          errors.push({
            file, line,
            message: '::slotted() only exists inside a shadow tree, and DSSL styles the light DOM',
            hint: 'style the slotted element itself with a normal selector — it IS reachable from the page',
          });
          continue;
        }
        if (/:seen\b/.test(el)) {
          errors.push({
            file, line,
            message: `the engine-native "seen" state can't combine with "::${name}" in shadow CSS`,
            hint: 'style the element itself in a seen { } block instead',
          });
          continue;
        }
        // v0.5.0 — parity with the nested path: if every declaration was
        // rejected (engine-native props, bad values), emit NOTHING rather
        // than an empty ghost rule that matches and styles zero things.
        if (!decls.length) continue;
        shadowRules.push({
          id: ruleId++, sel: el, pseudo,
          media: ctx.media, signals: ctx.signals, containers: ctx.containers,
          layer: ctx.layer, order: order++, decls, file, line,
        });
      }
      return;
    }
    if (ps.mode === 'mixed') {
      errors.push({ file, line, message: `selector list mixes pseudo-element and plain selectors: "${ctx.sel}"`, hint: 'split it into two rules — one for the pseudo-element, one for the rest' });
      return;
    }
    warnDisplayClash(sub.decls);
    rules.push({
      id: ruleId++, sel: ctx.sel, media: ctx.media, signals: ctx.signals,
      containers: ctx.containers, layer: ctx.layer, order: order++,
      decls: sub.decls, file, line, pseudo: null,
      states: scanStates(ctx.sel),
    });
  }

  /* v0.7.0 — the ordering linter. Within one rule, later wins; that is the
   * whole cascade model. But "column: gap 2" quietly expanding into
   * display: flex after an explicit "display: none" reads like a menu
   * toggle and behaves like a bug report — a real reviewer lost an evening
   * to exactly this ("their own source comments warn about this, but it
   * should be a compiler warning, not a comment"). Agreed. When a
   * shorthand's expansion clobbers an explicit display written earlier in
   * the SAME rule, say so at compile time. Cross-rule overrides are the
   * documented cascade at work, not an accident — no warning there. */
  function warnDisplayClash(decls) {
    let explicit = null;
    for (const d of decls) {
      if (d.prop !== 'display') continue;
      if (!d.via) { explicit = d; continue; }
      if (explicit && explicit.value !== d.value && warnings.length < 400) {
        warnings.push({
          file, line: d.line,
          message: `"${d.via}:" expands to display: ${d.value}, which overrides the earlier "display: ${explicit.value}" (line ${explicit.line}) in the same rule — later wins, so the earlier one is dead`,
          hint: `if the override is intended, delete the dead line; otherwise put "${d.via}:" first, or move the display you want to win AFTER it`,
        });
      }
    }
  }

  /* ---- go ---- */

  const topCtx = { sel: '', media: [], signals: [], containers: [], layer: 'components', depth: 0 };
  const rootRule = { decls: [] };
  walk(ast.children, topCtx, rootRule);
  flush(rootRule, topCtx, 0);

  // parse all motions that were referenced
  for (const r of [...rules, ...shadowRules]) {
    for (const d of r.decls) {
      if (d.prop === '@animate' && d.value && d.value.motion) {
        const m = parseMotion(d.value.motion);
        if (!m) {
          errors.push({
            file, line: d.line,
            message: `unknown motion "${d.value.motion}"`,
            hint: didYouMean(d.value.motion, Object.keys(motions)) || `define it first:  motion ${d.value.motion} { from { } to { } }  — then "animate: ${d.value.motion} 400" runs it`,
          });
          d.value.broken = true;
        } else {
          d.value.frames = m.frames;
          d.value.essential = m.essential;
        }
      }
      // v0.8.0 — the animation shorthand is CSS passthrough, so a motion
      // name that matches nothing used to be a SILENT no-op (no @keyframes
      // can exist in DSSL). Warn with the whole story; if the keyframes come
      // from raw { } or another stylesheet, the warning says it can be ignored.
      if ((d.prop === 'animation' || d.prop === 'animation-name') && typeof d.value === 'string') {
        const words = d.value.split(/[\s,]+/).filter(w => /^[A-Za-z][\w-]*$/.test(w));
        const named = words.find(w => motions[w]);
        if (words.length && !named) {
          warnings.push({
            file, line: d.line,
            message: `animation "${d.value}" references no motion defined in this sheet — it will not run`,
            hint: `motions are defined with  motion name { from { } to { } }  and run with  animate: name 400  — @keyframes does not exist in DSSL; raw { } can carry verbatim keyframes`,
          });
        }
      }
    }
  }

  // v0.8.0 — pre-parse EVERY motion (not just referenced ones) so the static
  // emitter can turn the whole motion vocabulary into real @keyframes.
  const motionFrames = {};
  for (const name of Object.keys(motions)) {
    const m = parseMotion(name);
    if (m && m.frames.length) motionFrames[name] = m;
  }

  const mediaQueries = new Set();
  for (const r of [...rules, ...shadowRules]) r.media.forEach(q => mediaQueries.add(q));

  return { rules, shadowRules, raws, motions, motionFrames, errors, warnings, mediaQueries: [...mediaQueries], tokens: Object.fromEntries(tokenMap), registryRule };
}

/** naive `&` substitution + descendant join */
function combine(parent, child) {
  if (child.includes('&')) return child.split('&').join(parent);
  return parent + ' ' + child;
}

/* v0.5.0 — where does a selector carry a pseudo-element?
 *   'none'  — plain selector, inline-style path
 *   'all'   — every comma-part has one: { parts: [{ el, pseudo }] } → shadow CSS
 *   'mixed' — some parts have one, some don't → loud error (split the list)
 * The `::` scan is string- and paren-aware so [data-x="::a"] can't false-hit. */
function analyzePseudo(sel) {
  // top-level comma split
  const parts = [];
  let depth = 0, q = null, cur = '';
  for (const ch of sel) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);

  const splits = [];
  let withPseudo = 0;
  for (const part of parts) {
    let idx = -1; depth = 0; q = null;
    for (let i = 0; i < part.length - 1; i++) {
      const ch = part[i];
      if (q) { if (ch === q && part[i - 1] !== '\\') q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; continue; }
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      else if (depth === 0 && ch === ':' && part[i + 1] === ':') { idx = i; break; }
    }
    if (idx === -1) { splits.push(null); continue; }
    withPseudo++;
    const el = part.slice(0, idx).trim();
    const pseudo = part.slice(idx + 2).trim();
    splits.push(el && pseudo ? { el, pseudo } : null);
  }
  if (withPseudo === 0) return { mode: 'none' };
  if (withPseudo !== parts.length || splits.some(s => !s)) return { mode: 'mixed', parts: splits };
  return { mode: 'all', parts: splits };
}

const STATE_SCAN = /:(hover|focus-visible|focus|active|disabled|checked|empty|target|invalid|valid|required|open|closed|read-only|read-write|placeholder-shown|first-child|last-child|only-child|seen)\b/g;
function scanStates(sel) {
  const s = new Set();
  if (!sel) return s;
  let m;
  const re = new RegExp(STATE_SCAN.source, 'g');
  while ((m = re.exec(sel))) s.add(m[1]);
  return s;
}
