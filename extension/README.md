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

The built archive is committed at [`extension/dist/coffre-linkedin.zip`](dist/coffre-linkedin.zip). The release workflow rebuilds it and, when the bytes change, commits that same path. The GitHub release `extension-v1.0.0` uploads that file as well: https://github.com/dlnraja/job-crm/releases/download/extension-v1.0.0/coffre-linkedin.zip

1. Unzip `extension/dist/coffre-linkedin.zip`.
2. Chrome or Edge: open `chrome://extensions` or `edge://extensions`, turn on Developer mode, choose **Load unpacked**, and select the unzipped folder.
3. Firefox 128+: open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and pick `manifest.json` inside the unzipped folder.

Open the popup, set a passphrase, and keep the CRM tab https://dlnraja.github.io/job-crm/ open if you want status and offers to sync. The passphrase encrypts `chrome.storage.local` with the same AES-256-GCM / PBKDF2 scheme as the CRM. Gmail stays in the CRM's own Google sign-in; this extension does not ask LinkedIn or Google for tokens.
