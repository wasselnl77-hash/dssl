# Native DSSL

DSSL today runs as a JavaScript engine. This folder is the start of DSSL as a language that does
not need JavaScript, the way CSS does not: a written specification, and a reference
implementation in Rust that a browser team can port or link.

## What is here

| Path | What it is | State |
|---|---|---|
| `spec/` | The specification, chapters 1 to 12 and two generated appendices | Written (draft, against engine 0.16.3) |
| `data/vocabulary.json` | Every word list the language uses, in the engine's order | Generated |
| `src/`, `Cargo.toml` | The Rust crate (`dssl-native`) | A stub that builds. No parser yet. |
| `../scripts/test-native-spec.mjs` | Runs every spec example, checks the prose and the fixed bugs, checks the generated files | Passing |
| `../scripts/gen-native-vocab.mjs` | Writes the data file and the appendices from the engine | Working |

## Honest status

- The spec covers the whole language, but not to the same depth everywhere. Syntax, values,
  tokens, cascade, properties and motion are written precisely enough to implement from. The paint
  half of texture, aura, slider and overlap is marked **Pending**: it is defined by the JavaScript
  generators until it is written as prose (chapter 8).
- The Rust crate does nothing yet. Next is the parser (chapter 2), then the resolver (chapters 3
  to 7), checked against the JavaScript engine over a corpus (chapter 10). Matching elements,
  computing styles and paint are later levels (chapter 1.4).
- Nothing here is in a browser. Chapter 11 says what that would take.

## Bugs the spec found in the engine

Checking the spec against the engine found eight places where the engine did not behave as the
language promises (chapter 12). Seven are fixed in 0.16.3 and `scripts/test-v0163.mjs` keeps them
fixed. The eighth (D-6, how base tokens carry over between files) needs a two-file test in a
browser before anyone decides whether it is a bug.

## Commands

```sh
node scripts/test-native-spec.mjs          # spec examples, prose promises, fixed bugs, generated files
node scripts/gen-native-vocab.mjs          # rewrite native/data and the appendices after an engine change
node scripts/gen-native-vocab.mjs --check  # fail if they are out of date
cd native && cargo build                   # the crate (a stub today)
```
