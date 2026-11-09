# 4. Tokens

A token is a named design value: a color, a space, a radius, a shadow, a font stack. Tokens
become CSS custom properties, so they follow the page's normal inheritance and can be
re-declared in any subtree.

## 4.1 The tokens block

```dssl
tokens {
  color {
    ink: #16161d
    accent: oklch(62% 0.19 35)
  }
  space { 1: 4  2: 8  9: 96 }
  radius { md: 14 }
  shadow { md: 0 2 4 color.ink/10, 0 4 12 color.ink/8 }
}
```

- **TOK-1.** A `tokens` block may appear at the top level, or inside `@media`, `@container`,
  `@signal` and `@layer` blocks that themselves have no selector around them. Inside a
  selector it is the error `tokens must be top-level or inside @media / @signal`, and the
  block is ignored.
- **TOK-2.** Inside a `tokens` block, a declaration `name: value` defines the token whose key
  is the path to that block plus the name. A nested block whose header is a plain word
  (`color { ... }`) adds that word to the path. A nested `tokens` block does the same with
  the header text `tokens`. Any other nested block kind is the error
  `unexpected "<kind>" inside tokens`.
- **TOK-3.** Numeric names (`1`, `9`) are legal keys (SYN-16). `space { 9: 96 }` defines
  `space.9`.
- **TOK-4.** The value of a token is kept as written. It is resolved (chapter 3) when the
  token is emitted (4.3), with `prop` set to the token key and `unitless` false.

Why: tokens resolve late, so a token may refer to another token, to alpha, or to a function,
and each reference is checked in the place it is used.

## 4.2 Keys and variable names

- **TOK-5.** A token key is a dotted path such as `color.ink` or `shadow.md`.
- **TOK-6.** The variable name for a key is `--dssl-` followed by the key with each `.`
  replaced by `-`. So `color.ink` is `--dssl-color-ink` and `space.9` is `--dssl-space-9`.
  Two keys that differ only by `.` against `-` (`a.b-c` and `a.b.c`) therefore share a
  variable. Authors SHOULD avoid that.

## 4.3 Emission

A token that is defined becomes a declaration on `:root` in the layer `tokens`.

- **TOK-7.** Before reading any rule, the resolver collects the tokens of every `tokens` block
  in the file, however deeply nested in conditions, into one map. When the same key is
  defined twice, the later definition in source order replaces the earlier one in that map.
  The map is also seeded with the tokens the host passes in (4.5), starting from the
  built-in defaults.
- **TOK-8.** Each `tokens` block, when it is reached during the walk (5.4), emits one rule
  with selector `:root`, layer `tokens`, the media, containers and signals of the context it
  is in, and one declaration per key it defines itself, in the order the keys were written.
  The value of each declaration is the value that block wrote, not the final value in the
  map.
- **TOK-9.** Before the walk, the resolver also builds the *registry rule*: selector `:root`,
  layer `tokens`, no conditions, one declaration for every key in the map in map order. It
  takes the first order number (0). It is returned beside the rules and is not part of the
  rules list. Hosts install it first, so every token has a value even before its block is
  reached. Because it is built from the map, it carries the last definition of each key.
- **TOK-10.** An error in a token value is reported at the line where the token was written,
  and only by the file that defines it. A token that comes from the host (4.5) is not checked
  again.

```dssl
tokens { color { bg: white } }
@media dark { tokens { color { bg: black } } }
.a { background: color.bg }
```

This yields one `:root` rule for `white` and one for `black` under the dark condition. Both
are in the layer `tokens`, and the second has a later order, so it wins when dark applies.

## 4.4 Looking up a token

- **TOK-11.** An identifier in a value is a token reference when its text is exactly a key in
  the map.
- **TOK-12.** Only an exact key matches. `color.ink2.bogus` is not `color.ink2`: it is not a
  token, so it falls through to the keyword rule and is the error `unknown value`. (Before
  0.16.3 the engine shortened the path from the right and used the first prefix that was a
  key, which hid typos, see D-2.)

## 4.5 Tokens across files

A page usually loads several DSSL files. The host keeps a *registry* of token values and a
registry of motions (7.3) and passes both into the resolver for each new file, in load order.
The registry starts as the built-in defaults.

- **TOK-13.** For a file, the starting map is the registry. The resolver adds the file's own
  tokens on top. After the file, the host updates the registry from the file's final map.
- **TOK-14.** The built-in defaults are in appendix A. They are defined with ordinary token
  syntax and can be replaced by any `tokens` block.

Why: this is how `tokens.dssl` can define a palette that every later file uses, and how a
later file can override one token from an earlier one.

## 4.6 Scoped tokens

A custom property with a dotted name re-declares a token for the element it is on.

```dssl
.danger { --color.accent: color.err }
```

- **TOK-15.** A declaration whose property starts with `--` and contains a `.` is written
  with the property `--dssl-` followed by the rest of the name with dots replaced by dashes
  (`--color.accent` becomes `--dssl-color-accent`). The value is resolved with
  `bareIdents: true`. Custom properties inherit, so every `var()` in the subtree sees the new
  value.
- **TOK-16.** A custom property without a dot (`--brand`) is passed through with only its
  value resolved.

## 4.7 Token shortcuts

Three semantic properties take a token name as a word (chapter 6): `shadow:`, `radius:`.

- **TOK-17.** `shadow: sm|md|lg|xl` is `box-shadow: var(--dssl-shadow-<word>)` whether or not
  that token exists. `shadow: none` is `box-shadow: none`. A word that matches
  `[A-Za-z][\w-]*` and for which `shadow.<word>` is a key in the map becomes
  `box-shadow: var(--dssl-shadow-<word>)`. Anything else is resolved as an ordinary value.
- **TOK-18.** `radius:` takes one to four words. Each of `sm`, `md`, `lg`, `full`, `xl` becomes
  `var(--dssl-radius-<word>)` whether or not it exists. Any other word that matches
  `[A-Za-z][\w-]*` and for which `radius.<word>` is a key becomes the same kind of reference.
  Everything else is resolved as an ordinary value. The words are joined by spaces into
  `border-radius`. When one of the five words is used and `radius.<word>` is not a key, the
  reference is still written, and the warning is
  `radius "<word>" is not defined, so it will not apply` with the hint
  `add it with  tokens { radius { <word>: 32 } }`. By default only `sm`, `md`, `lg` and `full`
  exist, so `xl` warns until the author defines it (D-4).
