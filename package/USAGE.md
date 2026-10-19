# DSSL engine quickstart

DSSL is a style language that runs in the browser. You write `.dssl` files, add two tags to your page, and the engine does the rest. No compiler, no build step, no CSS output. The engine walks your DOM live and writes styles straight onto the elements it matches, including elements that show up later.

## 1. Get the engine

Pick your platform. All three routes land the same thing: a `dssl-engine/` folder with the engine, a starter token set, an example stylesheet and this guide.

macOS or Linux (any distro, bash not required):

```sh
curl -fsSL https://dssl-sable.vercel.app/install.sh | sh
```

The installer runs with plain sh (dash, ash and busybox are fine), downloads with curl or wget, whichever you have, and unpacks with tar, which every distro and macOS ship by default. If tar is somehow missing it falls back to unzip, then to python3.

Windows (PowerShell 5.1 or newer, no admin rights):

```powershell
irm https://dssl-sable.vercel.app/install.ps1 | iex
```

No terminal at all? Download the package straight from the browser: [dssl-engine.zip](https://dssl-sable.vercel.app/dssl-engine.zip) or [dssl-engine.tar.gz](https://dssl-sable.vercel.app/dssl-engine.tar.gz), and unzip it anywhere.

To install into a specific folder, append it as an argument:

```sh
curl -fsSL https://dssl-sable.vercel.app/install.sh | sh -s -- ~/my-site
```

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
- `DSSL.errors` the last reported errors (also grouped in the console, with did-you-mean hints)
- `DSSL.version` engine version

## Scoped engines

```js
DSSL.apply(source, { scope: '#widget' })
```

gives one subtree its own engine, its own tokens and its own cascade. The playground on the live site is built exactly this way.

## Files in this package

- `dssl/` the engine. `boot.js` is the entry, `index.js` the public API.
- `styles/tokens.dssl` the starter token set (colors, fonts, radii, shadows)
- `examples/hello.dssl` a tiny starter stylesheet
- `install.sh` the macOS and Linux installer, same one the one-liner pipes
- `install.ps1` the Windows installer
- `USAGE.md` this file
- `LICENSE` MIT

Live site: https://dssl-sable.vercel.app
Source and full language docs: https://huggingface.co/EHS-Studio/dssl
