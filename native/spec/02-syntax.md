# 2. Syntax

This chapter turns source text into a syntax tree. It needs no tokens, no document and no
vocabulary except the lists in the appendices.

## 2.1 Source text

- **SYN-1.** Source is a sequence of Unicode characters. Line numbers start at 1 and count
  `\n` characters. A parser that reads bytes MUST decode UTF-8 first. `\r` is not special: a
  `\r\n` file leaves a `\r` at the end of each line, and values are trimmed, so it does no
  harm.
- **SYN-2.** Every diagnostic carries the file name and a 1-based line number. For a
  construct that spans several lines, the line is the one where the construct started.

## 2.2 Comments

There are two comment forms: `// to the end of the line` and `/* a block */`.

- **SYN-3.** Comments are removed before anything else is parsed, in one pass over the whole
  source, left to right.
- **SYN-4.** A quote character (`"` or `'`) that is not inside a comment starts a string. A
  string ends at the next occurrence of the same quote character that is not directly
  preceded by a backslash. Comment markers inside a string are plain text.
- **SYN-5.** A line comment runs to, but not including, the next `\n`. A block comment runs
  to the first `*/`, or to the end of the source if there is none. Inside a block comment,
  every character except `\n` is replaced by a space and every `\n` is kept. Removing a
  comment therefore never changes the line number of anything after it.
- **SYN-6.** An unquoted `url(` ... `)` is one token for the comment pass. When the letters
  `url(` (any case) are not directly preceded by a letter, digit, `_` or `-`, and the first
  character after the `(` and any white space is not a quote, the text through the closing `)`
  is kept exactly as written, newlines included, so a `//` inside it (`url(https://x.com/a.png)`)
  is not a comment. A `url(` with no closing `)` is not special. A quoted `url("...")` is
  covered by SYN-4. (Before 0.16.3 the engine treated that `//` as a comment, see D-1.)

Comments are removed from everything else, including the body of `raw { }`.

```dssl
// a line comment
.card {
  padding: 16   /* a block comment, even in the middle of a line */
}
```

## 2.3 Logical lines

The comment-free source is split on `\n` into physical lines. Physical lines are joined into
logical chunks, and each chunk is processed by 2.4.

- **SYN-7.** A blank physical line is skipped. (Inside a `raw { }` capture it is kept. See
  2.7.)
- **SYN-8.** A chunk is *incomplete* when any of these holds:
  1. its parentheses or square brackets are unbalanced (more opening than closing, counting
     outside quoted strings), or
  2. after trimming trailing white space, it ends in `,`, or
  3. after trimming trailing white space, it ends in `:`.
- **SYN-9.** While the buffer is incomplete, the next non-blank physical line is trimmed and
  appended to the buffer with one space between them. When the buffer becomes complete, it is
  processed as one chunk, with the line number of the first physical line. A chunk that is
  incomplete at the end of the file is processed as it stands.

Why: this is how multi-line values, multi-line selector lists and `prop:` followed by the
value on the next line all work with no semicolons.

```dssl
.card,
.panel {
  background: linear-gradient(
    to bottom, red, blue
  )
  color:
    color.ink
}
```

## 2.4 Processing a chunk

A chunk is a string. The parser keeps a stack of open blocks. The root is always at the
bottom of the stack. It repeats the following on the chunk until nothing is left:

1. Trim the chunk. If it is empty, stop.
2. Find the first top-level `{` and the first top-level `}`. "Top-level" means not inside a
   quoted string and not inside parentheses or square brackets.
3. If there is a `}` and either there is no `{` or the `}` comes first:
   - treat the text before it as declarations (2.6) if it is not empty,
   - if the stack holds only the root, report `unexpected "}"` (SYN-10); otherwise pop one
     block,
   - continue with the text after the `}`.
4. Else if there is a `{`: the text before it is the *header text*.
   - **SYN-11.** If the header text contains a top-level `;`, everything before the last such
     `;` is treated as declarations (2.6) and the header is the text after it. This is what
     lets `.card { background: red; hover { background: blue } }` work on one line. If the
     remaining header is empty, report `block is missing a header before "{"` and skip the
     `{`.
   - If the header text is empty, report the same error and skip the `{`.
   - Otherwise classify the header (2.5), append a node to the block on top of the stack, and
     run the block-open rule (2.7). If the block is not closed on this line, push it.
5. Else the whole chunk is declarations (2.6). Stop.

A node always carries the line number of its chunk.

## 2.5 Classifying a header

The header is trimmed. The first row that matches wins.

| Header | Node kind | Notes |
|---|---|---|
| exactly `tokens` | `tokens` | 4.1 |
| exactly `pin` | `pin` | the must-win layer, 5.2 |
| exactly `raw` or `@css` | `raw` | verbatim CSS, 2.7 |
| exactly `fonts` | `fonts` | 8.7 |
| starts with `behavior ` | `behavior`, name = rest, trimmed | 6.9 |
| starts with `motion ` | `motion`, name = rest, trimmed | chapter 7 |
| starts with `@layer ` | `layer`, name = rest, trimmed | 5.2 |
| starts with `@media ` | `media`, query = rest, trimmed | 5.5 |
| starts with `@container` | `container`, query = rest after the 10 characters, trimmed | 5.6 |
| starts with `@signal ` | `signal`, expr = rest, trimmed | 5.9 |
| starts with any other `@` | `bogus` | error `unknown at-rule "<first word>"`, the whole block is skipped (2.7) |
| starts with `::` | `pseudo`, name = text after `::` up to the first space or `(` | 5.8. If the name is not a pseudo-element name and not a vendor pseudo, error `unknown pseudo-element "::name"` and the block is skipped |
| exactly one of the state words | `state`, name = the word | 5.7 |
| anything else | `selector`, sel = the header | a CSS selector list |

The state words, the pseudo-element names and the vendor-pseudo pattern are in appendix A.

- **SYN-12.** Matching of `tokens`, `pin`, `raw`, `@css` and `fonts` is on the whole trimmed
  header. `tokens foo {` is a selector. `@media(width>1)` (no space) is an unknown at-rule.
  `@container` is the one at-rule that does not require a space.

Unknown at-rules are skipped whole, so nothing inside them leaks out. For verbatim CSS the
author writes `raw { }`.

```dssl
raw {
  @supports (display: grid) {
    .box { display: grid; }
  }
}
```

## 2.6 Declarations

A declaration text is split on top-level `;`. Inside a `tokens` block (the block on top of
the stack, or any block below it is a `tokens` block), each piece is further split by the
token-pair rule (2.8). Each non-empty trimmed piece is one declaration:

- **SYN-13.** Find the first top-level `:` in the piece.
- **SYN-14.** If there is none:
  - `use <name>` where `<name>` matches `[A-Za-z][\w-]*` is a declaration with property
    `use` and value `<name>`.
  - A bare word matching `[a-z][a-z0-9-]*` (case-insensitive) is a declaration with that word
    lowercased as the property and an empty value. (This is how `truncate` and
    `visually-hidden` are written.)
  - Anything else is the error `expected ":" in "<first 40 characters>"` with the hint
    `declarations look like  prop: value`.
- **SYN-15.** The property is the text before the colon, trimmed and lowercased. The value is
  the text after it, trimmed, with its case kept. An empty property is the error
  `declaration is missing a property name`.
- **SYN-16.** A property that is all digits with an optional fraction (`9`, `2.5`) is legal
  only when some block on the stack is a `tokens` block. Elsewhere it is the error
  `"<prop>" is not a valid property name`, with a hint about token keys.
- **SYN-17.** Any other property MUST match
  `^(-{1,2}[a-z][a-z0-9.-]*|[a-z][a-z0-9-]*)$` (case-insensitive), otherwise the error
  `"<prop>" is not a valid property name` is reported and the declaration is dropped. Dotted
  names are legal only after a leading `--` (`--color.accent`).

A valid declaration becomes a `decl` node `{ prop, value, line }` appended to the block on
top of the stack.

## 2.7 Block-open rule

After a header is classified and its node is appended:

- **`raw` and `fonts`.**
  - **SYN-18.** They are legal only at the top level (the stack holds only the root).
    Otherwise report `raw { } must be top-level` (or `fonts { } ...`) with the hint
    `move it out of the enclosing block`, and skip the balanced block.
  - **SYN-19.** The body is captured verbatim into `node.css`. If the matching `}` is on the
    same line as the header, the body is the text between the braces. Otherwise capture
    continues on following physical lines: each one is appended followed by `\n`, blank lines
    included, until the braces balance. The first line contributes only the text after the
    `{`. Brace matching ignores quoted strings. Text after the closing `}` is processed as a
    new chunk. If the file ends first, report `the raw { } block was never closed with "}"`
    and the CSS captured so far is discarded.
- **`bogus`.**
  - **SYN-20.** The block is skipped: the parser finds the matching `}` (quote-aware) and
    continues after it. If there is none, report
    `the "<first 30 characters>" block was never closed with "}"` and discard the rest of the
    chunk.
- **Everything else.** The node is pushed on the stack.

At the end of the file, if more than the root is on the stack, report
`<n> block(s) were never closed with "}"`.

## 2.8 Token pairs

- **SYN-21.** Inside a `tokens` block, `pill: 999 card: 22` on one line is two declarations.
  A piece is split at a space when all of these hold: a top-level `:` (not part of `::`) has
  already been seen in the piece, the space is outside strings, parentheses and brackets, and
  the text after the space looks like `name:` where `name` matches `[A-Za-z0-9][\w.-]*`
  followed by optional spaces and a `:` that is not `::`.

## 2.9 The syntax tree

```
root        { kind: 'root', children: [...] }
node        { kind, line, children: [...], ...extra }
decl        { kind: 'decl', prop, value, line }
```

Extra fields by kind: `behavior` and `motion` have `name`, `layer` has `name`, `media` and
`container` have `query`, `signal` has `expr`, `selector` has `sel`, `state` and `pseudo`
have `name`, `raw` and `fonts` have `css`. Child order is source order. The tree is data: a
Level 1 parser is tested by comparing its tree and its errors with the reference.
