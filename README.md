# Coffre — suivi de candidatures

Static job-search CRM for one person. The site is French. The vault is one file, `data/data.enc.json`, encrypted in the browser with AES-256-GCM. The key is PBKDF2-SHA256 (600 000 iterations) of the username, a NUL byte, and the password. Decrypted dossiers stay in memory. Edits can be saved only as a re-encrypted copy in `localStorage`. Nothing is sent to a server. There is no analytics and no third-party CDN.

The repository is public. Do not commit `data.json` or any other plaintext export. `.gitignore` already excludes them.

## Opening the committed vault

`data/data.enc.json` is ciphertext. It does **not** open with the fictional demo password. The local screen asks for the identifiant and password that were used when that file was encrypted. For this vault the identifiant is `dylan`. A wrong pair shows "Identifiants incorrects." and nothing else.

`scripts/demo-data.mjs` is a separate fictional seed (Phare & Cie and similar). It is not the committed vault. To build a throwaway file from it:

```bash
node --input-type=module -e 'import { writeFileSync } from "node:fs"; import { demoPlaintext } from "./scripts/demo-data.mjs"; writeFileSync("/tmp/job-crm-demo.json", JSON.stringify(demoPlaintext()));'
CRM_PASSWORD='demo-only-public' node scripts/encrypt.mjs /tmp/job-crm-demo.json /tmp/job-crm-demo.enc.json
rm -f /tmp/job-crm-demo.json
```

That demo file, and only that file, opens with identifiant `demo` and password `demo-only-public`.

## Regenerate `data/data.enc.json`

Write a plaintext file that matches [`docs/SCHEMA.md`](docs/SCHEMA.md) somewhere **outside the repo** (or anywhere that stays untracked). `auth.username` is required. Then:

```bash
export CRM_PASSWORD='your-password'
node scripts/encrypt.mjs /absolute/path/to/data.json
```

That overwrites `data/data.enc.json`. Optional second argument: output path.

Check the round trip without writing plaintext back to disk:

```bash
export CRM_PASSWORD='your-password'
export CRM_USERNAME='the-username-inside-auth.username'
node scripts/decrypt.mjs data/data.enc.json
```

Decrypt prints JSON to stdout and a generic error if the username or password is wrong. Both scripts use Node 20 built-ins only. Do not point the output at `data/data.enc.json` unless you mean to replace the committed vault.

After changing data in the browser, use **Exporter JSON chiffré** and commit that file as `data/data.enc.json`. **Exporter CSV** downloads a spreadsheet of the tracker. **Oublier la copie locale** drops the `localStorage` copy only.

## Accounts, Gmail, letters

With no Firebase config, the site stays in local-vault mode. The committed file opens with identifiant `dylan` and the passphrase used to encrypt it, not with the fictional demo password.

One-time cloud setup (Firebase Spark, Google OAuth client, Firestore rules, authorized domain) is in [`docs/SETUP.md`](docs/SETUP.md). The public web config is in `public/firebase-config.json`. The public Gmail OAuth client id (no secret) is in `public/google-config.json`. Rules: `firestore.rules`.

## LinkedIn extension

Automating LinkedIn breaks LinkedIn's User Agreement and can restrict or close the account. The extension in `extension/` only clicks and types in a normal, already logged-in browser tab. It does not call Voyager, does not read cookies or tokens, and does not run headless. Caps, delays, working hours, a warm-up, a dry-run default, and a kill switch reduce burstiness. **None of that guarantees the account will be left alone.** Details and install steps: [`extension/README.md`](extension/README.md).

The installable archive is committed at [`extension/dist/coffre-linkedin.zip`](extension/dist/coffre-linkedin.zip). Unzip it and load the folder as an unpacked extension (Chrome or Edge) or load `manifest.json` as a temporary add-on (Firefox 128+). `npm run build:extension` refreshes that file. On `main`, the release workflow commits it when the build changes and uploads the same zip to https://github.com/dlnraja/job-crm/releases/download/extension-v1.0.0/coffre-linkedin.zip.

## Develop

```bash
npm install
npm test
npm run dev
```

`npm test` covers the crypto round trip (library and both scripts), the email guesser, KPI and follow-up rules, and the committed vault.

```bash
npm run build
npm run preview
```

## GitHub Pages

The workflow `.github/workflows/pages.yml` builds the site and deploys it with `actions/deploy-pages` on every push to `main`.

`actions/configure-pages@v6` is called with `enablement: true`. That input **cannot use the default `GITHUB_TOKEN`**. It needs a separate token with the `repo` scope (or Pages write) for a PAT, or `administration:write` and `pages:write` for a GitHub App. The step is marked `continue-on-error` so a missing token does not block a deploy once Pages already exists.

If the first deploy fails because Pages is still off, set it once:

**Settings → Pages → Build and deployment → Source → GitHub Actions.**

The site is published at:

https://dlnraja.github.io/job-crm/

Asset paths are relative, so the same build works at that project URL.
