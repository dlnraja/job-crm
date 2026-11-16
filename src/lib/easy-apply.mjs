import { foldToken } from "./letters.mjs";

export function normalizeQuestion(text) {
  return foldToken(text).replace(/[^a-z0-9]+/g, " ").trim();
}

function yearsFor(profile, question) {
  const table = profile?.skillYears ?? {};
  const entries = Object.entries(table);
  const hit = entries.find(([skill]) => question.includes(foldToken(skill)));
  if (hit) return String(hit[1]);
  if (profile?.yearsExperience != null && profile.yearsExperience !== "") return String(profile.yearsExperience);
  return "";
}

const RULES = [
  { id: "email", test: /\be mail\b|\bemail\b|\bcourriel\b/, pick: (profile) => profile?.email || "" },
  { id: "phone", test: /\btelephone\b|\bphone\b|\bmobile\b/, pick: (profile) => profile?.phone || "" },
  { id: "salary", test: /salaire|salary|pretention|remuneration/, pick: (profile) => profile?.salary || "" },
  { id: "notice", test: /preavis|notice|disponibilite/, pick: (profile) => profile?.notice || "" },
  { id: "nationality", test: /nationalite|nationality|citoyen/, pick: (profile) => profile?.nationality || "" },
  { id: "city", test: /\bville\b|\bcity\b|\blocalisation\b/, pick: (profile) => profile?.location || "" },
  {
    id: "sponsorship",
    test: /sponsorship|visa|autorisation de travail/,
    pick: (profile) => (profile?.needsSponsorship == null ? "" : profile.needsSponsorship ? "oui" : "non"),
  },
  { id: "years", test: /annees d experience|years of experience|combien d annees/, pick: yearsFor },
];

export function answerQuestion(question, profile = {}, learned = {}) {
  const key = normalizeQuestion(question);
  if (!key) return { answer: "", source: "unknown", key };
  if (learned[key]) return { answer: String(learned[key]), source: "learned", key };
  for (const rule of RULES) {
    if (!rule.test.test(key)) continue;
    const answer = rule.pick(profile, key);
    if (answer) return { answer: String(answer), source: "rule", key };
  }
  return { answer: "", source: "unknown", key };
}

export function rememberAnswer(learned, question, answer) {
  const key = normalizeQuestion(question);
  const value = String(answer ?? "").trim();
  if (!key || !value) return learned;
  return { ...learned, [key]: value };
}
