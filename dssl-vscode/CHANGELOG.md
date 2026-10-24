# Changelog

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
