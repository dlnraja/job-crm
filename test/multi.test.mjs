import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canAccessUserPath } from "../src/lib/access.mjs";
import { isFirebaseConfigured, isGoogleClientConfigured } from "../src/lib/config.mjs";
import { planRefusalFollowUp } from "../src/lib/followup-drafts.mjs";
import { applyInboxPlans, classifyMessage, planInboxUpdates } from "../src/lib/gmail-classify.mjs";
import { buildPlainMessage, toBase64Url } from "../src/lib/gmail-mime.mjs";
import { renderCoverLetter, tokenize } from "../src/lib/letters.mjs";
import { jobsFromImportText, linkedinJobUrl, linkedinPeopleSearch } from "../src/lib/linkedin.mjs";
import { confidenceFor, lookupMx, parseMxResponse } from "../src/lib/mx.mjs";

test("firestore access follows the uid boundary", () => {
  assert.equal(canAccessUserPath("abc", "users/abc/vault/data"), true);
  assert.equal(canAccessUserPath("abc", "/users/abc"), true);
  assert.equal(canAccessUserPath("abc", "users/other/vault/data"), false);
  assert.equal(canAccessUserPath("", "users/abc/vault/data"), false);
  assert.equal(canAccessUserPath("abc", "vault/data"), false);
  assert.equal(canAccessUserPath("abc", "users/abc-extra/vault"), false);
});

test("rules file only grants the signed-in user their own tree", async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /request\.auth != null && request\.auth\.uid == uid/);
  assert.equal(rules.includes("allow read, write: if true"), false);
  assert.equal(rules.includes("allow read, write: if request.auth != null;"), false);
});

test("empty public config keeps the local vault mode", () => {
  assert.equal(isFirebaseConfigured({ apiKey: "", authDomain: "", projectId: "", appId: "" }), false);
  assert.equal(isFirebaseConfigured(null), false);
  assert.equal(
    isFirebaseConfigured({
      apiKey: "fake-api-key",
      authDomain: "demo.firebaseapp.com",
      projectId: "demo-coffre",
      appId: "1:1:web:abc",
    }),
    true,
  );
  assert.equal(isGoogleClientConfigured({ clientId: "" }), false);
  assert.equal(isGoogleClientConfigured({ clientId: "123-abc.apps.googleusercontent.com" }), true);
});

test("classifies confirmations, refusals, interviews and bounces without a model", () => {
  assert.equal(
    classifyMessage({ from: "jobs@phare.example", subject: "Nous avons bien reçu votre candidature", snippet: "" }).kind,
    "confirmation",
  );
  assert.equal(
    classifyMessage({
      from: "rh@quai.example",
      subject: "Suite à votre candidature",
      snippet: "Nous ne donnerons pas suite.",
    }).kind,
    "refusal",
  );
  assert.equal(
    classifyMessage({
      from: "rh@meridien.example",
      subject: "Entretien visio",
      snippet: "Pouvez-vous le 18/11/2026 à 9h ?",
    }).kind,
    "interview",
  );
  const bounce = classifyMessage({
    from: "Mailer-Daemon <mailer-daemon@phare.example>",
    subject: "Delivery Status Notification (Failure)",
    body: "Final-Recipient: rfc822; lea.morel@phare.example",
  });
  assert.equal(bounce.kind, "bounce");
  assert.equal(bounce.address, "lea.morel@phare.example");
});

test("inbox plans link a refusal to the company and mark a bounced address", () => {
  const data = {
    companies: [{ id: "co", name: "Phare & Cie", domain: "phare.example" }],
    applications: [
      {
        id: "app",
        companyId: "co",
        role: "Analyste",
        status: "envoyee",
        gmailMessageIds: [],
        events: [],
        interviews: [],
      },
    ],
    contacts: [{ id: "ct", email: "lea.morel@phare.example", emailStatus: "guessed", companyId: "co" }],
  };
  const plans = planInboxUpdates(
    [
      { id: "m1", from: "rh@phare.example", subject: "Phare & Cie", snippet: "We regret to inform you." },
      {
        id: "m2",
        from: "mailer-daemon@phare.example",
        subject: "Undeliverable",
        body: "Final-Recipient: rfc822; lea.morel@phare.example",
      },
    ],
    data,
  );
  const next = applyInboxPlans(data, plans, new Date("2026-11-16T12:00:00Z"));
  assert.equal(next.applications[0].status, "refus");
  assert.deepEqual(next.applications[0].gmailMessageIds, ["m1"]);
  assert.equal(next.contacts[0].emailStatus, "bounced");
  const again = applyInboxPlans(next, plans, new Date("2026-11-17T12:00:00Z"));
  assert.equal(again.applications[0].events.length, next.applications[0].events.length);
});

test("a refusal follow-up quotes the mail, CCs the no-reply address, and refuses a second one", () => {
  const application = { id: "app", role: "Analyste risques fictifs", companyId: "co" };
  const company = { id: "co", name: "Phare & Cie" };
  const contacts = [
    { companyId: "co", firstName: "Inès", email: "ines.morel@phare.example", emailStatus: "verified" },
    { companyId: "co", firstName: "Robot", email: "no-reply@phare.example", emailStatus: "published" },
  ];
  const draft = planRefusalFollowUp({
    application,
    company,
    contacts,
    followUps: [],
    profile: { fullName: "Camille Martin" },
    quote: "Nous ne donnerons pas suite.",
  });
  assert.equal(draft.ok, true);
  assert.deepEqual(draft.to, ["ines.morel@phare.example"]);
  assert.deepEqual(draft.cc, ["no-reply@phare.example"]);
  assert.match(draft.body, /Nous ne donnerons pas suite/);
  assert.match(draft.body, /Camille Martin/);
  assert.doesNotMatch(draft.body, /invent/i);
  const blocked = planRefusalFollowUp({
    application,
    company,
    contacts,
    followUps: [{ applicationId: "app", state: "draft" }],
    profile: { fullName: "Camille Martin" },
    quote: "",
  });
  assert.equal(blocked.ok, false);
});

test("cover letters use only profile facts and offer keywords", () => {
  const keywords = tokenize("Le poste demande une analyse de risques et un suivi de conformité. The and le de.");
  assert.equal(keywords.some((item) => item.token === "the" || item.token === "le"), false);
  assert.equal(keywords.some((item) => item.token === "risques"), true);
  const letter = renderCoverLetter({
    profile: {
      fullName: "Camille Martin",
      achievements: ["Tableau de bord de risques fictif"],
      skills: ["conformité"],
      experiences: [{ facts: ["Analyse de risques documentaires"] }],
    },
    offerText: "Nous cherchons une personne pour l'analyse de risques et la conformité.",
    role: "Analyste",
    company: "Phare & Cie",
  });
  assert.match(letter.text, /Analyse de risques documentaires/);
  assert.match(letter.text, /Camille Martin/);
  assert.equal(letter.text.includes("10 ans"), false);
  assert.match(letter.html, /xmlns:w="urn:schemas-microsoft-com:office:word"/);
  assert.ok(letter.keywords.includes("risques"));
});

test("linkedin helpers build public urls and ignore prose numbers", () => {
  assert.equal(linkedinJobUrl("1000000001"), "https://www.linkedin.com/jobs/view/1000000001/");
  assert.equal(
    linkedinJobUrl("https://www.linkedin.com/jobs/view/1000000002/?trk=1"),
    "https://www.linkedin.com/jobs/view/1000000002/",
  );
  assert.match(linkedinPeopleSearch("Phare & Cie", "recrutement RH"), /keywords=recrutement%20RH%20Phare%20%26%20Cie/);
  const jobs = jobsFromImportText("voir https://www.linkedin.com/jobs/view/1000000003/\n1000000004\nréunion 20261116 à 9h");
  assert.deepEqual(
    jobs.map((job) => job.id),
    ["1000000003", "1000000004"],
  );
});

test("mx parsing and confidence", async () => {
  assert.deepEqual(parseMxResponse({ Answer: [{ type: 15, data: "10 mx.phare.example." }] }), ["mx.phare.example"]);
  const calls = [];
  const result = await lookupMx("phare.example", async (url) => {
    calls.push(url);
    return { ok: true, json: async () => ({ Answer: [{ type: 15, data: "1 mx.phare.example." }] }) };
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const row = { support: 1, bounced: false };
  assert.ok(confidenceFor(row, 0, { ok: false }) < confidenceFor(row, 0, { ok: true }));
  assert.ok(confidenceFor({ support: 2, bounced: true }, 0, null) <= 12);
});

test("gmail mime is base64url and keeps the subject", () => {
  const raw = buildPlainMessage({
    to: ["ines.morel@phare.example"],
    cc: ["no-reply@phare.example"],
    subject: "Retour — candidature",
    body: "Bonjour Inès,",
  });
  assert.match(raw, /To: ines\.morel@phare\.example/);
  assert.match(raw, /Cc: no-reply@phare\.example/);
  const encoded = toBase64Url(raw);
  assert.equal(encoded.includes("+"), false);
  assert.equal(encoded.includes("/"), false);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
});
