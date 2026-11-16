import { foldToken, profileFacts, tokenize } from "./letters.mjs";

export function scoreOffer(offerText, profile) {
  const keywords = tokenize(offerText).map((item) => item.token);
  const unique = [...new Set(keywords)].slice(0, 12);
  const factTokens = new Set(tokenize(profileFacts(profile).join(" ")).map((item) => item.token));
  const skills = (profile?.skills ?? []).map((skill) => foldToken(skill));
  const matched = [];
  for (const token of unique) {
    if (factTokens.has(token) || skills.some((skill) => skill.includes(token))) matched.push(token);
  }
  const score = unique.length ? Math.round((matched.length / unique.length) * 100) : 0;
  return { score, matched };
}
