# 9. Diagnostics

DSSL is loud. A mistake is an error with a place and a hint, not a silent no-op.

## 9.1 Records

- **DIA-1.** A diagnostic is `{ file, line, message, hint? }`. `hint` is omitted (not null)
  when there is none. Messages and hints are English text and are compared exactly by the
  conformance tests, so an implementation MUST use the wording in this spec.
- **DIA-2.** *Errors* mean something was wrong and was dropped or replaced. A source is `ok`
  when it has no errors. *Warnings* mean the source compiles and runs but is probably not what
  the author meant. Warnings never change `ok`.
- **DIA-3.** A tool may offer a strict mode that treats warnings as failures
  (`dssl check --strict`). That is a tool choice, not part of resolving.
- **DIA-4.** Errors from the parser come first, then errors from the resolver, each in the
  order found.
- **DIA-5.** *Deduplication.* At the end of resolving, errors with the same file, line and
  message are reduced to one, keeping the last occurrence, and the order of the others is
  unchanged.
- **DIA-6.** Unknown words are errors, never noise. A word that is left over after a construct
  has used what it understands is an error, not ignored.
- **DIA-7.** A lint or any other helper MUST NOT be able to break a compile. If it fails, its
  warnings are dropped and everything else stands.

## 9.2 Where each message is defined

Each message appears in the chapter that defines the construct it belongs to, in code font. The
conformance corpus (chapter 10) covers every message at least once. Appendix B is generated from
the reference implementation and lists every message template, so a gap between this spec and
the corpus shows up as a failing check.

## 9.3 Did-you-mean

- **DIA-8.** `didYouMean(word, candidates)` returns the best candidate, or nothing:
  1. If the word or the candidate list is empty, return nothing.
  2. Lowercase the word. For each candidate in order, skipping empty ones, compute the
     Levenshtein distance (insert, delete, substitute, each cost 1) between the lowercase word
     and the lowercase text of the candidate.
  3. Keep the first candidate with the smallest distance. A later candidate with an equal
     distance does not replace it.
  4. The tolerance is `max(2, floor(length of the word / 3))`. If the smallest distance is
     larger, return nothing. Otherwise return the candidate as text, in its original case.
- **DIA-9.** The order of the candidates is the order of the sets and lists in appendix A,
  which is the insertion order in the reference implementation. A different order can change
  which of two equally close words is suggested, so implementations MUST keep it.

## 9.4 Warnings the resolver emits

| Where | Message starts with |
|---|---|
| 5.3, nested word near a state word | `"<w>" compiled as a descendant selector` |
| 6.3, row and column words | `two words in ...`, `"<w>" is written twice in ...`, `"<w>" has nowhere to go ...` |
| 6.6, `gradient:` and another image | `"<sel>" sets the background image twice` |
| 7.4, animation shorthand | `animation "<v>" references no motion ...`, `<prop> does nothing here ...` |
| 2.7, `raw { }` | `raw { } is verbatim CSS, so this line needs a ";" at the end` |
| same-rule display clash | `"<prop>:" expands to display: <v>, which overrides the earlier ...` |

- **DIA-10.** *Display clash.* Inside one rule, when a semantic property that expands to
  `display` (`row`, `column`, `grid`, `stack`) comes after an explicit `display:` with a
  different value, the warning is
  `"<via>:" expands to display: <new>, which overrides the earlier "display: <old>" (line <n>)
  in the same rule - later wins, so the earlier one is dead`. At most 400 warnings of this kind
  are kept per file. Overrides across different rules are the cascade at work and get no
  warning.
- **DIA-11.** *Raw semicolons.* In a `raw { }` body (comments blanked), a line that looks like
  `name: value`, does not end in `;`, `{`, `}` or `,`, and is followed by another declaration
  line or a line starting with `}`, is a warning at the line of that declaration inside the
  block.

## 9.5 Lint

A lint pass runs on the finished rules and adds warnings. It covers text contrast (WCAG ratio,
4.5 for body text, 3 for large text), an outline removed from something you can tab to with no
`focus-visible` replacement, and an explicit width or height under 24px on a button or link. It
looks only at unconditional rules, follows tokens, alpha and `color-mix`, and is defined by
`lint.js`.

- **DIA-12.** A Level 2 implementation MAY omit the lint pass. It then declares `lint: false`,
  and conformance tests compare warnings with the lint warnings removed. A lint warning is one
  whose message starts with `text contrast is`, starts with `the focus outline is removed`, or
  ends with `the smallest target WCAG 2.2 allows`.
