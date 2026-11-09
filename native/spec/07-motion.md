# 7. Motion

DSSL separates *defining* a motion from *running* it. `motion` defines keyframes. `animate:`
runs one on an element. `seen` and states decide when.

## 7.1 Defining a motion

```dssl
motion rise-in {
  from { opacity: 0; translate: 0 18 }
  to   { opacity: 1; translate: 0 0 }
}

motion pulse {
  essential
  0%   { opacity: 1 }
  50%  { opacity: 0.6 }
  100% { opacity: 1 }
}
```

- **MOT-1.** `motion <name> { ... }` is allowed only at the top level. A motion block holds
  keyframe blocks and the word `essential`. Any other declaration is the error `"<prop>" is
  not allowed inside motion`, with the hint `motions take from/to/at blocks and essential`.
- **MOT-2.** A keyframe block header is one of `from` (0), `to` (100), `at N%` or `N%` or
  `N`, or a comma list of these (`0%, 100%`). Every offset MUST be between 0 and 100. A bad
  header is the error `bad keyframe selector "<h>"`.
- **MOT-3.** `essential` (alone, or as `essential: true`) marks the motion as one that keeps
  playing under `prefers-reduced-motion`.
- **MOT-4.** Declarations inside a keyframe are resolved like any other declaration
  (chapter 6) with `prop` set to the source property. Custom properties are dropped. Each
  output property is named in camelCase (`background-color` becomes `backgroundColor`).
- **MOT-5.** In a keyframe, the deform words (`bend`, `bend-y`, `bend-up`, `fold`, `stretch`)
  are not kept as properties. They are composed into one `transform` (8.5), with an extra
  `transformOrigin` for the edge-pinned ones, because there is no box yet when keyframes are
  built. A deform value of 0 is a real reset.
- **MOT-6.** A list header makes one frame per offset with the same properties. The frames of a
  motion are sorted by offset (a stable sort).
- **MOT-7.** The result is `{ essential: bool, frames: [{ offset, props }] }`. A motion block
  is parsed once, the first time it is needed.

## 7.2 Running a motion

`animate: part, part, ...` or `none`. Each part is `name [words]`.

- **MOT-8.** The spec record starts as
  `{ motion: name, duration: 400, easing: smooth, fill: 'both', delay: 0 }`. `smooth` is the
  `cubic-bezier(0.4, 0, 0.2, 1)` easing from appendix A.
- **MOT-9.** Words after the name are read in order:
  - `delay N`, `jitter N`, `iterations N`: the next word is a number with an optional `ms` or
    `s` unit (for `iterations` a plain count). Missing: error `<word> needs a number`.
  - `essential`: sets `essentialHere`.
  - a number with optional unit: the first word after the name is the duration (`s` means
    seconds, otherwise ms); a later one is the delay.
  - an easing name: sets the easing.
  - `both`, `forwards`, `backwards`, `none`, `auto`: the fill mode.
  - `infinite`: iterations is infinity.
  - `alternate`, `alternate-reverse`, `reverse`, `normal`: the direction.
  - anything else: error `unknown animate part "<w>"`, hint = did-you-mean over the easing
    names and the words above.
- **MOT-10.** One part gives one `@animate` declaration. Several parts (a top-level comma)
  give several, in order. `animate: none` gives `@animate: null`.
- **MOT-11.** After the whole file is walked, every `@animate` with a motion name is linked:
  the motion is looked up in this file, then in the motions the host passed in (7.3). If
  found, the spec gets `frames`, and `essential` is true when the motion or the spec says so.
  If not found, the error is `unknown motion "<n>"`, with a did-you-mean over the file's
  motions, or a hint showing how to define one, and the spec is marked `broken`.
- **MOT-12.** Several `@animate` declarations matched by one element all run, in cascade
  order. `@animate: null` from a later rule cancels the ones before it.

## 7.3 Motions across files

- **MOT-13.** The host passes the already-built motions of earlier files to the resolver (the
  motion registry). A motion defined in an earlier file can be used by a later one, like a
  token. A motion in the current file shadows one in the registry.
- **MOT-14.** After resolving, every motion in the file is built (not only the referenced
  ones) and returned as `motionFrames`, for any consumer that wants all of them (the static
  emitter, 11.4).

## 7.4 The animation shorthand

- **MOT-15.** The plain CSS properties `animation` and `animation-name` pass through (PRP-1,
  item 4), with a bare number meaning ms. If a rule has one whose words do not include the
  name of any motion in this file or the registry, the warning is
  `animation "<v>" references no motion defined in this sheet - it will not run`.
- **MOT-16.** `animation-delay`, `-duration`, `-iteration-count`, `-direction`, `-fill-mode`,
  `-timing-function` and `-play-state` do nothing in a rule that has no `animation` or
  `animation-name`. The warning is `<prop> does nothing here: this rule has no CSS animation
  to tune`, with a hint to put the setting in the `animate:` line.

## 7.5 stagger

`stagger: N` on a parent offsets the delay of each element child's animations by
`index * N` ms, where `index` is the child's position among the parent's element children.

- **MOT-17.** The value is a number with optional `ms` or `s`, or `none`. Anything else is the
  error `stagger needs a duration like "60" or "120ms", or "none"`. It writes `@stagger` with
  milliseconds, or `@stagger: null`.

## 7.6 Reduced motion

- **MOT-18.** When the user prefers reduced motion, a motion plays only if it is `essential`
  (by its own flag or by `essential` on the `animate:` line). Others do not run. Textures,
  auras and tilt follow their own rules in chapter 8.
