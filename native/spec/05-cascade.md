# 5. Cascade

The resolver flattens the nested blocks of a file into a flat list of *rules*. The cascade
then decides, per element, which declaration of each property wins. This chapter defines both.

## 5.1 The rule record

A rule is a record with these fields.

| Field | Meaning |
|---|---|
| `id` | a number, unique inside the document, in creation order |
| `sel` | the full selector text, nesting already joined (5.3) |
| `media` | a list of normalized media conditions (5.5). All must hold. |
| `signals` | a list of signal conditions (5.9). All must hold. |
| `containers` | a list of container conditions (5.6). All must hold. |
| `layer` | one of `tokens`, `base`, `components`, `utilities`, `pin` |
| `order` | a number: this rule's place in the file, counted from 0 (5.4) |
| `decls` | a list of declarations: `{ prop, value, line }` plus extras |
| `file`, `line` | where the rule came from |
| `pseudo` | the pseudo-element name for a shadow rule, else null |
| `states` | the set of state words found in `sel` (5.7) |

A *shadow rule* has the same fields. It is a rule whose `sel` names a pseudo-element target
(5.8).

## 5.2 Layers

- **CAS-1.** The layers are ranked `tokens` (0), `base` (1), `components` (2), `utilities`
  (3), `pin` (4).
- **CAS-2.** Rules outside any layer block are in `components`. `@layer <name> { }` puts the
  rules inside it in layer `<name>` when that is one of the five names, and in `components`
  for any other name, with the warning `unknown layer "<name>", treated as "components"`. The
  hint is the did-you-mean over the five names, or
  `the layers are tokens, base, components, utilities, pin` when none is close. (D-3)
- **CAS-3.** `pin { }` puts its rules in layer `pin`. Declarations in `pin` behave as if
  `!important`: they beat declarations from every other layer, and they beat inline styles
  that the page itself wrote (5.11).
- **CAS-4.** The layer `tokens` is used only for token rules (chapter 4).
- **CAS-5.** There is no specificity. For two matching rules, a lower layer rank loses to a
  higher one. Within a layer, the later `order` wins.

```dssl
.a { color: red }
pin { .a { color: blue } }
@layer base { .a { color: green } }
```

All three match. `base` is below `components`, so `red` beats `green`, and `pin` beats both.
The element is blue.

## 5.3 Nesting

A selector block may contain declarations, other selector blocks, state blocks, pseudo-element
blocks, `@media`, `@container`, `@signal`, `@layer` and `pin` blocks, and `use` lines.

- **CAS-6.** Nested selectors are joined to the parent selector. If the child contains `&`,
  each `&` is replaced by the parent selector. Otherwise the result is the parent, a space
  and the child (a descendant selector). A block at the top level is used as written.
- **CAS-7.** Lists are split at top-level commas (not inside parentheses or brackets, so
  `:is(.x, .y)` stays whole) on both sides. Every parent part is joined with every child part,
  parent-major: for each parent part in order, each child part in order. The results are
  joined with `, `. So `.a, .b { .c { } }` means `.a .c, .b .c`, `.a { .c, .d { } }` means
  `.a .c, .a .d`, and `&` is replaced by each parent part in turn. With no commas on either
  side the result is the plain join of CAS-6. (Before 0.16.3 the lists were joined as whole
  text, giving `.a, .b .c`. That was D-7.)
- **CAS-8.** A nested block whose header is a single plain word that is close to a state word
  but not equal to it (`hove`, `focs`) is still a selector, but the resolver reports a
  warning: `"<word>" compiled as a descendant selector`, with the hint naming the state.
  This applies only when the header is a bare word of letters, digits and dashes, and there is
  a parent selector. "Close" is the did-you-mean rule (9.3). The warning never fires for a
  word that is an HTML element name (`li`, `td`, `menu`, and the rest of the list in the
  reference engine), because a nested element name is a descendant selector on purpose. (Before
  0.16.3 `li` was warned about, being two edits from `link`. That was D-8.)
- **CAS-9.** Conditions nest. `@media`, `@container` and `@signal` add one entry to the
  `media`, `containers` or `signals` list of everything inside. A layer block replaces the
  layer of everything inside.
- **CAS-10.** A state block adds `:<state>` to the parent selector (5.7). A pseudo-element
  block makes a shadow rule (5.8).

```dssl
.card {
  background: color.card
  hover { background: color.paper }
  @media dark { background: color.ink }
  &.on { background: color.accent }
}
```

## 5.4 Order

- **CAS-11.** Each rule, shadow rule and `raw` block gets the next order number at the moment
  it is emitted. The registry rule (4.3) gets 0. Token rules get a number at the moment their
  block is reached.
- **CAS-12.** A rule is emitted when its block ends, or when a nested block starts, if it has
  declarations waiting. So a block with declarations before and after a nested block makes
  two rules, one for each fragment, in source order:

```dssl
.a {
  color: red
  hover { color: blue }
  padding: 4
}
```

This makes `.a { color }` (order 1), `.a:hover { color }` (order 2) and `.a { padding }`
(order 3). The hover rule beats the base rule because it comes later. Writing the hover block
before `color: red` would make `color: red` win while hovering.

- **CAS-13.** A nested block is fully walked, and its own rule is emitted, before the rest of
  its parent. Blocks nested inside it are emitted first.
- **CAS-14.** A rule with no declarations after resolution is not emitted.
- **CAS-15.** Declarations that appear with no selector around them are the error
  `declarations must live inside a selector`, at the line of the first (line 0 for the file
  top level).
- **CAS-16.** `order` is local to a file. When the host loads several files, it MUST place
  them in load order and give every rule one position in that single sequence: the numbers of
  a later file continue after the largest number of the earlier one. A later file wins over
  an earlier one for equal layers.

Why: before 0.8.2 each file counted from zero and the numbers were compared across files,
which made a later file lose to an earlier one for no visible reason.

## 5.5 Media conditions

`@media <query>` adds one normalized query to `media`.

- **CAS-17.** The query is trimmed. An empty query is the error `@media needs a condition`
  and the query `(min-width: 0)`.
- **CAS-18.** The single words `dark`, `light` and `reduced-motion` (any case) become
  `(prefers-color-scheme: dark)`, `(prefers-color-scheme: light)` and
  `(prefers-reduced-motion: reduce)`.
- **CAS-19.** `N` or `>= N` becomes `(min-width: Npx)`. `<= N` becomes `(max-width: Npx)`.
  `A..B` becomes `(min-width: Apx) and (max-width: Bpx)`. `N`, `A` and `B` are numbers.
- **CAS-20.** Any other query is kept, except that in any comparison, a bare number after
  `>`, `<` or `=` that has no unit gets `px`: `(width >= 768)` becomes `(width >= 768px)`.
- **CAS-21.** A condition holds when the host's media query evaluation says it holds.

```dssl
.a {
  @media 768 { padding: 24 }
  @media <= 480 { padding: 12 }
  @media 480..960 { gap: 4 }
}
```

## 5.6 Container conditions

- **CAS-22.** `@container <query>` adds one normalized query (same rules as 5.5, with the
  empty case `(min-width: 0)`) to `containers`.
- **CAS-23.** A container condition holds for an element when the nearest ancestor (or the
  element itself) that the page marked as a container has a content width that satisfies every
  bound in the query. A bound is `(min-width: N)`, `(max-width: N)`, `(width >= N)` or
  `(width <= N)`. If no ancestor is a container, the condition does not hold.

## 5.7 States

- **CAS-24.** A state block `name { ... }` in a block with selector `S` makes a rule with
  selector `S:name`. When `S` is a list, the state is added to every part (`.a, .b` with
  `hover` is `.a:hover, .b:hover`). The state words are in appendix A. State blocks can nest
  (`hover { focus { } }` gives `S:hover:focus`).
- **CAS-25.** A state block with no selector around it is the error `"<name>" needs a
  selector around it`.
- **CAS-26.** All state words except `seen` are the CSS pseudo-classes of the same name and
  are matched by the host.
- **CAS-27.** `seen` is not a CSS pseudo-class. An element is *seen* once at least part of it
  has been inside the viewport, and stays seen. A rule whose selector contains `:seen`
  matches when the selector with `:seen` removed (or `*` if nothing is left) matches and the
  element is seen. An implementation MUST re-evaluate the element when it becomes seen.
- **CAS-28.** Inside a `seen` block, a value that contains `->` is the error
  `"<prop>: <value>" - the -> arrow is motion syntax and does nothing inside seen { }`. The
  rule is still emitted.
- **CAS-29.** `states` is the set of state words found in `sel` as `:word`, from the list:
  hover, focus-visible, focus, active, disabled, checked, empty, target, invalid, valid,
  required, open, closed, read-only, read-write, placeholder-shown, first-child, last-child,
  only-child, seen.

## 5.8 Pseudo-elements and shadow rules

Inline styles cannot reach pseudo-elements, so the reference engine puts them in a separate
stylesheet. A native implementation has no such limit, but the resolver output still keeps
them in `shadowRules`, so that results are comparable.

- **CAS-30.** A block `::name { }` inside a selector block `S` makes a shadow rule with
  `sel` = `S` and `pseudo` = `name`. When `S` is a list, there is one shadow rule per part
  (and per state block inside it), each with its own copy of the declarations. At the top
  level (no selector), `sel` is `*`.
- **CAS-31.** Inside a pseudo-element block, only declarations and state blocks are allowed.
  Anything else is the error
  `only declarations and states (hover { }) may appear inside a pseudo-element block`. A
  state block inside makes a second shadow rule with `sel` = `S:<state>`. `seen` there is
  the error `"seen" is engine-native and has no meaning on a pseudo-element`.
- **CAS-32.** A bare `content:` (no value) inside a pseudo-element becomes `content: ""`.
- **CAS-33.** Engine-native declarations (the `@` ones in 6.8) are not allowed on a
  pseudo-element, except `@animate`. Each is the error
  `"<prop>" is engine-native and has no meaning on ::<name> - a pseudo-element has no DOM
  handle`, and is dropped.
- **CAS-34.** The same applies when the pseudo-element is written in the selector itself
  (`.card::before { }`). The selector is split at the first top-level `::`. If every part of
  a selector list has a pseudo-element, the rule becomes one shadow rule per part. If only
  some do, the error is `selector list mixes pseudo-element and plain selectors: "<sel>"`
  and nothing is emitted.
- **CAS-35.** A pseudo-element name MUST be in the pseudo-element list or match the vendor
  pseudo pattern (appendix A), otherwise: `unknown pseudo-element "::<name>"`. `::slotted()`
  is the error `::slotted() only exists inside a shadow tree, and DSSL styles the light DOM`.
  `:seen` combined with a pseudo-element is an error.
- **CAS-36.** If every declaration of a shadow rule was rejected, nothing is emitted.

```dssl
.btn {
  ::after {
    content: ""
    opacity: 0
    hover { opacity: 1 }
  }
}
```

## 5.9 Signals

A signal is a named value that the page sets. It is how DSSL reads state that CSS cannot see
(a theme chosen in a menu, a game screen). Chapter 11 says how a browser could expose it.

- **CAS-37.** `@signal <expr>` adds one condition to `signals`. The forms are:

  | Form | Condition record |
  |---|---|
  | `name` | `{ name, op: 'truthy', value: null }` |
  | `name == value` | `{ name, op: '==', value }` |
  | `name != value` | `{ name, op: '!=', value }` |
  | `name in (a, b)` | `{ name, op: 'in', value: 'a,b', values: ['a','b'] }` |
  | `name not in (a, b)` | `{ name, op: 'notin', value: 'a,b', values: ['a','b'] }` |

  A name matches `[A-Za-z_][\w-]*`. A value may be quoted with `"` or `'`, and the quotes are
  removed. List values are trimmed, unquoted, and empty ones removed.
- **CAS-38.** An expression in none of these forms is the error
  `bad @signal expression "<expr>"` and is treated as `truthy` on the whole text. An empty
  list is the error `@signal <name> <in|not in> ( ) has no values`.
- **CAS-39.** A signal's value is looked up on the element, then on each ancestor, then at the
  document level. The first place that has the name wins. Values are compared as strings.
- **CAS-40.** A signal condition holds when:
  - `truthy`: the name has a value that is not `false`, `null`, the string `false`, `0` or
    the string `0`,
  - `==`: the name has a value and its string equals the condition's value,
  - `!=`: the name has no value, or its string differs,
  - `in`: the name has a value and it is in the list,
  - `notin`: the name has no value, or it is not in the list.

## 5.10 Which rules apply to an element

- **CAS-41.** A rule applies to an element when all of these hold:
  1. its selector matches the element. A rule with selector `:root` applies only to the
     document's root element;
  2. if the selector contains `:seen`, CAS-27 holds;
  3. every `media` condition holds;
  4. every `signals` condition holds;
  5. every `containers` condition holds.
- **CAS-42.** Applicable rules are sorted by layer rank, then by `order` (both ascending). The
  declarations of the sorted rules are flattened in that order, each rule's declarations in
  their written order.
- **CAS-43.** For each property, the last declaration in that sequence wins. Engine-native
  declarations (6.8) each have their own combination rule, given with their feature.

## 5.11 What else decides the value

These rules are about where DSSL meets the page.

- **CAS-44.** *Inline styles written by the page.* A declaration that the page itself put in
  the element's `style` attribute, or set from a script, beats any rule that is not in `pin`.
  A `pin` rule beats it. A property the page removes is free for rules again.
- **CAS-45.** *Shorthand and longhand.* A shorthand expands into its longhands in cascade
  position. Of a shorthand and one of its longhands, the one that comes later in the
  flattened sequence wins for that longhand. This holds for `border` and its `-color`,
  `-width` and `-style` longhands, and for `padding`, `margin` and `gap` and their sides.
- **CAS-46.** *Handing back with yield.* After the sequence is flattened, properties named by
  the last applicable `yield:` (6.7) are removed from the DSSL result, so ordinary CSS decides
  them. `yield: none` clears the list.
- **CAS-47.** *Alignment makes a box.* If the winning declarations include any of
  `place-items`, `place-content`, `align-items`, `justify-items`, `align-content` or
  `justify-content`, and the element has no declared `display`, and the element's natural
  `display` is not `flex`, `inline-flex`, `grid` or `inline-grid` (and is not `none` or
  `contents`), then `display` is set to `inline-grid` when the natural `display` is `inline` or
  starts with `inline-`, and to `grid` otherwise. An explicit `display` from any rule wins over
  this.

Why: alignment properties do nothing on a plain `span` or `button`, and DSSL treats that as a
silent failure.

- **CAS-48.** *Border and positional shorthands in the inline lane.* A browser that computes
  styles natively does not need extra rules for CAS-45: the CSS cascade already does it.
