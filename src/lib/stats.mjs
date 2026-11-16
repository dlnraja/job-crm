import { GROUP_ORDER, STATUS_ORDER } from "./labels.mjs";

const OPEN_STATUSES = new Set(["envoyee", "en_cours"]);
const RESPONDED_STATUSES = new Set(["en_cours", "entretien", "refus", "offre"]);
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function localISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function startOfWeek(date) {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = day.getDay();
  const delta = weekday === 0 ? 6 : weekday - 1;
  day.setDate(day.getDate() - delta);
  day.setHours(0, 0, 0, 0);
  return day;
}

export function isSent(application) {
  return Boolean(application?.dateApplied);
}

export function hasReply(application, followUps) {
  if (RESPONDED_STATUSES.has(application.status)) return true;
  return followUps.some((item) => item.applicationId === application.id && item.replyReceived);
}

export function computeKpis(data) {
  const applications = data.applications ?? [];
  const followUps = (data.followUps ?? []).filter((item) => item.state !== "draft");
  const sent = applications.filter(isSent);
  const responded = sent.filter((application) => hasReply(application, followUps));
  return {
    sent: sent.length,
    inProgress: applications.filter((application) => OPEN_STATUSES.has(application.status)).length,
    interviews: applications.filter((application) => application.status === "entretien").length,
    refusals: applications.filter((application) => application.status === "refus").length,
    followUpsSent: followUps.length,
    followUpsBounced: followUps.filter((item) => item.delivery === "bounced").length,
    responseRate: sent.length ? responded.length / sent.length : null,
  };
}

export function statusCounts(applications) {
  const counts = new Map(STATUS_ORDER.map((status) => [status, 0]));
  for (const application of applications) {
    counts.set(application.status, (counts.get(application.status) ?? 0) + 1);
  }
  return STATUS_ORDER.map((status) => ({ status, count: counts.get(status) ?? 0 })).filter(
    (row) => row.count > 0,
  );
}

export function weekSeries(applications, now = new Date(), weeks = 8) {
  const start = startOfWeek(now);
  const buckets = [];
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const day = new Date(start);
    day.setDate(day.getDate() - index * 7);
    buckets.push({
      start: day,
      label: `${day.getDate()} ${MONTHS[day.getMonth()]}`,
      count: 0,
    });
  }
  for (const application of applications) {
    const applied = parseISODate(application.dateApplied);
    if (!applied) continue;
    for (const bucket of buckets) {
      const end = new Date(bucket.start);
      end.setDate(end.getDate() + 7);
      if (applied >= bucket.start && applied < end) bucket.count += 1;
    }
  }
  return buckets.map(({ label, count }) => ({ label, count }));
}

export function applicationsByGroup(data) {
  const counts = new Map(GROUP_ORDER.map((group) => [group, 0]));
  for (const application of data.applications ?? []) {
    const company = (data.companies ?? []).find((item) => item.id === application.companyId);
    const group = counts.has(company?.group) ? company.group : "autre";
    counts.set(group, counts.get(group) + 1);
  }
  return GROUP_ORDER.map((group) => ({ group, count: counts.get(group) ?? 0 }));
}

export function deadlineItems(applications, todayISO) {
  const rows = applications
    .filter((application) => typeof application.nextActionDate === "string" && application.nextActionDate)
    .map((application) => ({
      application,
      date: application.nextActionDate,
      overdue: application.nextActionDate < todayISO,
    }));
  const future = rows.filter((row) => !row.overdue).sort((a, b) => a.date.localeCompare(b.date));
  const past = rows.filter((row) => row.overdue).sort((a, b) => b.date.localeCompare(a.date));
  return [...future, ...past].slice(0, 5);
}

export function interviewItems(applications, now = new Date()) {
  const horizon = now.getTime() - 21 * 24 * 60 * 60 * 1000;
  const rows = [];
  for (const application of applications) {
    for (const interview of application.interviews ?? []) {
      const at = new Date(interview.at);
      if (Number.isNaN(at.getTime()) || at.getTime() < horizon) continue;
      rows.push({ application, interview, at, upcoming: at.getTime() >= now.getTime() });
    }
  }
  const upcoming = rows.filter((row) => row.upcoming).sort((a, b) => a.at - b.at);
  const past = rows.filter((row) => !row.upcoming).sort((a, b) => b.at - a.at);
  return [...upcoming, ...past].slice(0, 5);
}

export function recentActivity(data, limit = 8) {
  const rows = [];
  for (const application of data.applications ?? []) {
    const company = (data.companies ?? []).find((item) => item.id === application.companyId);
    for (const event of application.events ?? []) {
      rows.push({
        id: event.id,
        at: event.at,
        summary: event.summary,
        applicationId: application.id,
        role: application.role,
        company: company?.name ?? "",
      });
    }
  }
  rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return rows.slice(0, limit);
}
