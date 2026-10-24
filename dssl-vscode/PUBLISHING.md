# Publishing DSSL Language Support

The extension is a normal, registry-ready package: publisher `ehs-studio`, id
`ehs-studio.dssl-vscode`, repository field, icon, LICENSE, README all set. What
follows is exactly what it takes to put it in each registry.

## Open VSX (this is the one for VSCodium)

(Already published: v0.9.0 is live.) VSCodium's Extensions tab searches **open-vsx.org** by default. Once published
there, "DSSL" shows up in the tab, searchable, one-click install, updates included.

One-time, on your side (about 2 minutes):

1. Go to https://open-vsx.org and sign in with your GitHub account.
2. Open your profile, then **Settings**, then **Access Tokens**, and generate a token.
3. Accept the Eclipse publisher agreement on the same page. Publishing fails without it.
4. Put the token in a file that is not in the repo, for example `~/Dokumente/tokens/vsx token`.

Then it is one command:

```sh
OPENVSX_TOKEN_FILE="$HOME/Dokumente/tokens/vsx token" bash scripts/publish-openvsx.sh
```

(`OPENVSX_TOKEN` or a first argument work too.) The script creates the `ehs-studio` namespace
(tolerating "already exists") and publishes the newest `.vsix` in this folder. After that:

- VSCodium: Extensions tab, search "DSSL", Install.
- Future updates: bump `version` in `dssl-vscode/package.json`, repackage with
  `npx @vscode/vsce package --no-dependencies`, rerun the script.

## Microsoft Marketplace (for VS Code proper, optional, more hoops)

VS Code proper searches the Microsoft Marketplace. Same package, different
gatekeeper: it requires an Azure DevOps organization and a personal access token.

1. Create an organization at https://dev.azure.com (free).
2. Go to https://marketplace.visualstudio.com/manage and create a publisher.
   Suggested ID: `ehs-studio`.
3. In Azure DevOps: User settings → **Personal access tokens** → New token with
   scope **Marketplace → Manage**.
4. Keep the token in a file outside the repo, then it is:

```sh
cd dssl-vscode && npx @vscode/vsce publish --pat <token>
```

This can happen at any time; Open VSX first does not block it.

## Local install (works today, no accounts, no waiting)

- VSCodium / VS Code: Extensions panel → **⋯** → *Install from VSIX* → pick the
  `.vsix`. Dragging the `.vsix` onto the Extensions panel works too.
- The latest build always lives in `download/` and in the HF repo tree.

## Before every publish

- `node scripts/sync-extension-engine.mjs` after ANY engine change, so the
  bundled compiler matches the browser compiler.
- Run `npm run test:fast` and `node scripts/test-designer-host.mjs` before packaging. The second one loads the real `extension.js` against a fake editor API, which is the closest thing to opening it in VS Code. Do also open the packaged `.vsix` in VS Code once.
