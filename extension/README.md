# Coffre LinkedIn

Manifest V3 extension for Chrome, Edge, and Firefox 128+. It only acts in the browser profile where you are already logged into LinkedIn. It does not call LinkedIn's Voyager APIs, does not read cookies or tokens, and does not run headless.

**Automating LinkedIn breaks LinkedIn's User Agreement and can get the account restricted or closed. Nothing in this extension removes that risk. You run it at your own risk.**

## Defaults

- Dry-run is on. Autonomous Easy Apply, auto-add, messages, and invitations are off until you turn each one on.
- About 12 Easy Apply submissions, 10 messages, and 8 invitations a day, under 70 invitations a week, about 120 page views a day, 6 actions an hour, 3 sessions a day.
- The first 14 days use a lower cap (about 30% on day one, full cap at the end of the second week).
- Actions wait 8–40 seconds. Applications wait 2–6 minutes. Reading time grows with the text. Typing sends keyboard and input events per character.
- Work happens on weekdays between 08:30 and 19:30 Europe/Paris, with random breaks. It does not run all night.
- One action queue. A second tab does not act in parallel.
- Captcha, unusual-activity, weekly invitation limit, restriction text, or a visible "429 / too many requests" page starts a 24–48 hour cooldown. Three errors in a row stop the rest of the day.
- Message text rotates through templates. The same text is not sent twice. One outbound message per thread. No message to someone who is not tied to an offer.

## Install

1. Build `coffre-linkedin.zip` with `npm run build:extension`, or download it from the GitHub release `extension-v1.0.0`.
2. Chrome or Edge: `chrome://extensions` or `edge://extensions`, turn on Developer mode, Load unpacked, and choose the unzipped folder. You can also drag the zip only after unzipping.
3. Firefox: `about:debugging#/runtime/this-firefox`, Load Temporary Add-on, and pick `manifest.json`.

Open the popup, set a passphrase, and keep the CRM tab https://dlnraja.github.io/job-crm/ open if you want status and offers to sync. The passphrase encrypts `chrome.storage.local` with the same AES-256-GCM / PBKDF2 scheme as the CRM. Gmail stays in the CRM's own Google sign-in; this extension does not ask LinkedIn or Google for tokens.
