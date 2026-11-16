# One-time setup

The site works with no accounts: the local screen decrypts `data/data.enc.json` with identifiant `dylan` and the password used when that file was encrypted. The fictional seed in `scripts/demo-data.mjs` is a different file and is not what the site loads. The steps below turn on multi-user storage and Gmail. They use only free tiers. No card, no paid API, no LLM.

The public values are already committed:

- `public/firebase-config.json` — Firebase web config for `job-crm-dlnraja`
- `public/google-config.json` — Gmail OAuth web client id only

Those values are public by design (they ship in the static site). There is no OAuth client secret in the repo, and none should be added. Security is Firestore rules plus client-side AES-256-GCM. The vault passphrase is never sent to Firebase.

## 1. Firebase (Spark)

1. Open https://console.firebase.google.com/ and create a project. Stay on the Spark plan.
2. Build → Authentication → Sign-in method. Enable **Email/Password** and **Google**.
3. Authentication → Settings → Authorized domains. Add `dlnraja.github.io`. `localhost` is already there for local preview.
4. Project settings → General → Your apps → Web app. Copy the config into `public/firebase-config.json`:

```json
{
  "apiKey": "…",
  "authDomain": "YOUR_PROJECT.firebaseapp.com",
  "projectId": "YOUR_PROJECT",
  "storageBucket": "YOUR_PROJECT.appspot.com",
  "messagingSenderId": "…",
  "appId": "…"
}
```

5. Build → Firestore Database → Create database. Start in production mode.
6. Firestore → Rules. Paste `firestore.rules` from this repo and publish. The only allow rule is `request.auth.uid == uid` on `/users/{uid}/**`. There is no admin bypass.
7. Commit the JSON (it is not a secret) and let GitHub Pages rebuild. Until this file has non-empty `apiKey`, `authDomain`, `projectId` and `appId`, the login screen stays in local-vault mode.

Each account then chooses a **vault passphrase**. Google sign-in does not replace it. The key is PBKDF2(uid + NUL + passphrase). Firestore stores only the ciphertext at `users/{uid}/vault/data`.

### Import an existing vault

After the passphrase step, open **Profil → Importer mon coffre existant**. The identifiant field is `dylan`. Type the password of `data/data.enc.json`, leave the file input empty to read that file, or choose another encrypted JSON. Tick **Remplacer** only if the account already has a vault. The payload is re-encrypted with the account passphrase before it is written. A different identifiant cannot open the file: the username is part of the key.

## 2. Gmail (Google Cloud, testing mode)

LinkedIn sign-in is not wired: LinkedIn's current OIDC flow needs a client secret, and there is no public API for jobs or applications. The app stores a profile URL, job links (`linkedin.com/jobs/view/<id>`), people-search links, and ids pasted or found in mail.

1. https://console.cloud.google.com/ → the same project Firebase created, or a new one.
2. APIs & Services → Library → enable **Gmail API**.
3. OAuth consent screen. User type **External**. Publishing status **Testing**. The scopes on this client are `gmail.readonly` and `gmail.send`. `gmail.compose` is not enabled, and the app does not request it. Add your Google account under **Test users**. While the app stays in Testing, only those users can connect, and no verification review is required.
4. APIs & Services → Credentials → Create OAuth client ID → **Web application**.
   - Authorized JavaScript origins: `https://dlnraja.github.io` and `http://localhost:5173`.
   - No client secret is used. Do not create a server flow, and do not commit a secret.
5. The client id is already in `public/google-config.json`. It must end with `.apps.googleusercontent.com`.

In the app, **Gmail → Connecter Gmail**. The token stays in the tab. The button sends that public client id to Google Identity Services with `gmail.readonly`, plus `gmail.send` only when **Autoriser aussi l'envoi** is checked first. Scan reads at most 25 recent messages, one request at a time, and stops if Gmail returns 429. Classification is keyword/regex only. **Appliquer au coffre** writes statuses, timeline entries, and bounced contacts. **Relances → Remerciement** keeps the thank-you in the vault. **Envoyer** calls `gmail.send` only when that scope was checked before connecting and you click the button.

## 3. GitHub Pages

The workflow `.github/workflows/pages.yml` deploys `main` with `actions/deploy-pages`. `actions/configure-pages` `enablement: true` cannot create the Pages site with the default `GITHUB_TOKEN` (the API returns 403 `Resource not accessible by integration`).

Once, as the repository owner:

1. Open https://github.com/dlnraja/job-crm/settings/pages
2. Build and deployment → Source → **GitHub Actions** → Save.
3. Re-run the failed deploy, or push again.

The site is https://dlnraja.github.io/job-crm/

## What works before any of this

Local encrypted vault, dashboard, tracker, contacts, email guesser (including an optional MX lookup via DNS-over-HTTPS), follow-up rules, refusal thank-you text, cover letters from the profile, LinkedIn links and pasted job ids, CSV and encrypted JSON export. No third-party script loads until you connect Gmail; Firebase is bundled and stays idle while its config is empty.
