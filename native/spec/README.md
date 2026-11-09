# DSSL specification

Status: working draft, written against the reference engine 0.16.3 (the bugs of chapter 12 were found on 0.16.2).
This is not a standard. It is the document a browser team (or anyone writing a second
implementation) would read to build DSSL without reading the JavaScript engine.

## Why this exists

DSSL today is a JavaScript engine that writes inline styles. That is one way to run the
language. It is not the language. CSS is a language that browsers implement natively, and
this spec says what it would take to do the same for DSSL: what the text means, what every
stage produces, and what a correct implementation has to do.

The Rust crate next to this folder (`native/`) is the reference implementation of this spec
that does not use JavaScript. It is checked against the JavaScript engine by running both on
the same inputs and comparing the results.

## Chapters

| # | Chapter | What it fixes |
|---|---|---|
| 1 | [Overview](01-overview.md) | The processing model, conformance levels, what CSS actually does |
| 2 | [Syntax](02-syntax.md) | Text to syntax tree: comments, blocks, declarations, raw |
| 3 | [Values](03-values.md) | Bare numbers, identifiers, functions, colors, alpha |
| 4 | [Tokens](04-tokens.md) | Design tokens and how they become custom properties |
| 5 | [Cascade](05-cascade.md) | Layers, order, states, media, containers, signals |
| 6 | [Properties](06-properties.md) | The semantic properties and how each one expands |
| 7 | [Motion](07-motion.md) | `motion`, `animate`, `seen`, `stagger` |
| 8 | [Effects](08-effects.md) | Texture, aura, slider, glass, tilt, deform, fonts |
| 9 | [Diagnostics](09-diagnostics.md) | Errors, warnings, did-you-mean, lint |
| 10 | [Resolved document](10-resolved-document.md) | The exact output a resolver produces, and how conformance is tested |
| 11 | [Browser integration](11-browser-integration.md) | How a browser would host this, stage by stage |
| 12 | [Known divergences](12-known-divergences.md) | Places where the JavaScript engine does not yet match this spec |

## Conventions

- MUST, MUST NOT, SHOULD and MAY are used the way RFC 2119 uses them.
- Every testable rule has an id such as `SYN-4` or `CAS-7`. Conformance tests name the ids
  they cover.
- Prose in the margin of a rule that starts with "Why:" is informative.
- Examples are executed. Every fenced `dssl` block is compiled by
  `scripts/test-native-spec.mjs` against the JavaScript engine, and must produce no errors.
  A block fenced as `dssl error` must produce at least one.
- The tables in the appendices are generated from the engine's own vocabulary modules by
  `scripts/gen-native-vocab.mjs`. They are not edited by hand, so they cannot drift.

## Normative and informative

Chapters 2 to 10 are normative. Chapters 1 and 11 are informative apart from the
conformance levels defined in 1.4. Chapter 12 is a list of bugs, and is informative.

Where this spec and the JavaScript engine disagree, chapter 12 says which one is wrong and
what the fix is. Until the engine is fixed, conformance tests for those cases are excluded
from the comparison and listed by id.
