import assert from "node:assert/strict";
import test from "node:test";
import { applicationsToCsv } from "../src/lib/csv.mjs";
import { followUpFindings } from "../src/lib/followups.mjs";
import { computeKpis, deadlineItems, weekSeries } from "../src/lib/stats.mjs";
import { demoPlaintext } from "../scripts/demo-data.mjs";

test("kpis separate sent, open, interviews, refusals and replies", () => {
  const data = {
    applications: [
      { id: "a", dateApplied: "2026-11-01", status: "envoyee" },
      { id: "b", dateApplied: "2026-11-02", status: "en_cours" },
      { id: "c", dateApplied: "2026-11-03", status: "entretien" },
      { id: "d", dateApplied: "2026-11-04", status: "refus" },
      { id: "e", dateApplied: null, status: "prete" },
    ],
    followUps: [
      { applicationId: "a", delivery: "bounced", replyReceived: false },
      { applicationId: "b", delivery: "delivered", replyReceived: true },
    ],
  };
  const kpis = computeKpis(data);
  assert.equal(kpis.sent, 4);
  assert.equal(kpis.inProgress, 2);
  assert.equal(kpis.interviews, 1);
  assert.equal(kpis.refusals, 1);
  assert.equal(kpis.followUpsSent, 2);
  assert.equal(kpis.followUpsBounced, 1);
  assert.equal(kpis.responseRate, 0.75);
});

test("week series counts applications inside Monday weeks", () => {
  const series = weekSeries(
    [
      { dateApplied: "2026-11-10" },
      { dateApplied: "2026-11-12" },
      { dateApplied: "2026-10-01" },
      { dateApplied: null },
    ],
    new Date(2026, 10, 16),
    8,
  );
  assert.equal(series.length, 8);
  assert.equal(
    series.reduce((sum, row) => sum + row.count, 0),
    3,
  );
});

test("deadlines show future dates before recent past ones", () => {
  const items = deadlineItems(
    [
      { id: "late", nextActionDate: "2026-11-10" },
      { id: "soon", nextActionDate: "2026-11-21" },
      { id: "later", nextActionDate: "2026-12-01" },
    ],
    "2026-11-16",
  );
  assert.deepEqual(
    items.map((item) => item.application.id),
    ["soon", "later", "late"],
  );
  assert.equal(items[2].overdue, true);
});

test("follow-up rules flag a second send and an exact duplicate", () => {
  const findings = followUpFindings([
    {
      id: "1",
      applicationId: "app",
      date: "2026-11-14",
      subject: "Relance",
      to: ["a@nord.example"],
      cc: [],
      gmailMessageId: "same",
    },
    {
      id: "2",
      applicationId: "app",
      date: "2026-11-14",
      subject: "Relance",
      to: ["a@nord.example"],
      cc: [],
      gmailMessageId: "same",
    },
  ]);
  assert.deepEqual(
    findings.map((item) => item.code),
    ["one-per-offer", "duplicate", "duplicate-gmail"],
  );
});

test("demo vault trips the one-follow-up rule on purpose", () => {
  const findings = followUpFindings(demoPlaintext().followUps);
  assert.ok(findings.some((item) => item.code === "one-per-offer" && item.applicationId === "app_quai_2"));
  assert.ok(findings.some((item) => item.code === "duplicate"));
});

test("csv escapes quotes and keeps a header", () => {
  const csv = applicationsToCsv({
    companies: [{ id: "co", name: 'Phare, "Nord"' }],
    applications: [
      {
        companyId: "co",
        role: "Ligne\ndeux",
        location: "Lyon",
        salary: null,
        source: "linkedin",
        dateApplied: "2026-11-01",
        status: "envoyee",
        priority: "haute",
        urgency: "normale",
        nextAction: null,
        nextActionDate: null,
        offerUrl: null,
        linkedinJobUrl: null,
        cvFile: null,
        letterFile: null,
        notes: "ok",
      },
    ],
  });
  assert.ok(csv.startsWith("\uFEFFEntreprise,Poste"));
  assert.match(csv, /"Phare, ""Nord"""/);
  assert.match(csv, /"Ligne\ndeux"/);
});
