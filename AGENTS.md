# AGENTS.md — for AI agents (and humans) working on this repo

DSSL is a style language that replaces CSS. The engine lives in `public/dssl/` (parser,
resolver, engine, boot, utils), the site in `src/`, the styles that drive the site in
`public/styles/`, tests in `scripts/test-v*.mjs`, the editor extension in `dssl-vscode/`.
The HF mirror of this repo carries the full docs in its README.

## Commands

```sh
npm run dev                          # Next dev server (site)
node scripts/dssl-styles-check.mjs   # canonical gate: every .dssl file, 0 errors required
node scripts/test-v050.mjs           # engine suites: run ALL test-v0*.mjs, all must pass
node scripts/test-v060.mjs
node scripts/test-v070.mjs
node scripts/test-v071.mjs
node dssl-vscode/test/run.mjs        # extension analysis tests
node scripts/sync-extension-engine.mjs  # REQUIRED after touching public/dssl/*.js
```

## Rules of the house

1. The engine stays the engine. No compile-to-CSS pivot, no hybrid output. Inline styles
   applied live are the architecture; pseudo-elements compile to one shadow stylesheet and
   that is the only CSS the engine ever writes. Do not propose otherwise; the owner has
   ruled twice.
2. New engine surface needs tests in `scripts/test-vNNN.mjs` (numbered by version) and a
   changelog entry in `src/components/dssl/views/ChangelogView.tsx`.
3. The site dogfoods the engine: site styling lives in `public/styles/*.dssl` and MUST
   pass styles-check with 0 errors. If you add a view: create its `.dssl`, add it to
   `DSSL_SHEETS` in `src/app/layout.tsx`, add the route to `SiteRoot.tsx` (ViewName, VIEWS,
   render line, `[data-view="x"] .nl-x` nav-active rule in site.dssl).
4. After ANY change to `public/dssl/*.js`, run `scripts/sync-extension-engine.mjs` so the
   editor extension bundles the same compiler, then re-run the extension tests.
5. Never commit tokens or credentials. Not to this repo, not to the HF mirror, not into
   the site's public/ folder. Backups live OUTSIDE tracked files.
6. Deploys: `vercel deploy --prod --yes --token "$(cat /home/z/.vercel_token)"` for the
   site; the HF mirror pushes via a tokenized remote URL that gets washed back to clean
   immediately after the push. If the tokens are missing, they can be restored from the
   backup file inside the project's .git/backups/ directory (that spot survives resets).
7. Verify ships with raw curl (cache busters), not only fetchers: CDN caches have shown
   stale content minutes after a successful deploy.

## Conventions

- Errors are loud, with did-you-mean built from edit distance over known properties,
  tokens and motions. Warnings (v0.7+) compile fine but get printed; `ok` stays `true`.
- The token registry folds across files in load order; `tokens*.dssl` sorts first in the
  editor for the same reason.
- Numbers are bare and mean pixels. No semicolons required. Comments `//` and `/* */`.
- The site is the test suite: when the site needs something the language cannot express,
  the language grows. Keep that loop.
