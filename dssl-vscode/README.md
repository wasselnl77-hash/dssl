# DSSL Language Support (VS Code + VSCodium)

The DSSL style language in your editor. Not a re-implementation: this extension bundles
the **real parser and resolver** that ship in the engine, so the diagnostics you see are
the same errors the browser console prints, did-you-mean included.

Works in **VS Code** and **VSCodium** (same extension API).

**VSCodium:** open the Extensions tab, search "DSSL" and install. It is published on
Open VSX: https://open-vsx.org/extension/ehs-studio/dssl-vscode

**VS Code:** the Microsoft Marketplace listing is not published yet, so install the `.vsix`
via Extensions panel → ⋯ → *Install from VSIX*.

Extension id: **`ehs-studio.dssl-vscode`**. See PUBLISHING.md for the publishing flow.

## Features

- **Real-compiler diagnostics.** Errors AND warnings (the v0.7 warnings channel included:
  the `display: none` clobbered by a later `column:` shows up as a squiggle, not a mystery).
- **Completions from your registry.** Every `.dssl` file in the workspace is parsed and the
  token registry folded across files (`tokens*.dssl` first). Type `color.` and get your
  palette with resolved values. Type `animate:` and get your motions first.
- **Hover docs** for the semantic vocabulary (`row:`, `bend:`, `stretch:`, `seen`, `pin`...),
  for tokens (resolved value), for workspace motions and behaviors.
- **Syntax highlighting** via a TextMate grammar for `.dssl`.
- **Completions for the new vocabulary.** After `texture:` you get the 30 presets, the generators and
  every setting; after `aura-glow:` only glow settings; after `aura-particle:` only particle settings
  (shapes, where particles are born, directions); after `slider:` the clauses. Hovering a preset or a
  setting explains it.
- **The designer** (*DSSL: Open the designer*, or the paint-can button on a `.dssl` tab). Three tabs:
  - *Aura*: a slider or picker for every glow and particle setting, colour stops you can add and
    remove, a live preview drawn by the real renderer, a graph of one particle's opacity and size over
    its life, and a live graph of particles alive and frame time.
  - *Texture*: all 30 presets and 10 generators as thumbnails, up to four stacked layers, every setting
    as a slider, colour pickers.
  - *Slider*: a live range input with the generated rules, and a bar editor for histogram sliders.

  Each tab writes the DSSL for you and checks it with the real compiler as you go. **Insert at cursor**
  puts it in your file (indented to match, replacing a selection if there is one). **Load from selection**
  reads an existing `aura-glow:`, `texture:` or `slider:` declaration back into the controls.
- **DSSL: Convert a CSS file to DSSL** (right-click a `.css` file). Runs the importer, writes the `.dssl`
  next to it, and lists in an output channel what it could not carry over.

## What it does not do (yet)

- No formatter. No go-to-definition for behaviors. No LSP process (diagnostics run in the
  extension host; a language server is the next step if files get huge).

## Configuration

| Setting | Default | Meaning |
|---|---|---|
| `dssl.diagnostics.enable` | `true` | run the compiler on change and save |
| `dssl.diagnostics.debounce` | `250` | ms to wait after a keystroke |

## How it works

`lib/engine/` holds a synced copy of the engine's modules (`parser`, `resolver`, `utils`, `color`, `texture`,
`aura`, `slider`, `lint`, `import`) from the main repo (keep them identical with `scripts/sync-extension-engine.mjs`). On change, every
`.dssl` file in the workspace is parsed once, tokens fold in load order, and the real
`resolve()` produces the diagnostics. Completions and hovers read the folded registry.

## Links

- Site: https://dssl-sable.vercel.app
- Repo + full docs: https://huggingface.co/EHS-Studio/dssl
- Feature matrix: PARITY.md in the repo

MIT license.
