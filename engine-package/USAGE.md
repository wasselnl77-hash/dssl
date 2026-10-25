# DSSL engine: quickstart

DSSL is a style language that runs in the browser. You write `.dssl` files, add two tags to your page, and the engine does the rest. No compiler, no build step, no CSS output. The engine walks your DOM live and writes styles straight onto the elements it matches, including elements that show up later.

## 1. Get the engine

Copy the `dssl/` folder from this package into your project, or grab it fresh from a terminal:

```sh
curl -fsSL https://dssl-sable.vercel.app/install.sh | sh
```

That drops a `dssl-engine/` folder next to you with everything you need.

## 2. Wire it up

```html
<!doctype html>
<html data-dssl-reset>
<head>
  <script type="module" src="/dssl/boot.js"></script>
  <link rel="stylesheet/dssl" href="/styles/tokens.dssl">
  <link rel="stylesheet/dssl" href="/examples/hello.dssl">
</head>
<body>
  <h1>Styled by DSSL</h1>
</body>
</html>
```

What those lines do:

- `data-dssl-reset` (optional) turns on the small built-in reset.
- `boot.js` is the whole install. It boots the engine on page load.
- Every `<link rel="stylesheet/dssl">` is fetched and applied automatically, in the order you list them. Tokens first, then your styles.
- Inline styles work too: `<style type="text/dssl"> ... </style>`.
- When booting is done the page fires a `dssl-ready` event.

## 3. Write some DSSL

`examples/hello.dssl` in this package:

```dssl
body {
  background: #f5f0e4
  color: #26201a
  padding: 40
}

.card {
  background: #fdfaf2
  border: 1 solid #ddd2bc
  radius: 6
  padding: 24

  hover {
    box-shadow: 0 6 18 #26201a/16
  }
}
```

Bare numbers are pixels. States like `hover` are nested blocks. The engine keeps them working forever, even for elements added to the page later.

## The JavaScript API

`window.DSSL` is available after boot:

- `DSSL.load(urls)` fetch and apply one or more `.dssl` files (fetched in parallel, applied in order)
- `DSSL.apply(source, { name, scope })` apply a source string
- `DSSL.compile(source)` parse and resolve without touching the DOM, returns `ok`, `errors` and stats
- `DSSL.signal(name, value)` drive styles from JS with `@signal` conditions in your `.dssl`
- `DSSL.refresh()` force a full recompute
- `DSSL.replay(selector)` replay entrance motions on matching elements
- `DSSL.errors()` a function: the last reported errors (also grouped in the console, with did-you-mean hints)
- `DSSL.version` the engine version, a string (not a function)
- `DSSL.toCSS(source | [sources], opts)` compile to plain CSS (the `dssl build` lane): `{ css, map, report }`
- `DSSL.getSignal(name)` read a signal back
- `DSSL.refresh(el)` / `DSSL.freeze(el)` / `DSSL.unfreeze(el)` one subtree: restyle it, or style it once and leave it alone
- `DSSL.explain(el)`, `await DSSL.inspect()`, `await DSSL.watch()`, `await DSSL.lint(root)` find out why a style is what it is, hot reload, check the live page
- `DSSL.play(el, 'motion', opts)` run a motion once from JS (a promise), `DSSL.motion('full')` ignore reduced motion, `DSSL.auraZ(n)` aura canvas z-index

## Scoped engines

```js
DSSL.apply(source, { scope: '#widget' })
```

gives one subtree its own engine, its own tokens and its own cascade. The playground on the live site is built exactly this way.

## The exit lane (v0.8.0)

The engine is a JS runtime. When a page needs to work without JavaScript, sit
behind a strict CSP, or paint before any script, build the static subset to a
real stylesheet:

```sh
node cli/dssl.mjs check styles.dssl --strict    # CI: the real compiler, exit 1 on errors, --json for machines
node cli/dssl.mjs build styles.dssl -o styles.css
```

`build` emits real CSS: tokens become custom properties, states become
`:hover`, layers become `@layer`, motions become `@keyframes`, `pin` becomes
`!important`, `raw { }` passes through verbatim, and `seen` applies its final
state (the graceful no-JS look). The report counts what stays runtime-only
(`@signal` rules, `animate:`), so the boundary is explicit.

In the browser the same output is `DSSL.toCSS(source)` → `{ css, report }`.

Two more tools worth knowing: `raw { }` (alias `@css { }`) drops
verbatim CSS like `@font-face` into the page stylesheet (it is real CSS, so
semicolons are required inside it), and `font-size: fluid 16 24` gives you a
size that grows smoothly from 16px on a 360px wide window to 24px on a 1200px
wide one. `dssl build --strict` makes warnings fail the build, for CI.

## Texture, aura and sliders (v0.9.0)

```dssl
.card { background: #c9a66b; texture: wood }              // 30 presets, or build your own

behavior fire {                                            // aura has no presets: you write them
  aura-glow: #ff7a00 36 pulse 900 flicker 0.35
  aura-particle: #ffe27a -> #ff8a1f -> rgba(255,40,0,0) count 70 size 8 18 life 650 1100 speed 40 120 dir up from top gravity -40 shape flame glowing behind
}
.torch { use fire }

input[type=range] { slider: track 6 #445566 radius full, fill #ff7a00, thumb 22 #fff }
```

All three need the engine (the build leaves them in the runtime and says so). Convert an existing
stylesheet with `node cli/dssl.mjs import styles.css -o styles.dssl`. The full vocabulary, with every
setting, is in GUIDE.md in the Hugging Face repo, and the VS Code extension has a designer with sliders
and live previews.

## Files in this package

- `dssl/` the engine. `boot.js` is the entry, `index.js` the public API, `static.js` the build-target compiler, and `color`, `texture`, `aura`, `slider`, `lint`, `import` the 0.9.0 modules. Keep the whole folder together.
- `cli/dssl.mjs` the CLI (`check`, `build` and `import`), no dependencies, Node 18+
- `styles/tokens.dssl` the starter token set (colors, fonts, radii, shadows)
- `examples/hello.dssl` a tiny starter stylesheet
- `USAGE.md` this file
- `LICENSE` MIT

Live site: https://dssl-sable.vercel.app
Source and full language docs: https://huggingface.co/EHS-Studio/dssl
