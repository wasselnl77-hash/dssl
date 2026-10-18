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

import { levenshtein, didYouMean } from './utils.js';

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */

const CSS_KEYWORDS = new Set(('inherit,initial,unset,revert,revert-layer,none,auto,currentcolor,transparent,' +
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
  'contain,cover,fill,fit-content,min-content,max-content,minmax,repeat,clamp,calc,var,url,env,attr,' +
  'auto-fill,auto-fit,subgrid,dense,stretch,' +
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
  'flex-start,flex-end,self-start,self-end,snap-block,snap-inline').split(','));

const UNITLESS_PROPS = new Set([
  'opacity', 'line-height', 'z-index', 'font-weight', 'flex-grow', 'flex-shrink',
  'flex', 'order', 'scale', 'widows', 'orphans', 'column-count', 'aspect-ratio',
  'animation-iteration-count', 'flood-opacity', 'fill-opacity', 'stop-opacity',
  'shape-image-threshold', 'animation-delay', 'transition-delay',
  // grid line placement takes integers, not lengths:  grid-column: span 2
  'grid-row', 'grid-column', 'grid-area',
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
  'bottom,box-decoration-break,box-shadow,box-sizing,break-after,break-before,break-inside,caret-color,caret-shape,clear,clip,clip-path,color,color-scheme,column-count,column-fill,column-gap,column-rule,column-rule-color,column-rule-style,column-rule-width,column-span,column-width,columns,contain,contain-intrinsic-size,container,container-name,container-type,content,cursor,caret,display,empty-cells,filter,flex,flex-basis,flex-direction,flex-flow,flex-grow,flex-shrink,flex-wrap,float,font,font-family,font-feature-settings,font-kerning,font-language-override,font-optical-sizing,font-palette,font-size,font-size-adjust,font-stretch,font-style,font-synthesis,font-variant,font-variant-caps,font-variant-east-asian,font-variant-ligatures,font-variant-numeric,font-variant-position,font-variation-settings,font-weight,forced-color-adjust,gap,grid,grid-area,grid-auto-columns,grid-auto-flow,grid-auto-rows,grid-column,grid-column-end,grid-column-gap,grid-column-start,grid-gap,grid-row,grid-row-end,grid-row-gap,grid-row-start,grid-template,grid-template-areas,grid-template-columns,grid-template-rows,' +
  'hanging-punctuation,height,hyphenate-character,hyphenate-limit-chars,hyphens,image-orientation,image-rendering,inline-size,inset,inset-block,inset-block-end,inset-block-start,inset-inline,inset-inline-end,inset-inline-start,isolation,justify-content,justify-items,justify-self,justify-tracks,left,letter-spacing,line-break,line-height,list-style,list-style-image,list-style-position,list-style-type,margin,margin-block,margin-block-end,margin-block-start,margin-bottom,margin-inline,margin-inline-end,margin-inline-start,margin-left,margin-right,margin-top,margin-trim,mask,mask-border,mask-border-mode,mask-border-outset,mask-border-repeat,mask-border-slice,mask-border-source,mask-border-width,mask-clip,mask-composite,mask-image,mask-mode,mask-origin,mask-position,mask-repeat,mask-size,max-height,max-inline-size,max-width,min-block-size,min-height,min-inline-size,min-width,mix-blend-mode,object-fit,object-position,offset,offset-anchor,offset-distance,offset-path,offset-rotate,opacity,order,outline,outline-color,outline-offset,outline-style,outline-width,overflow,overflow-anchor,overflow-clip-margin,overflow-wrap,overflow-x,overflow-y,overscroll-behavior,overscroll-behavior-block,overscroll-behavior-inline,overscroll-behavior-x,overscroll-behavior-y,padding,padding-block,padding-block-end,padding-block-start,padding-bottom,padding-inline,padding-inline-end,padding-inline-start,padding-left,padding-right,padding-top,page-break-after,page-break-before,page-break-inside,paint-order,perspective,perspective-origin,place-content,place-items,place-self,pointer-events,position,print-color-adjust,quotes,resize,right,rotate,row-gap,ruby-align,ruby-merge,scale,scroll-behavior,scroll-margin,scroll-margin-block,scroll-margin-block-end,scroll-margin-block-start,scroll-margin-bottom,scroll-margin-inline,scroll-margin-inline-end,scroll-margin-inline-start,scroll-margin-left,scroll-margin-right,scroll-margin-top,scroll-padding,scroll-padding-block,scroll-padding-bottom,scroll-padding-inline,scroll-padding-left,scroll-padding-right,scroll-padding-top,scroll-snap-align,scroll-snap-stop,scroll-snap-type,scrollbar-color,scrollbar-gutter,scrollbar-width,shape-image-threshold,shape-margin,shape-outside,tab-size,table-layout,text-align,text-align-last,text-combine-upright,text-decoration,text-decoration-color,text-decoration-line,text-decoration-skip-ink,text-decoration-style,text-decoration-thickness,text-emphasis,text-emphasis-color,text-emphasis-position,text-emphasis-style,text-indent,text-justify,text-orientation,text-overflow,text-rendering,text-shadow,text-transform,text-underline-offset,text-underline-position,top,touch-action,transform,transform-box,transform-origin,transform-style,transition,transition-behavior,transition-delay,transition-duration,transition-property,transition-timing-function,translate,unicode-bidi,user-select,vertical-align,visibility,white-space,white-space-collapse,width,will-change,word-break,word-spacing,word-wrap,writing-mode,z-index,zoom,' +
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
      out += num + (unit ? unit : (ctx.unitless ? '' : 'px'));
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

      err(`unknown value "${ident}" for property "${ctx.prop}"`,
        didYouMean(ident, [...ctx.tokenNames, ...CSS_KEYWORDS]));
      out += ident; // keep going so the rest still resolves
      continue;
    }

    // punctuation: copy (handles / , + * # etc.)
    if (c === '#') { // hex color
      let j = i + 1;
      while (j < n && /[0-9a-fA-F]/.test(raw[j])) j++;
      out += raw.slice(i, j);
      i = j;
      continue;
    }
    out += c;
    i++;
  }
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

function parseFlexWords(value, ctx, dir) {
  const out = [{ prop: 'display', value: 'flex' }, { prop: 'flex-direction', value: dir }];
  const atoms = value.split(/\s+/).filter(Boolean);
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
    if (PLACE_WORDS[a]) {
      out.push({ prop: 'align-items', value: PLACE_WORDS[a][0] });
      out.push({ prop: 'justify-content', value: PLACE_WORDS[a][1] });
      continue;
    }
    ctx.errors.push({ file: ctx.file, line: ctx.line, message: `unknown word "${a}" in ${dir}`, hint: didYouMean(a, ['gap', 'center', 'start', 'end', 'between', 'around', 'evenly', 'stretch', 'baseline', 'wrap', 'nowrap', 'reverse', 'inline']) });
  }
  return out;
}

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
    let cols;
    if (atoms.length === 1 && /^[0-9]+$/.test(atoms[0])) {
      cols = `repeat(${atoms[0]}, 1fr)`;
    } else if ((atoms[0] === 'auto-fill' || atoms[0] === 'auto-fit') && atoms[1]) {
      cols = `repeat(${atoms[0]}, minmax(${len(atoms[1], ctx)}, 1fr))`;
    } else {
      cols = atoms.map(a => len(a, ctx)).join(' ');
    }
    return [{ prop: 'display', value: 'grid' }, { prop: 'grid-template-columns', value: cols }];
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
    const parts = v.split(',').map(s => s.trim());
    const px = (s) => {
      const m = String(s).match(/^([0-9.]+)\s*(px|rem|em|%)?$/);
      if (!m) { ctx.errors.push({ file: ctx.file, line: ctx.line, message: `fluid: "${s}" is not a size` }); return '0px'; }
      return m[2] ? `${m[1]}${m[2]}` : `${m[1]}px`;
    };
    const min = px(parts[0]); const max = px(parts[1]);
    const vmin = px(parts[2] || '360'); const vmax = px(parts[3] || '1200');
    const mv = parseFloat(min), xv = parseFloat(max);
    const slope = ((xv - mv) / (parseFloat(vmax) - parseFloat(vmin))) * 100;
    return [{ prop: 'font-size', value: `clamp(${min}, calc(${min} + ${slope.toFixed(3)}vw), ${max})` }];
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
  transition(v, ctx) {
    const t = v.trim();
    if (t === 'none') return [{ prop: 'transition', value: 'none' }];
    const atoms = t.split(/\s+/);
    const dur = atoms[0];
    const easing = atoms[1] && EASINGS[atoms[1]] ? EASINGS[atoms[1]] : (atoms[1] || 'ease');
    const ms = /^\d+$/.test(dur) ? dur + 'ms' : dur;
    return [{ prop: 'transition', value: `all ${ms} ${easing}` }];
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
      ctx.errors.push({ file: ctx.file, line: ctx.line, message: `unknown animate part "${a}"`, hint: didYouMean(a, Object.keys(EASINGS).concat(['both', 'forwards', 'backwards'])) });
    }
    return [{ prop: '@animate', value: spec }];
  },
};

/* ------------------------------------------------------------------ *
 * resolveDecl — one declaration → zero or more engine decls
 * ------------------------------------------------------------------ */

function resolveDecl(prop, value, ctx) {
  const errors = ctx.errors;
  const ctx2 = { ...ctx, prop, errors };

  if (prop.startsWith('--')) return [{ prop, value: resolveValue(value, { ...ctx2, unitless: false }) }];

  const sem = SEMANTIC[prop];
  if (sem) return sem(value, ctx2);

  if (!KNOWN_PROPS.has(prop)) {
    errors.push({
      file: ctx.file, line: ctx.line,
      message: `unknown property "${prop}"`,
      hint: didYouMean(prop, [...KNOWN_PROPS, ...Object.keys(SEMANTIC)]),
    });
    return [];
  }
  return [{ prop, value: resolveValue(value, { ...ctx2, unitless: UNITLESS_PROPS.has(prop) }) }];
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
  const motions = {};
  const behaviors = {};
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
        for (const child of node.children) if (child.kind !== 'decl') prepass([child]);
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
    const ctxBase = { file, line: node.line, errors, tokens: tokenMap, tokenNames: [...tokenMap.keys()], prop: 'motion', unitless: false };
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
        for (const d of child.children) {
          if (d.kind !== 'decl') continue;
          const resolved = resolveDecl(d.prop, d.value, { ...ctxBase, line: d.line });
          for (const r of resolved) {
            if (r.prop.startsWith('@') || r.prop.startsWith('--')) continue;
            const camel = r.prop.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
            props[camel] = r.value;
          }
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
    const ctxBase = { file, line: 0, errors, tokens: tokenMap, tokenNames: tokenNames(), prop: 'token', unitless: false };
    for (const key of keys) {
      const raw = tokenMap.get(key);
      const prop = '--dssl-' + key.replace(/\./g, '-');
      decls.push({ prop, value: resolveValue(raw, { ...ctxBase, prop: key }) });
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
          const resolved = resolveDecl(node.prop, node.value, { file, line: node.line, errors, tokens: tokenMap, tokenNames: tokenNames(), prop: node.prop, unitless: false });
          for (const r of resolved) ctxRule.decls.push({ ...r, line: node.line });
          break;
        }
        case 'selector': {
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
          const childCtx = { ...ctx, sel: ctx.sel + ':' + node.name };
          const sub = { decls: [] };
          walk(node.children, childCtx, sub);
          flush(sub, childCtx, node.line);
          break;
        }
        case 'media': {
          const q = normalizeMedia(node.query, { errors, file, line: node.line }, node.line);
          const sub = { decls: [] };
          walk(node.children, { ...ctx, media: [...ctx.media, q] }, sub);
          flush(sub, ctx, node.line);
          break;
        }
        case 'container': {
          const q = normalizeMedia(node.query || '(min-width: 0)', { errors, file, line: node.line }, node.line);
          const sub = { decls: [] };
          walk(node.children, { ...ctx, containers: [...ctx.containers, q] }, sub);
          flush(sub, ctx, node.line);
          break;
        }
        case 'signal': {
          const sig = parseSignal(node.expr, { errors, file, line: node.line }, node.line);
          const sub = { decls: [] };
          walk(node.children, { ...ctx, signals: [...ctx.signals, sig] }, sub);
          flush(sub, ctx, node.line);
          break;
        }
        case 'layer':
        case 'pin': {
          const layer = node.kind === 'pin' ? 'pin' : (['tokens', 'base', 'components', 'utilities', 'pin'].includes(node.name) ? node.name : 'components');
          const sub = { decls: [] };
          walk(node.children, { ...ctx, layer }, sub);
          flush(sub, ctx, node.line);
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
            const resolved = resolveDecl(d.prop, d.value, { file, line: d.line, errors, tokens: tokenMap, tokenNames: tokenNames(), prop: d.prop, unitless: false });
            srule.decls.push(...resolved.map(r => ({ ...r, line: d.line })));
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
    rules.push({
      id: ruleId++, sel: ctx.sel, media: ctx.media, signals: ctx.signals,
      containers: ctx.containers, layer: ctx.layer, order: order++,
      decls: sub.decls, file, line, pseudo: null,
      states: scanStates(ctx.sel),
    });
  }

  /* ---- go ---- */

  const topCtx = { sel: '', media: [], signals: [], containers: [], layer: 'components', depth: 0 };
  const rootRule = { decls: [] };
  walk(ast.children, topCtx, rootRule);
  flush(rootRule, topCtx, 0);

  // parse all motions that were referenced
  for (const r of rules) {
    for (const d of r.decls) {
      if (d.prop === '@animate' && d.value && d.value.motion) {
        const m = parseMotion(d.value.motion);
        if (!m) {
          errors.push({
            file, line: d.line,
            message: `unknown motion "${d.value.motion}"`,
            hint: didYouMean(d.value.motion, Object.keys(motions)),
          });
          d.value.broken = true;
        } else {
          d.value.frames = m.frames;
          d.value.essential = m.essential;
        }
      }
    }
  }

  const mediaQueries = new Set();
  for (const r of [...rules, ...shadowRules]) r.media.forEach(q => mediaQueries.add(q));

  return { rules, shadowRules, motions, errors, mediaQueries: [...mediaQueries], tokens: Object.fromEntries(tokenMap), registryRule };
}

/** naive `&` substitution + descendant join */
function combine(parent, child) {
  if (child.includes('&')) return child.split('&').join(parent);
  return parent + ' ' + child;
}

const STATE_SCAN = /:(hover|focus-visible|focus|active|disabled|checked|empty|target|invalid|valid|required|open|closed|read-only|read-write|placeholder-shown|first-child|last-child|only-child)\b/g;
function scanStates(sel) {
  const s = new Set();
  if (!sel) return s;
  let m;
  const re = new RegExp(STATE_SCAN.source, 'g');
  while ((m = re.exec(sel))) s.add(m[1]);
  return s;
}
