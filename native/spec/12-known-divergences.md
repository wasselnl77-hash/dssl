# 12. Known divergences

Writing this spec from the reference engine and checking it against the engine turned up places
where the engine did not do what a careful reader of the language would expect. They were found
on 0.16.2. Seven are fixed in 0.16.3 and one is still open. This chapter keeps the record, so
that a second implementation knows which behavior is old and which is current.

| Id | Where | Summary | Status |
|---|---|---|---|
| D-1 | 2.2 | `//` inside an unquoted `url(...)` started a comment | fixed in 0.16.3 (SYN-6) |
| D-2 | 4.4 | A token path with a typo at the end resolved to its parent | fixed in 0.16.3 (TOK-12) |
| D-3 | 5.2 | An unknown `@layer` name was silently `components` | fixed in 0.16.3, now warns (CAS-2) |
| D-4 | 4.7 | `radius: xl` pointed at a token that does not exist | fixed in 0.16.3, now warns (TOK-18) |
| D-5 | 3.2 | A backslash did not escape a quote inside a value | fixed in 0.16.3 (VAL rule 2) |
| D-6 | 4.3 | The registry rule carries the last definition of a token | open, needs a browser test |
| D-7 | 5.3 | Nesting under a selector list joined the wrong way | fixed in 0.16.3 (CAS-7, CAS-24, CAS-30) |
| D-8 | 5.3 | A nested `li` got a "did you mean link" warning | fixed in 0.16.3 (CAS-8) |

A conformance corpus built from 0.16.3 or later has no exclusions for D-1 to D-5, D-7 and D-8.
Inputs produced by an older engine do.

## D-1: `//` in an unquoted url (fixed)

```dssl
.a { background: url(http://x.com/a.png) }
```

The comment stripper did not know about `url( )`, so `//x.com/a.png) }` was removed as a line
comment. The value became `url(http` and the file reported one unclosed block. Inside `raw { }`
the closing brace of the `raw` block was eaten too. Now an unquoted `url(` ... `)` is copied as
written, and a comment right after it still works.

## D-2: token path prefix match (fixed)

```dssl error
tokens { color { ink2: #111 } }
.a { color: color.ink2.bogus }
```

This used to resolve to `var(--dssl-color-ink2)` with no error, because the lookup shortened the
dotted path from the right and used the first prefix that was a token. A typo at the end of a
path is now the loud `unknown value` error, with a did-you-mean.

## D-3 and D-4: silent fallbacks (fixed, now warnings)

`@layer weird { .a { color: red } }` puts the rule in `components`, and now says so. `radius: xl`
becomes `var(--dssl-radius-xl)`, and now warns when no `radius.xl` token exists, because by
default only `sm`, `md`, `lg` and `full` do. Both are warnings, so `ok` stays true and the output
is the same as before.

## D-5: escaped quote in a value (fixed)

```dssl
.a { content: "a\"b" }
```

The parser's string scan honored the backslash, but the value resolver stopped the string at the
escaped quote and reported `unknown value "b"`. Strings in values, in function arguments and in
layer lists now skip the character after a backslash.

## D-6: the registry rule (open)

The registry rule is built from the final token map (TOK-9). When a token is defined once at the
top level and again, later in the file, inside `@media dark`, the map holds the dark value, so
the registry rule carries it as an unconditional value. Within one file this does no harm,
because the registry rule has the lowest order and the file's own token rules come after it.
Whether it can override an earlier file's unconditional value depends on where the host installs
that bundle in the cascade, and that has not been tested.

Action: write a two-file test (a base palette, then a second file with a dark override) and run
it in a browser before deciding whether this is a bug.

## D-7: nesting under a selector list (fixed)

```dssl
.a, .b { .c { color: red } }
```

used to produce `.a, .b .c`, which means `.a` and `.b .c`. The same applied to state blocks
(`.a, .b { hover { } }` gave `.a, .b:hover`, so only `.b` got the hover), to a child list
(`.a { .c, .d { } }` gave `.a .c, .d`) and to pseudo-element blocks. Parents and children are now
split at top-level commas and every parent part is joined with every child part, and a state is
added to every part. A selector with no commas is joined exactly as before.

## D-8: false "did you mean" warning on element names (fixed)

```dssl
.menu { li { color: red } }
```

compiled correctly to `.menu li` and also warned that the author may have meant `link`, because
`li` is two edits from it. A nested word that is an HTML element name no longer warns. A real typo
such as `hove` still does.
