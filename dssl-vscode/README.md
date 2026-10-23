# DSSL Language Support (VS Code + VSCodium)

The DSSL style language in your editor. Not a re-implementation: this extension bundles
the **real parser and resolver** that ship in the engine, so the diagnostics you see are
the same errors the browser console prints, did-you-mean included.

Works in **VS Code** and **VSCodium** (same extension API; install the `.vsix` in either
via Extensions panel → ⋯ → *Install from VSIX*).

## Features

- **Real-compiler diagnostics.** Errors AND warnings (the v0.7 warnings channel included:
  the `display: none` clobbered by a later `column:` shows up as a squiggle, not a mystery).
- **Completions from your registry.** Every `.dssl` file in the workspace is parsed and the
  token registry folded across files (`tokens*.dssl` first). Type `color.` and get your
  palette with resolved values. Type `animate:` and get your motions first.
- **Hover docs** for the semantic vocabulary (`row:`, `bend:`, `stretch:`, `seen`, `pin`...),
  for tokens (resolved value), for workspace motions and behaviors.
- **Syntax highlighting** via a TextMate grammar for `.dssl`.

## What it does not do (yet)

- No formatter. No go-to-definition for behaviors. No LSP process (diagnostics run in the
  extension host; a language server is the next step if files get huge).

## Configuration

| Setting | Default | Meaning |
|---|---|---|
| `dssl.diagnostics.enable` | `true` | run the compiler on change and save |
| `dssl.diagnostics.debounce` | `250` | ms to wait after a keystroke |

## How it works

`lib/engine/` holds a synced copy of `public/dssl/{parser,resolver,utils}.js` from the
main repo (keep them identical with `scripts/sync-extension-engine.mjs`). On change, every
`.dssl` file in the workspace is parsed once, tokens fold in load order, and the real
`resolve()` produces the diagnostics. Completions and hovers read the folded registry.

## Links

- Site: https://dssl-sable.vercel.app
- Repo + full docs: https://huggingface.co/EHS-Studio/dssl
- Feature matrix: PARITY.md in the repo

MIT license.
