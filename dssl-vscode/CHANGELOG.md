# Changelog

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
