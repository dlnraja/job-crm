import { foldToken } from "./letters.mjs";

export function classifyRecruiterMessage(text) {
  const folded = foldToken(text);
  if (/entretien|interview|creneau|disponibilit/.test(folded)) return "interview";
  if (/refus|ne donnerons pas suite|unfortunately|not moving forward|autre candidat/.test(folded)) return "refusal";
  if (/\binmail\b|opportunite pour vous|role that might interest/.test(folded)) return "inmail";
  if (/\?/.test(String(text)) || /pourriez vous|could you|merci de preciser|more information/.test(folded)) return "info";
  return "other";
}

export function normalizeOutbound(text) {
  return foldToken(text).replace(/[^a-z0-9]+/g, " ").trim();
}

export function isDuplicateText(text, previous = []) {
  const current = normalizeOutbound(text);
  if (!current) return true;
  return previous.some((item) => normalizeOutbound(item) === current);
}

const TEMPLATES = {
  interview: [
    "Bonjour {firstName}, merci pour votre message concernant {role}. Je suis disponible pour en parler.",
    "Bonjour {firstName}, l'échange que vous proposez pour {role} chez {company} m'intéresse. Quel moment vous arrange ?",
  ],
  refusal: [
    "Bonjour {firstName}, merci pour votre retour sur {role}. Je prends note de votre décision.",
    "Bonjour {firstName}, merci d'avoir pris le temps de me répondre au sujet de {role} chez {company}.",
  ],
  info: [
    "Bonjour {firstName}, voici la précision demandée pour {role} : {detail}",
    "Bonjour {firstName}, je complète ma candidature {role} chez {company} : {detail}",
  ],
  inmail: [
    "Bonjour {firstName}, merci pour votre message à propos de {role}. Je peux en discuter cette semaine.",
    "Bonjour {firstName}, le poste {role} chez {company} correspond à ce que je regarde. On peut en parler ?",
  ],
  invitation: [
    "Bonjour {firstName}, je vous contacte au sujet de {role} chez {company}.",
    "Bonjour {firstName}, votre nom apparaît sur l'offre {role}. Je me permets de me présenter.",
  ],
};

function fill(template, fields) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(fields?.[key] ?? "").trim());
}

export function renderVariant(category, fields, previous = []) {
  const templates = TEMPLATES[category] ?? [];
  for (const template of templates) {
    const text = fill(template, fields).replace(/\s+/g, " ").trim();
    if (!isDuplicateText(text, previous)) return text;
  }
  return "";
}

export function mayContact({ linkedApplicationId, threadId, threadsReplied = {} }) {
  if (!linkedApplicationId) return { ok: false, reason: "Aucun message vers une personne non liée à une offre." };
  if (threadId && threadsReplied[threadId]) return { ok: false, reason: "Un message a déjà été envoyé dans ce fil." };
  return { ok: true, reason: "" };
}
