import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { answerQuestion, normalizeQuestion, rememberAnswer } from "../src/lib/easy-apply.mjs";
import { extractInterestLinks, extractJob, extractPeople } from "../src/lib/linkedin-extract.mjs";
import {
  classifyRecruiterMessage,
  isDuplicateText,
  mayContact,
  renderVariant,
} from "../src/lib/linkedin-messages.mjs";
import {
  DEFAULT_CAPS,
  actionDelayMs,
  applicationDelayMs,
  applyError,
  applyWarning,
  decide,
  effectiveCap,
  freshSafetyState,
  readingDelayMs,
  recordAction,
  safetySnapshot,
  typingDelayMs,
  warmupMultiplier,
  withinWorkingHours,
} from "../src/lib/linkedin-safety.mjs";
import { scoreOffer } from "../src/lib/linkedin-score.mjs";
import { textToPdf } from "../src/lib/pdf-text.mjs";

const wednesdayMorning = new Date("2026-11-18T10:00:00+01:00");

function openState(now = wednesdayMorning) {
  const state = freshSafetyState(now);
  state.dryRun = false;
  state.warmup = false;
  state.autonomous.easyApply = true;
  state.autonomous.messages.info = true;
  state.autonomous.invitations = true;
  return state;
}

test("extractor reads a fictional job card", async () => {
  const html = await readFile(new URL("./fixtures/linkedin-job.html", import.meta.url), "utf8");
  const job = extractJob(html, "https://www.linkedin.com/jobs/view/1000000099/");
  assert.equal(job.id, "1000000099");
  assert.equal(job.title, "Analyste risques fictifs");
  assert.equal(job.company, "Phare & Cie");
  assert.equal(job.location, "Lyon");
  assert.match(job.salary, /62/);
  assert.match(job.description, /documentaires/);
  assert.equal(job.easyApply, true);
  assert.equal(job.posterName, "Inès Morel");
  assert.match(job.posterUrl, /exemple-ines/);
  const people = extractPeople(html);
  assert.equal(people.length, 2);
  assert.equal(people[1].lastName, "Bernard");
  const interests = extractInterestLinks(
    `${html}<section>Offres susceptibles de vous intéresser <a href="/jobs/view/1000000100/">x</a></section>`,
  );
  assert.deepEqual(interests, ["1000000100"]);
});

test("score uses only saved profile words", () => {
  const result = scoreOffer("Analyse de risques et conformité pour un poste fictif", {
    skills: ["conformité"],
    achievements: ["Tableau de bord de risques"],
    experiences: [],
  });
  assert.ok(result.matched.includes("risques"));
  assert.ok(result.matched.includes("conformite"));
  assert.ok(result.score > 0);
  assert.equal(result.matched.includes("fictif"), false);
});

test("easy apply rules, learned answers, and unknown questions", () => {
  const profile = {
    email: "camille.martin@exemple.example",
    phone: "0600000000",
    salary: "60 k€",
    notice: "1 mois",
    nationality: "française",
    location: "Lyon",
    needsSponsorship: false,
    skillYears: { risques: 5 },
  };
  assert.equal(answerQuestion("Votre e-mail ?", profile).answer, profile.email);
  assert.equal(answerQuestion("Téléphone", profile).source, "rule");
  assert.equal(answerQuestion("Autorisation de travail / visa ?", profile).answer, "non");
  assert.equal(answerQuestion("Combien d'années d'expérience en risques ?", profile).answer, "5");
  const learned = rememberAnswer({}, "Avez-vous un permis B ?", "oui");
  assert.equal(answerQuestion("Avez-vous un permis B ?", profile, learned).source, "learned");
  assert.equal(normalizeQuestion("Avez-vous un permis B ?"), normalizeQuestion("avez vous un permis b"));
  assert.equal(answerQuestion("Quel est votre hobby préféré ?", profile).source, "unknown");
});

test("warm-up lowers the first days and weekday hours are enforced", () => {
  assert.ok(effectiveCap(DEFAULT_CAPS.easyApplyPerDay, 0) < DEFAULT_CAPS.easyApplyPerDay);
  assert.equal(effectiveCap(DEFAULT_CAPS.easyApplyPerDay, 13), DEFAULT_CAPS.easyApplyPerDay);
  assert.ok(effectiveCap(DEFAULT_CAPS.invitationsPerWeek, 0) < 80);
  assert.equal(warmupMultiplier(20), 1);
  const state = freshSafetyState(wednesdayMorning);
  assert.equal(withinWorkingHours(state, wednesdayMorning), true);
  assert.equal(withinWorkingHours(state, new Date("2026-11-18T08:00:00+01:00")), false);
  assert.equal(withinWorkingHours(state, new Date("2026-11-18T08:30:00+01:00")), true);
  assert.equal(withinWorkingHours(state, new Date("2026-11-18T19:31:00+01:00")), false);
  assert.equal(withinWorkingHours(state, new Date("2026-11-21T10:00:00+01:00")), false);
});

test("caps, hour cap, dry-run, kill switch, cooldown and three errors", () => {
  const state = openState();
  state.counts.easyApply = 12;
  assert.match(decide(state, "easyApply", wednesdayMorning).reason, /Plafond/);
  state.counts.easyApply = 0;
  state.hourWindow = Array.from({ length: 6 }, () => wednesdayMorning.toISOString());
  assert.match(decide(state, "pageView", wednesdayMorning).reason, /horaire/);
  state.hourWindow = [];
  state.dryRun = true;
  const preview = decide(state, "easyApply", wednesdayMorning, { autonomous: true });
  assert.equal(preview.allow, false);
  assert.equal(preview.preview, true);
  state.dryRun = false;
  state.killed = true;
  assert.match(decide(state, "pageView", wednesdayMorning).reason, /arrêt/i);
  state.killed = false;
  applyWarning(state, "captcha", wednesdayMorning, () => 0);
  assert.match(decide(state, "pageView", wednesdayMorning).reason, /Pause/);
  const later = new Date(wednesdayMorning.getTime() + 25 * 3600 * 1000);
  state.cooldownUntil = null;
  applyError(state, later);
  applyError(state, later);
  applyError(state, later);
  assert.match(decide(state, "pageView", later).reason, /journée/);
});

test("delays stay inside the human ranges", () => {
  assert.ok(actionDelayMs(() => 0) === 8000);
  assert.ok(actionDelayMs(() => 0.999) <= 40_000);
  assert.ok(applicationDelayMs(() => 0) === 120_000);
  assert.ok(applicationDelayMs(() => 1) <= 360_000 + 1000);
  assert.ok(readingDelayMs(10, () => 0) < readingDelayMs(2000, () => 0));
  assert.ok(typingDelayMs(() => 0) >= 40);
  assert.ok(typingDelayMs(() => 1) <= 200);
});

test("messages vary, never repeat, and stay tied to an offer", () => {
  assert.equal(classifyRecruiterMessage("Pouvez-vous passer un entretien jeudi ?"), "interview");
  assert.equal(classifyRecruiterMessage("Nous ne donnerons pas suite."), "refusal");
  assert.equal(classifyRecruiterMessage("InMail : une opportunité pour vous"), "inmail");
  assert.equal(classifyRecruiterMessage("Pourriez-vous préciser votre préavis ?"), "info");
  const first = renderVariant("info", { firstName: "Inès", role: "Analyste", company: "Phare", detail: "1 mois" }, []);
  const second = renderVariant("info", { firstName: "Inès", role: "Analyste", company: "Phare", detail: "1 mois" }, [first]);
  assert.ok(first);
  assert.notEqual(first, second);
  assert.equal(renderVariant("info", { firstName: "Inès", role: "Analyste", company: "Phare", detail: "1 mois" }, [first, second]), "");
  assert.equal(isDuplicateText(first, [first]), true);
  assert.equal(mayContact({ linkedApplicationId: "" }).ok, false);
  assert.equal(mayContact({ linkedApplicationId: "app", threadId: "t1", threadsReplied: { t1: true } }).ok, false);
  assert.equal(mayContact({ linkedApplicationId: "app", threadId: "t2", threadsReplied: {} }).ok, true);
});

test("a one-page pdf is produced for the letter", () => {
  const pdf = textToPdf("Bonjour Inès,\nLettre fictive.");
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.match(pdf, /Bonjour/);
  assert.match(pdf, /%%EOF/);
});

test("recording an action advances the counter and the next delay", () => {
  const state = openState();
  recordAction(state, "easyApply", wednesdayMorning, () => 0);
  const snap = safetySnapshot(state, wednesdayMorning);
  assert.match(snap.lines[0], /^Candidatures 1\//);
  assert.ok(Date.parse(state.nextAllowedAt) >= wednesdayMorning.getTime() + 120_000);
});

test("extension source stays off Voyager, cookies and headless", async () => {
  const root = new URL("../extension/", import.meta.url);
  const names = await readdir(root, { recursive: true });
  let blob = "";
  for (const name of names) {
    if (!/\.(js|json)$/.test(name)) continue;
    blob += await readFile(new URL(name, root), "utf8");
  }
  assert.equal(/voyager/i.test(blob), false);
  assert.equal(blob.includes("document.cookie"), false);
  assert.equal(blob.includes("chrome.cookies"), false);
  assert.equal(/headless/i.test(blob), false);
  assert.match(blob, /dryRun/);
});
