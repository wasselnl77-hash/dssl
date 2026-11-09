# 1. Overview

## 1.1 What DSSL is

DSSL is a style language. A DSSL file is plain text. It holds tokens (named design values),
rules (selector blocks), states, conditions, motions and a few effect descriptions. A DSSL
implementation reads that text and decides how every element in a document should look.

A DSSL file describes a result. It does not say how to reach it. That is the whole idea of a
style language, and it is what makes native support possible: the author says what, the
engine decides how.

## 1.2 What CSS does (and what that means for DSSL)

CSS is not compiled. There is no step that turns a stylesheet into machine code or into some
other language that the browser then runs. A browser engine is an interpreter for a
declarative language, and it keeps the interpreted form alive for as long as the page lives.

Here is what a browser does with a stylesheet, in order:

1. **Tokenize and parse.** The engine's own code (C++ in Chrome and Safari, Rust in Firefox)
   reads the text and builds rule objects. The collection of rule objects is the CSSOM.
2. **Style resolution.** For every element, the engine finds the rules whose selectors match,
   sorts them by the cascade (origin, layer, specificity, order), picks the winning
   declaration for each property, and resolves it into a computed value. The result is one
   computed style per element.
3. **Layout.** Using the computed styles, the engine works out the size and position of every
   box.
4. **Paint.** The engine turns boxes and computed values into drawing commands: fill this
   rectangle, draw this text, blur that shadow.
5. **Composite.** Painted layers are combined on the GPU and shown.

Engines do optimise stage 2. They index rules by class, id and tag so they do not test every
selector against every element, they cache results, and some compile selectors to machine
code. None of that changes what a stylesheet means. It is an implementation detail.

Every CSS property is built-in code inside the engine. `background` is a paint routine,
`width` is a layout input, `border-radius` changes the shape that paint clips to. Nothing in
this path runs JavaScript.

### What native DSSL means

Native DSSL means a browser reads DSSL text with its own parser and feeds the result into the
same stages. Which stages matter depends on the feature:

| DSSL feature | CSS stage it joins | What the engine must add |
|---|---|---|
| Syntax, tokens, semantic properties (`row:`, `radius:`, `fluid`) | 1 and 2 | A DSSL parser. After that, they are ordinary computed values. |
| Layers, states, media, containers | 2 | Nothing new: the cascade already has these concepts. |
| `@signal` | 2 | A way for the page to set named values the cascade can read. |
| `motion`, `animate` | 2 and 4 | Mapping to the engine's existing keyframe animation. |
| `texture`, `aura`, `glass`, `slider` | 4 | New drawing code, the way `box-shadow` once was new. |
| `fold`, `bend-around`, `tilt`, `overlap` | 3 and 4 | Hooks that see box sizes, so they must run during or after layout. |

The first four rows are small. The last two rows are where real engineering is needed, and
chapter 11 says exactly what.

## 1.3 Processing model

An implementation takes DSSL source text and a document, and produces styled output. The
model has six stages. A conforming implementation does not have to run them as separate
passes, but its results MUST be the same as if it had.

```
source text
   |  1. decode, strip comments, split into logical lines
   v
syntax tree                      (chapter 2)
   |  2. classify headers, resolve values, expand semantic properties,
   |     flatten nesting, collect tokens and motions
   v
resolved document                (chapters 3 to 8, output defined in chapter 10)
   |  3. for each element: match rules, apply conditions
   v
matched rules
   |  4. sort by (layer, order), last declaration per property wins
   v
declared values                  (chapter 5)
   |  5. compute: same as CSS from here
   v
computed style + effect descriptors
   |  6. layout and paint, supplied by the host
   v
pixels
```

Stages 1 and 2 need no document. They are pure functions of the source text (and the tokens
and motions that earlier files defined, see 4.5). That is why they can be tested without a
browser, and why this repository tests them by comparing outputs.

## 1.4 Conformance levels

An implementation claims a level. Each level includes the one before it.

| Level | Name | What it must do |
|---|---|---|
| 1 | Parser | Stage 1. Produce the syntax tree and the syntax errors defined in chapter 2. |
| 2 | Resolver | Stages 1 and 2. Produce a resolved document equal to the reference output (chapter 10), including errors and warnings. |
| 3 | Style engine | Stages 1 to 5. Give every element the declared values chapter 5 defines. |
| 4 | Renderer | Stage 6 for the effects in chapter 8: texture, aura, slider, glass, tilt, deform. |

The reference crate in this repository aims at level 2 first, then 3 and 4. It is not there
yet: `native/README.md` says exactly where it stands.

## 1.5 Selectors are CSS selectors

DSSL does not define a selector language. Selectors are CSS selectors as defined by the
Selectors specification, and matching is done by the host. This is how the JavaScript engine
works too: it calls `Element.matches`.

Two things sit on top of that:

- **State words.** A block header that is exactly one of the state words (chapter 2) means
  "the parent selector plus this pseudo-class". `hover { ... }` inside `.card` means
  `.card:hover`.
- **`seen`.** `:seen` is not a CSS pseudo-class. It is defined in 5.7.

A selector goes through the resolver as text. The resolver only looks at it to find
pseudo-elements (5.8) and to scan states. It never rewrites one except to join nested
selectors (5.3).

## 1.6 Versioning

The spec has the same version as the language it describes. This draft describes DSSL 0.16.
A change that makes a previously valid source invalid, or changes what a valid source means,
is listed in the changelog of the language and raises the second number.

## 1.7 What is out of scope

- The selector language (see 1.5).
- Layout and paint for ordinary CSS properties. DSSL passes those through unchanged.
- The CSS value grammar. DSSL checks that a word is a known CSS word and gives numbers
  their units. It does not check that a value is valid for its property. The host does that
  when it computes the style.
- The editor extension, the designer and the build tools (`dssl check`, `dssl build`,
  `dssl import`). Chapter 11 says how the build lane relates to native support.
