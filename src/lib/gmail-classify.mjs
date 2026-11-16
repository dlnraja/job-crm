import { foldToken } from "./letters.mjs";

const REFUSAL = [
  /ne (?:donnerons|pouvons) pas suite/i,
  /n['’ ]a pas ete retenue/i,
  /not (?:be )?moving forward/i,
  /we regret/i,
  /unfortunately/i,
  /other candidates/i,
  /autre candidat/i,
  /position has been filled/i,
  /\brefus\b/i,
];

const INTERVIEW = [/entretien/i, /interview/i, /creneau/i, /\bvisio\b/i];
const CONFIRM = [
  /candidature (?:a|à) bien ete/i,
  /avons bien recu/i,
  /thank you for applying/i,
  /application has been (?:received|submitted)/i,
  /accuse de reception/i,
  /we have received your application/i,
  /votre candidature a ete envoyee/i,
];

function blobOf(message) {
  return foldToken(`${message.from ?? ""}\n${message.subject ?? ""}\n${message.snippet ?? ""}\n${message.body ?? ""}`);
}

export function isBounce(message) {
  const from = foldToken(message.from ?? "");
  const subject = foldToken(message.subject ?? "");
  return (
    from.includes("mailer-daemon") ||
    from.includes("postmaster") ||
    /delivery status|undeliverable|failure notice|mail delivery failed|echec de distribution/.test(subject)
  );
}

export function extractBouncedAddress(message) {
  const raw = `${message.body ?? ""}\n${message.snippet ?? ""}\n${message.subject ?? ""}`;
  const finalRecipient = raw.match(/Final-Recipient:\s*rfc822;\s*<?([^\s<>]+@[^\s<>]+)>?/i);
  if (finalRecipient) return finalRecipient[1].toLowerCase();
  const wrapped = raw.match(/<([^\s<>]+@[^\s<>]+)>/);
  return wrapped ? wrapped[1].toLowerCase() : "";
}

function excerpt(message) {
  const source = String(message.snippet || message.body || "").replace(/\s+/g, " ").trim();
  return source.slice(0, 240);
}

function interviewWhen(message) {
  const source = `${message.subject ?? ""} ${message.snippet ?? ""} ${message.body ?? ""}`;
  const numeric = source.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (!numeric) return "";
  const year = numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3];
  return `${year}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
}

export function classifyMessage(message) {
  const text = blobOf(message);
  if (isBounce(message)) {
    return { kind: "bounce", quote: excerpt(message), when: "", address: extractBouncedAddress(message) };
  }
  if (REFUSAL.some((pattern) => pattern.test(text))) {
    return { kind: "refusal", quote: excerpt(message), when: "", address: "" };
  }
  if (INTERVIEW.some((pattern) => pattern.test(text))) {
    return { kind: "interview", quote: excerpt(message), when: interviewWhen(message), address: "" };
  }
  if (CONFIRM.some((pattern) => pattern.test(text))) {
    return { kind: "confirmation", quote: excerpt(message), when: "", address: "" };
  }
  return { kind: "other", quote: "", when: "", address: "" };
}

export function matchApplication(message, data) {
  const text = foldToken(`${message.from ?? ""} ${message.subject ?? ""} ${message.snippet ?? ""} ${message.body ?? ""}`);
  let best = null;
  let bestLength = 0;
  for (const application of data.applications ?? []) {
    const company = (data.companies ?? []).find((item) => item.id === application.companyId);
    const needles = [company?.name, company?.domain, application.role].filter(Boolean).map(foldToken);
    for (const needle of needles) {
      if (needle.length < 3 || !text.includes(needle)) continue;
      if (needle.length > bestLength) {
        best = application;
        bestLength = needle.length;
      }
    }
  }
  return best;
}

/**
 * @param {Array<{ id: string, from?: string, subject?: string, snippet?: string, body?: string }>} messages
 * @param {{ applications?: any[], companies?: any[], contacts?: any[] }} data
 * @returns {Array<
 *   | { type: "bounce", gmailId: string, email: string, quote: string }
 *   | { type: "unmatched", kind: string, subject: string, gmailId: string }
 *   | { type: "application", applicationId: string, kind: string, gmailId: string, quote: string, when: string }
 * >}
 */
export function planInboxUpdates(messages, data) {
  const plans = [];
  for (const message of messages) {
    const classified = classifyMessage(message);
    if (classified.kind === "other") continue;
    if (classified.kind === "bounce") {
      plans.push({
        type: "bounce",
        gmailId: message.id,
        email: classified.address,
        quote: classified.quote,
      });
      continue;
    }
    const application = matchApplication(message, data);
    if (!application) {
      plans.push({ type: "unmatched", kind: classified.kind, subject: message.subject ?? "", gmailId: message.id });
      continue;
    }
    plans.push({
      type: "application",
      applicationId: application.id,
      kind: classified.kind,
      gmailId: message.id,
      quote: classified.quote,
      when: classified.when,
    });
  }
  return plans;
}

function canApply(status, kind) {
  if (kind === "confirmation") return status === "a_preparer" || status === "prete";
  if (kind === "refusal") return status !== "offre";
  if (kind === "interview") return status !== "refus" && status !== "offre";
  return false;
}

export function applyInboxPlans(data, plans, now = new Date()) {
  const next = structuredClone(data);
  const at = now.toISOString();
  for (const plan of plans) {
    if (plan.type === "bounce" && plan.email) {
      for (const contact of next.contacts ?? []) {
        if (String(contact.email ?? "").toLowerCase() === plan.email.toLowerCase()) contact.emailStatus = "bounced";
      }
      continue;
    }
    if (plan.type !== "application") continue;
    const application = (next.applications ?? []).find((item) => item.id === plan.applicationId);
    if (!application) continue;
    application.gmailMessageIds = application.gmailMessageIds ?? [];
    if (application.gmailMessageIds.includes(plan.gmailId)) continue;
    application.gmailMessageIds.push(plan.gmailId);
    if (canApply(application.status, plan.kind)) {
      if (plan.kind === "confirmation") {
        application.status = "envoyee";
        if (!application.dateApplied) application.dateApplied = at.slice(0, 10);
      } else if (plan.kind === "refusal") application.status = "refus";
      else if (plan.kind === "interview") {
        application.status = "entretien";
        if (plan.when) {
          application.interviews = application.interviews ?? [];
          application.interviews.push({
            id: `int_${plan.gmailId}`,
            kind: "screening",
            at: `${plan.when}T09:00:00`,
            with: "À confirmer",
            location: "",
            notes: plan.quote,
          });
        }
      }
    }
    application.events = application.events ?? [];
    const labels = { confirmation: "Accusé de réception", refusal: "Refus", interview: "Invitation à un entretien" };
    const label = labels[plan.kind] ?? "Message";
    application.events.push({
      id: `in_${plan.gmailId}`,
      at,
      kind: plan.kind,
      summary: plan.quote ? `${label} — ${plan.quote}` : `${label} lié depuis Gmail.`,
    });
  }
  next.updatedAt = at;
  return next;
}
