---
license: mit
---

# DSSL

DSSL is a style language for the web. It replaces CSS.

Not a preprocessor that spits out stylesheets. Not a utility class graveyard. You write `.dssl` files, the page loads a small engine, and the engine walks your DOM in real time and applies every rule it matches straight onto the elements it finds. Nothing is compiled. There is no build step for styles.

Elements that show up later get styled the moment they appear. Change a rule and the page updates on the next pass. The language is the runtime.

## What it looks like

Shared behaviors with actual names:

```dssl
behavior focus-ring {
  focus-visible {
    outline: 2 solid color.accent
    outline-offset: 2
    radius: 4
  }
}

a      { use focus-ring }
button { use focus-ring }
input  { use focus-ring }
```

Layout without memorizing thirty flexbox properties:

```dssl
.nav {
  position: sticky
  top: 0
  row: gap space.4 between
  height: 64
  background: color.paper/92
  backdrop-filter: blur(10)
  transition: 200
}
```

Design tokens are built in (`color.paper`, `space.4`, and the `/92` at the end is alpha). Numbers are unitless, there are no semicolons, and `@media (width <= 940)` does what you hope it does.

## The site styles itself

This repo eats its own cooking. Everything you see on the website is styled by the engine in `public/dssl/` running the files in `public/styles/`. If the engine breaks, the site shows up naked. That is a feature.

## What works today (v0.4.1)

- flexbox layout
- behaviors and `use`
- design tokens, scoped per file
- seen states and stagger delays
- per-property transitions
- visually-hidden
- pseudo elements (the one exception: they compile to shadow CSS, because the DOM gives you no other way to reach them)

## Try it

The site is live. No setup, no build, nothing to install: https://dssl-sable.vercel.app

Clone this repo if you want to read the engine or run it yourself. Everything runs in the browser.

## Repo layout

- `public/dssl/` the engine: parser, resolver, boot
- `public/styles/` the styles that drive the site
- `src/` the Next.js site
- `scripts/` smoke tests for the engine

## Status

v0.4.1, experimental, moving fast. The language grows whenever the site needs something it cannot express yet, so the site doubles as the test suite.

## License

MIT
