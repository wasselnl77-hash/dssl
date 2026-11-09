# 3. Values

This chapter fixes how a value string such as `0 2 4 color.ink/10` becomes CSS. The algorithm
is applied to the value of an ordinary declaration, to token values, and to the pieces that
semantic properties pass on (chapter 6).

## 3.1 The resolution context

Every value is resolved with a context:

| Field | Meaning |
|---|---|
| `prop` | the property name the value belongs to (a token key for token values) |
| `unitless` | when true, a bare number stays a bare number. When false, it gets a unit. |
| `bareIdents` | when true, an unknown identifier is allowed through (font names, counter names) |
| `tokens` | the current token map (chapter 4) |

- **VAL-1.** For an ordinary property, `unitless` is true exactly when the property is in the
  unitless list (appendix A). A semantic property chooses its own context for each piece it
  passes on (chapter 6).
- **VAL-2.** `bareIdents` is true for `font-family`, for any property whose name starts with
  `counter-`, for custom properties (`--name`), and for tokens whose key starts with `font`.
  It is also switched on inside `counter()`, `counters()`, `attr()`, `env()`, `format()`,
  `local()`, `paint()` and `element()`.

## 3.2 The scan

The value is scanned left to right. At each position, the first of these rules that applies
is used.

1. **White space** is copied as it is.
2. **Strings.** `"` or `'` starts a string that runs to the next occurrence of the same
   quote. A backslash makes the character after it part of the string, so `"a\"b"` is one
   string. It is copied verbatim. The same applies to strings inside function arguments and in
   layer lists. (Before 0.16.3 the backslash was ignored here, see D-5.)
3. **Numbers.** A number starts at a digit, at `.` followed by a digit, or at `-` or `+`
   followed by a digit or `.`. It continues over digits and `.`. If letters or `%` follow,
   they are the unit and are lowercased. The output is the number text plus:
   - the unit, if there is one,
   - otherwise nothing, if `unitless` is true,
   - otherwise `ms`, if `prop` is a time property (appendix A),
   - otherwise `px`.
4. **Identifiers.** An identifier matches
   `^-?(?:[A-Za-z_]|--[A-Za-z_])[A-Za-z0-9_.\\-]*`. Note that `.` and `-` are part of an
   identifier, so `color.ink` and `ease-out` are single identifiers, and so is `a-1`.
   What happens next, in order:
   1. A name starting `--` is copied as it is (a custom property).
   2. If the next character is `(`, it is a **function call** (3.3).
   3. If the identifier is a **token** (3.4), it is replaced by a variable reference.
   4. If it is a known **keyword** (3.5), it is copied as it is.
   5. If `bareIdents` is true and the identifier is plain letters, digits, `_` and `-`
      starting with a letter, it is copied as it is.
   6. Otherwise it is an error (3.6). The identifier is copied and scanning continues.
5. **Hex colors.** `#` followed by hex digits is copied. An alpha suffix follows the rules in
   3.4.
6. **Anything else** (`/`, `,`, `+`, `*`, `%`, `(`, `)`, `->`) is copied one character at a
   time.

- **VAL-3.** Rule 3 means `0` becomes `0px`, `margin: 0 auto` becomes `0px auto`, and
  `opacity: 0.5` stays `0.5` because `opacity` is unitless.
- **VAL-4.** `--name` custom property values are resolved like any other, with
  `unitless: false` and `bareIdents: true`.

```dssl
.a {
  padding: 0
  margin: 0 auto
  opacity: 0.5
  line-height: 1.5
  transition-delay: 200
}
```

The five lines resolve to `0px`, `0px auto`, `0.5`, `1.5` and `200ms`.

## 3.3 Function calls

The text from the `(` to its matching `)` is the argument text. Matching counts nested
parentheses and skips quoted strings.

- **VAL-5.** `url( )` is atomic. The output is `url(` + the argument text trimmed + `)`. Nothing
  inside is looked at.
- **VAL-6.** `repeat(N, tracks)`, when the first argument is a number, keeps `N` as it is
  (never a length) and resolves the rest with the same context. When the first argument is
  not a plain number (`auto-fill`, `auto-fit`), the call falls through to VAL-7.
- **VAL-7.** Any other call resolves its argument text recursively. The inner context is:
  - `unitless: true` for the functions in the *unitless functions* list (colors, filters
    that take numbers, `scale*`, `steps`, `cubic-bezier`, `linear`, `radial`, `conic`),
  - `unitless: false` for the *length functions* list (`calc`, `min`, `max`, `clamp`, the
    other math functions, `blur`, `drop-shadow`),
  - the outer context's `unitless` for any other function.
  Function names are matched lowercase. The output keeps the written name.

Both lists are in appendix A.

```dssl
.a {
  width: calc(100% - 24)
  background: oklch(62% 0.19 35)
  grid-template-columns: repeat(4, 1fr)
  transform: scale(1.2)
}
```

`calc(100% - 24)` becomes `calc(100% - 24px)`. The `oklch` numbers and the `scale` factor
stay bare. `repeat(4, 1fr)` keeps its `4`.

## 3.4 Tokens and alpha

A reference to a token is the token's key written as an identifier (`color.ink`, `space.4`).
How a key is found is in 4.4. A reference becomes `var(--dssl-<key>)`, where every `.` in
the key is replaced by `-`.

- **VAL-8.** *Alpha modifier.* A token reference, a named color, `currentcolor` or a hex
  color may be followed by `/` and a number, with optional white space and an optional `%`:
  `color.ink/20`, `white/12`, `#ff0000/50`. The whole thing becomes
  `color-mix(in oklab, <color> N%, transparent)`, where `N` is the number text as written.
  The number is always a percentage, with or without the `%` sign.
- **VAL-9.** A named color is a keyword for which the color table (appendix A) has an entry.

```dssl
tokens { color { x: #123456 } }
.a {
  color: color.x/50
  background: #ff0000/50
  border-color: white/12
}
```

These three become `color-mix(in oklab, var(--dssl-color-x) 50%, transparent)`,
`color-mix(in oklab, #ff0000 50%, transparent)` and
`color-mix(in oklab, white 12%, transparent)`.

## 3.5 Keywords

The keyword set (appendix A) holds every word DSSL accepts as a bare CSS value: color names,
display values, easing names, units of measure words and everything the CSS property
definitions mention. It is generated from the engine's vocabulary module.

- **VAL-10.** A keyword matches if the identifier is in the set, or its lowercase form is.

Why: DSSL is loud about typos. An identifier that is not a token, not a keyword and not
allowed by `bareIdents` is a mistake, and 3.6 says so.

## 3.6 Unknown identifiers

- **VAL-11.** An unknown identifier is the error `unknown value "<id>" for property "<prop>"`.
  The hint is the best did-you-mean (9.3) over the token keys followed by the keywords, or no
  hint if nothing is close. The identifier is copied to the output, so the value still
  resolves as far as it can.

```dssl error
.a { color: colour }
```

## 3.7 Fluid sizes

`fluid` is sugar for a `clamp()` that moves linearly between two viewport widths. It has two
spellings.

- `font-size: fluid 16 24`: the value is `fluid` followed by arguments. It is allowed on the
  properties in the *fluid properties* list (appendix A).
- `fluid: 16, 24`: the semantic property `fluid` (6.4) writes `font-size`.

The arguments are, in order: the first size, the second size, the lower viewport width
(default `360`), the upper viewport width (default `1200`). Arguments are separated by
white space or commas.

- **VAL-12.** A size is a number with an optional unit of `px`, `rem` or `em`. A bare number
  is `px`. A `%` is an error (`cannot be a percentage, use px, rem or em`). The two sizes
  MUST have the same unit (`mixes units, give both sizes the same unit`). The viewport
  widths are in `px` and the upper MUST be larger than the lower.
- **VAL-13.** Let `a`, `b` be the sizes, `v0`, `v1` the viewport widths, `f` = 1 for `px`
  and 16 for `rem` and `em`. Then
  `slope = ((b - a) * f) / (v1 - v0)`, `vw = slope * 100` and
  `intercept = a - (slope * v0) / f`. The output is
  `clamp(<min><unit>, calc(<intercept><unit> + <vw>vw), <max><unit>)`, where `min` and `max`
  are the smaller and larger of `a` and `b`, and every number is written with at most three
  decimal places and no trailing zeros.
- **VAL-14.** On an error the property gets the value `0px` and the error is reported.

```dssl
h1 { font-size: fluid 28 44 }
.stack { gap: fluid 8 16 }
.hero { font-size: fluid 16 24 400 800 }
```

For `fluid 16 24` the output is `clamp(16px, calc(12.571px + 0.952vw), 24px)`.

## 3.8 Important

- **VAL-15.** The text `!important` (any case, any space after `!`) outside a quoted string
  is not valid DSSL. The declaration is dropped and the error
  `!important does not exist in DSSL - "<prop>: <value>" was NOT applied` is reported, with
  the hint to use `pin { }`.

```dssl error
.a { color: red !important }
```
