# AGENTS.md: for AI agents (and humans) working on this repo

DSSL is a style language. The engine lives in `public/dssl/`, the site in `src/`, the styles that
drive the site in `public/styles/`, the tests in `scripts/`, the editor extension in `dssl-vscode/`.
The Hugging Face repo (`EHS-Studio/dssl`) is this repo; its README is the full docs.

## Commands

```sh
npm install                          # three runtime packages and a few dev ones; nothing else
npm run dev                          # Next dev server for the site
npm run typecheck                    # tsc, must be clean (builds fail on type errors)
npm test                             # EVERY suite in one report (needs Chrome or Chromium)
npm run test:fast                    # the same without the browser suites
node scripts/sync-extension-engine.mjs   # REQUIRED after touching public/dssl/*.js
bash scripts/build-engine-package.sh     # rebuild public/dssl-engine.zip and .tar.gz
cd dssl-vscode && npx @vscode/vsce package --no-dependencies   # rebuild the .vsix
```

Browser tests use `playwright-core` with a Chrome already on the machine. Set `DSSL_CHROME` if
yours is somewhere unusual. `scripts/lib/browser-harness.mjs` is the one place that launches it.

## Rules of the house

1. The engine stays the engine. Inline styles applied live are the architecture, and pseudo-elements
   compile to one shadow stylesheet. `dssl build` is a second lane for the static subset, not a
   replacement: anything that needs the runtime (`@signal`, `animate`, aura, texture, deform, overlap)
   stays in the engine, and the build report must say so. If you add an engine-native feature, the
   report has to count it (it prefixes its declaration with `@`, which is how `static.js` knows).
2. New language surface needs tests in a `scripts/test-vNNN.mjs` and, if it draws, a real-browser
   test. A string comparison of generated CSS is not a test of rendering: look at pixels
   (`scripts/lib/pixels.mjs`). Add a changelog entry in `src/components/dssl/views/ChangelogView.tsx`.
3. Every error is loud, with a did-you-mean, and a leftover or unknown word is an error, never noise.
   Warnings compile fine; `ok` stays `true`. A lint or checker must never be able to break a compile.
4. The site dogfoods the engine: its styling lives in `public/styles/*.dssl`, and `dssl check --strict`
   over those files must print nothing. A new page needs a route under `src/app/`, an entry in `NAV`
   and `VIEW_PATH` in `SiteRoot.tsx`, its own `.dssl` listed in `DSSL_SHEETS` in `src/app/layout.tsx`,
   and a line in `src/app/sitemap.ts`.
5. After ANY change to `public/dssl/*.js`, run `scripts/sync-extension-engine.mjs`, then the extension
   tests. The package script and the sync script copy the WHOLE engine folder (the resolver imports
   `color`, `texture`, `aura`, `slider` and `lint`); never go back to a hardcoded file list. A test
   (`test-v081.mjs`, `test-designer-host.mjs`) fails if you do.
6. Cascade order is one global sequence in load order (`assignGlobalOrder` in `engine.js`). Do not
   compare a rule's own `order` across stylesheets.
7. Never commit tokens or credentials, not here, not in `public/`, not in a commit message.
8. Deploys. Site: `vercel deploy --prod --yes --token "$VERCEL_TOKEN"` from the repo root (the project
   is `dssl`; run `vercel link --project dssl` once, and delete the `.env.local` it writes). Hugging
   Face: push `main` with the token in a request header, not in the URL, so nothing lands in
   `.git/config`:
   `git -c http.extraHeader="Authorization: Basic $(printf 'EHS-Studio:%s' "$HF_TOKEN" | base64 -w0)" push origin main`.
9. Verify a ship with raw `curl` and a cache-busting query string, not only a fetcher: CDNs have
   served stale content minutes after a good deploy.
10. Docs are written for people. Plain sentences, no em dashes, say what it is and what it costs.
    Tables of settings are generated from the vocabulary modules, so they cannot drift.

## Conventions

- Numbers are bare and mean pixels. No semicolons are required (except inside `raw { }`, which is real
  CSS). Comments are `//` and `/* */`.
- The token registry folds across files in load order; `tokens*.dssl` sorts first.
- Aura has no presets, on purpose. If you want fire, write a `behavior`. Textures have presets because
  they are stored combinations of generators and settings; every preset must be reproducible by hand.
- The site is the test suite: when the site needs something the language cannot express, the language
  grows. That loop found the cascade bug in 0.8.2 and the contrast failures in 0.9.0.
