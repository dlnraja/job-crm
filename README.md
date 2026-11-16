# Coffre — suivi de candidatures

Static job-search CRM for one person. The site is French. The vault is one file, `data/data.enc.json`, encrypted in the browser with AES-256-GCM. The key is PBKDF2-SHA256 (600 000 iterations) of the username, a NUL byte, and the password. Decrypted dossiers stay in memory. Edits can be saved only as a re-encrypted copy in `localStorage`. Nothing is sent to a server. There is no analytics and no third-party CDN.

The repository is public. Do not commit `data.json` or any other plaintext export. `.gitignore` already excludes them.

## Demo login (public, fictional data only)

These credentials are **demo-only**. They open a made-up vault (Phare & Cie, Banque du Quai, and other invented names). Replace the file before storing anything real.

- Username: `demo`
- Password: `demo-only-public`

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

Decrypt prints JSON to stdout and a generic error if the username or password is wrong. Both scripts use Node 20 built-ins only.

To rebuild the committed fictional vault:

```bash
node --input-type=module -e 'import { writeFileSync } from "node:fs"; import { demoPlaintext } from "./scripts/demo-data.mjs"; writeFileSync("/tmp/job-crm-demo.json", JSON.stringify(demoPlaintext()));'
CRM_PASSWORD='demo-only-public' node scripts/encrypt.mjs /tmp/job-crm-demo.json data/data.enc.json
rm -f /tmp/job-crm-demo.json
```

After changing data in the browser, use **Exporter JSON chiffré** and commit that file as `data/data.enc.json`. **Exporter CSV** downloads a spreadsheet of the tracker. **Oublier la copie locale** drops the `localStorage` copy only.

## Accounts, Gmail, letters

With no Firebase config, the site stays in local-vault mode. The published file still opens with identifiant `demo` and password `demo-only-public`.

One-time cloud setup (Firebase Spark, Google OAuth client, Firestore rules, authorized domain) is in [`docs/SETUP.md`](docs/SETUP.md). Placeholders live in `public/firebase-config.json` and `public/google-config.json`. Rules: `firestore.rules`.

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
