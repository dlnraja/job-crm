# Plaintext `data.json` schema

The browser never stores this file. `scripts/encrypt.mjs` reads it, derives an AES-256-GCM key, and writes `data/data.enc.json`. Only the envelope is committed.

The key is PBKDF2-SHA256 (≥ 600 000 iterations) over the UTF-8 bytes of `NFC(trim(auth.username)) + NUL + password`. The password is not trimmed. A wrong username or a wrong password fails authentication the same way.

## Envelope (committed file)

| Field | Meaning |
| --- | --- |
| `v` | `1` |
| `alg` | `AES-256-GCM` |
| `kdf` | `PBKDF2-SHA256` |
| `iterations` | integer from 600000 to 2000000 |
| `salt` | base64, 16 bytes |
| `iv` | base64, 12 bytes |
| `tag` | base64, 16 bytes (GCM tag, stored separately from the ciphertext) |
| `ciphertext` | base64 ciphertext of the UTF-8 JSON payload |

`salt`, `iv` and `tag` are header fields. The username is not in the header. It lives inside the ciphertext as `auth.username`, and it is also mixed into the KDF.

## Payload

```ts
{
  schemaVersion: 1,
  updatedAt: string,          // ISO-8601
  auth: { username: string }, // required, non-empty after trim
  companies: Company[],
  contacts: Contact[],
  applications: Application[],
  followUps: FollowUp[],
  emailSamples: EmailSample[],
  bouncedPatterns: BouncedPattern[]
}
```

### Company

| Field | Type | UI |
| --- | --- | --- |
| `id` | string | |
| `name` | string | Entreprise |
| `domain` | string | domaine du devineur, sans `@` |
| `group` | `cac40` \| `sbf120` \| `sp500` \| `public` \| `autre` | CAC 40, SBF 120, S&P 500, Secteur public, Autre |
| `sector` | string, optional | |

### Contact

| Field | Type | UI |
| --- | --- | --- |
| `id` | string | |
| `firstName`, `lastName` | string | Nom |
| `role` | string | Rôle |
| `companyId` | string | Entreprise |
| `linkedinUrl` | string or null | |
| `email` | string or null | E-mail |
| `emailStatus` | `published` \| `guessed` \| `verified` \| `bounced` | Publiée, Devinée, Vérifiée, Rebond |
| `sourceNote` | string or null | comment l'adresse a été obtenue |
| `applicationIds` | string[] | dossiers liés |

### Application

One row in Suivi.

| Field | Type | UI |
| --- | --- | --- |
| `id` | string | |
| `companyId` | string | Entreprise |
| `role` | string | Poste |
| `location` | string | Lieu |
| `zone` | string, optional | filtre libre (IDF, Lille, …) |
| `remote` | string or null | télétravail |
| `salary` | string or null | Salaire, tel qu'affiché |
| `source` | `linkedin` \| `welcome_to_the_jungle` \| `career_site` \| `public_sector` | LinkedIn, Welcome to the Jungle, Site carrière, Secteur public |
| `datePublished` | `YYYY-MM-DD` or null | |
| `dateApplied` | `YYYY-MM-DD` or null | Date. Vide = pas encore envoyée |
| `status` | `a_preparer` \| `prete` \| `envoyee` \| `en_cours` \| `entretien` \| `refus` \| `offre` | À préparer, Prête à envoyer, Envoyée, En cours, Entretien, Refus, Offre |
| `priority` | `haute` \| `moyenne` \| `basse` | Priorité |
| `urgency` | `haute` \| `normale` \| `basse` | Urgence |
| `nextAction` | string or null | Prochaine action |
| `nextActionDate` | `YYYY-MM-DD` or null | Échéance |
| `offerUrl` | string or null | lien Offre |
| `linkedinJobUrl` | string or null | lien LinkedIn |
| `gmailMessageIds` | string[] | chaque id devient `https://mail.google.com/mail/u/0/#all/<id>` |
| `cvFile`, `letterFile` | string or null | noms de fichiers, pas leur contenu |
| `contactIds` | string[] | |
| `notes` | string or null | |
| `score` | number or null | note d'adéquation optionnelle |
| `fitNote` | string or null | |
| `interviews` | Interview[] | |
| `events` | Event[] | chronologie |

Interview: `{ id, kind: "screening" \| "rh" \| "manager" \| "final", at: ISO-8601, with, location, notes }`.

Event: `{ id, at: ISO-8601, kind, summary }`. The screen also folds interviews and follow-ups into the same feed.

### Follow-up

| Field | Type |
| --- | --- |
| `id` | string |
| `applicationId` | string |
| `date` | `YYYY-MM-DD` |
| `to`, `cc` | string[] |
| `subject` | string |
| `gmailMessageId` | string or null |
| `delivery` | `delivered` \| `bounced` |
| `replyReceived` | boolean |

Rules checked in the UI: at most one follow-up per application; no second row with the same application, date, subject, to and cc; a Gmail id is not reused.

### Email sample and bounced pattern

```json
{ "id": "sm_1", "companyId": "co_phare", "firstName": "Hugo", "lastName": "Bernard", "email": "hugo.bernard@phare.example", "note": "Page fictive." }
{ "companyId": "co_phare", "pattern": "flast" }
```

Pattern ids understood by the guesser: `first.last`, `f.last`, `flast`, `firstlast`, `first_last`, `first-last`, `last.first`, `first`, `last`, `f_last`, `f-last`, `last_first`, `last-first`, `lastfirst`, `firstl`, `first.l`, `l.first`.

## KPI definitions

- **Candidatures envoyées**: `dateApplied` is set.
- **En cours**: status `envoyee` or `en_cours` (interview stage is separate).
- **Entretiens**: status `entretien`.
- **Refus**: status `refus`.
- **Relances envoyées / en rebond**: rows in `followUps`, and those with `delivery: "bounced"`.
- **Taux de réponse**: among sent applications, the share whose status is `en_cours`, `entretien`, `refus` or `offre`, or that has a follow-up with `replyReceived: true`.

## Fictional example

The committed demo vault is this document encrypted with username `demo` and password `demo-only-public`. A minimal payload:

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-11-16T09:00:00.000Z",
  "auth": { "username": "demo" },
  "companies": [
    {
      "id": "co_phare",
      "name": "Phare & Cie",
      "domain": "phare.example",
      "group": "cac40",
      "sector": "Industrie fictive"
    }
  ],
  "contacts": [
    {
      "id": "ct_ines",
      "firstName": "Inès",
      "lastName": "Morel",
      "role": "Talent partner",
      "companyId": "co_phare",
      "linkedinUrl": "https://www.linkedin.com/in/exemple-ines-morel",
      "email": "ines.morel@phare.example",
      "emailStatus": "verified",
      "sourceNote": "Signature d'un message d'exemple.",
      "applicationIds": ["app_phare"]
    }
  ],
  "emailSamples": [
    {
      "id": "sm_hugo",
      "companyId": "co_phare",
      "firstName": "Hugo",
      "lastName": "Bernard",
      "email": "hugo.bernard@phare.example",
      "note": "Page commerciale fictive."
    }
  ],
  "bouncedPatterns": [{ "companyId": "co_phare", "pattern": "flast" }],
  "applications": [
    {
      "id": "app_phare",
      "companyId": "co_phare",
      "role": "Responsable risques fictifs",
      "location": "Lyon",
      "zone": "Autre",
      "remote": "2 j/sem.",
      "salary": "62–70 k€",
      "source": "linkedin",
      "datePublished": "2026-09-28",
      "dateApplied": "2026-10-06",
      "status": "entretien",
      "priority": "haute",
      "urgency": "haute",
      "nextAction": "Préparer la pré-qualification",
      "nextActionDate": "2026-11-18",
      "offerUrl": "https://carrieres.phare.example/jobs/risques-fictifs",
      "linkedinJobUrl": "https://www.linkedin.com/jobs/view/1000000001/",
      "gmailMessageIds": ["demomsgphare0001"],
      "cvFile": "CV_Phare_exemple.pdf",
      "letterFile": "Lettre_Phare_exemple.pdf",
      "contactIds": ["ct_ines"],
      "notes": "Dossier fictif.",
      "score": 78,
      "fitNote": "Exemple de note d'adéquation.",
      "interviews": [
        {
          "id": "int_phare_screen",
          "kind": "screening",
          "at": "2026-11-18T09:30:00+01:00",
          "with": "Inès Morel",
          "location": "Visio",
          "notes": "Pré-qualification de 30 minutes."
        }
      ],
      "events": [
        {
          "id": "ev_phare_1",
          "at": "2026-10-06T08:12:00+01:00",
          "kind": "applied",
          "summary": "Candidature envoyée via LinkedIn."
        }
      ]
    }
  ],
  "followUps": [
    {
      "id": "fu_quai",
      "applicationId": "app_phare",
      "date": "2026-11-03",
      "to": ["ines.morel@phare.example"],
      "cc": [],
      "subject": "Suite à ma candidature",
      "gmailMessageId": "demomsgrelance0001",
      "delivery": "delivered",
      "replyReceived": true
    }
  ]
}
```

The fuller fictional seed used for the committed vault is `scripts/demo-data.mjs`. It is example data, not a personal export.
