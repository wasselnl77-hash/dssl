# Publishing DSSL Language Support

The extension is a normal, registry-ready package: publisher `ehs-studio`, id
`ehs-studio.dssl-vscode`, repository field, icon, LICENSE, README all set. What
follows is exactly what it takes to put it in each registry.

## Open VSX (this is the one for VSCodium)

VSCodium's Extensions tab searches **open-vsx.org** by default. Once published
there, "DSSL" shows up in the tab, searchable, one-click install, updates included.

One-time, on your side (about 2 minutes):

1. Go to https://open-vsx.org and sign in with your GitHub account.
2. Top right: your avatar → **Settings** → **Access Tokens** → **Generate token**.
3. Give it any name, copy the value, and paste it in chat. It gets stored the
   same way as the HF and Vercel tokens (chmod 600, outside every tracked file,
   mirrored into `.git/backups/`).

Then it is one command on my side:

```sh
bash scripts/publish-openvsx.sh
```

The script reads the token, creates the `ehs-studio` namespace (tolerates "already
exists"), and publishes the newest `.vsix`. After that:

- VSCodium: Extensions tab → search "DSSL" → Install.
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
4. Hand over the token like the others, then it is:

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
- Run the extension lib tests (36 assertions) before packaging.
