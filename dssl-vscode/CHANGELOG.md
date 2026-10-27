# Changelog

## 0.16.0

- Bundled engine updated to 0.16.0. The editor now accepts the whole of CSS (`env()`, `tabular-nums`, `touch-action`, vendor properties)
  and still flags typos. New in the language, with hovers and completions: `yield:`, aura `around`, `inner`, `rays`, `ripple`, `nohalo`,
  particle `palette`, `spin`, `wind`, `orbit`, `from outline`, nine new particle shapes, 33 new texture presets and nine generators.
- A token pair on one line (`pill: 999 card: 22`) is two tokens, and a token error shows on the token's own line.

## 0.15.0

- Bundled engine updated to 0.15.0 (the second game review). In the editor: `outline-shape`, `animate:` lists
  (`animate: a 300, b 500`), `rotate: 5` (bare number = degrees), a state inside a pseudo-element block
  (`::after { hover { } }`), the aura word `z N`, and a clear error for a CSS-style `font:` shorthand. Hovers document them.
- The editor still checks one file at a time. `dssl check index.html` also finds rules that a later rule always beats.

## 0.14.0

- Bundled engine updated to 0.14.0 (made for games). Editor: `@signal name in (a, b)`, `not in (...)` and `!=` are understood and
  documented on hover; `animate:` now documents `delay`, `jitter`, `iterations` and `essential`; `text-stroke` and layered
  `gradient:` (`+`, `tile`, `offset`, `no-repeat`) have hover docs; `animate:` inside `::before`/`::after` is no longer an error.
  (The editor still checks one file at a time, so a motion defined in another file shows as unknown there; `dssl check index.html` checks them together.)

## 0.13.0

- Bundled engine updated to 0.13.0. In the editor: a new warning for a rule that aligns its children (`place-items`, `justify-content`...)
  without saying `display`, because a `dssl build` cannot add the box the engine adds at run time.
- The engine fixes a later `border-style` or `border-width` and margin or padding longhands now following the cascade (no editor
  change, but the built CSS and the live page now agree).

## 0.12.1

Found by running the extension inside a real VSCodium and clicking through it (`node scripts/test-editor-ui.mjs`):

- **Completions in a one-line rule.** `.t { texture: |` offered selectors and pseudo-elements instead of texture
  words, because only a declaration that started its line was recognised. A declaration after `{` or `;` now
  completes too.
- **The right words come first.** After `texture:` the presets and settings now sort above the long list of generic
  CSS keywords, so `oak` is not buried under a hundred vendor keywords.
- **The designer knows wood.** The Texture tab now has `figure`, `warp`, `pores`, `knots` and `planks` (shown only for
  the rings generator and the wood species) and a `mirror tile` choice for `symmetrical`. Before, these were written
  and read back wrongly, and could not be tuned at all.

## 0.12.0

- Bundled engine updated to 0.12.0: `texture: ... symmetrical`, a `fonts { }` block, richer `gradient:` sentences
  (repeating, colour spaces, midpoints, hard bands, mesh, layers), `DSSL.inspect()`, `DSSL.watch()` and `dssl dev`.
- `fonts` appears in block completions with hover docs, and the `gradient` hover lists the new forms.

## 0.11.0

- Bundled engine updated to 0.11.0: ten wood species and the `rings` texture generator (figure, warp,
  pores, knots, planks), textures baked into the CSS by `dssl build`, CSS counters, and a contrast lint
  that no longer warns about translucent backgrounds it cannot judge. Completions and hover docs know the
  new settings.

## 0.10.0

- Bundled engine updated to 0.10.0: new `glass` and `tilt` properties, with completions and hover
  docs for both, and alpha on named colours (`white/12`) now compiles to a real colour instead of
  `white/12px`.

## 0.9.1

- README: a note at the top explaining the publisher name (`ehs-studio` is the same person as
  [wasselnl77-hash on GitHub](https://github.com/wasselnl77-hash)), since the install
  warning can look alarming.
- This changelog.
- Docs now say the extension is on Open VSX and can be installed from VSCodium's Extensions tab.

## 0.9.0

- **Designers.** Three live panels that read and write DSSL: aura, texture and slider.
  Open them from the command palette (*DSSL: Open the designer*, *DSSL: Design an aura*,
  *DSSL: Design a texture*, *DSSL: Design a range slider*). Previews are drawn by the same
  renderer the engine uses, and the generated code is checked by the real compiler as you edit.
  *Insert at cursor* and *Copy* put it in your file; *Load from selection* reads an existing
  declaration back into the controls.
- **Convert CSS.** *DSSL: Convert a CSS file to DSSL* turns a CSS file or selection into DSSL.
- **New language features understood.** Completions and hover docs for `texture`, `aura`,
  `aura-glow`, `aura-particle(s)`, `glow-particle(s)`, `aura-glow-particle(s)` and `slider`,
  scoped to the property you are typing in.
- **Lint warnings.** Low text contrast, removed focus outlines with no replacement, and tap
  targets under 24px show up as warnings.
- Bundled engine updated to 0.9.0.

## 0.8.x

- Bundled engine updated: one cascade across all stylesheets, `fluid` on longhand
  properties, and the compiler fixes shipped with those releases.

## 0.7.1

- First release: diagnostics from the real DSSL parser and resolver (did-you-mean included),
  completions from the workspace token registry, hover docs for the semantic vocabulary,
  syntax highlighting.
