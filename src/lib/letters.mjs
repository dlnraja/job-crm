const STOPWORDS = new Set(
  `a about above after again all am an and any are as at be because been before being below between both but by can did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why with you your yours yourself yourselves
le la les de des du un une et ou en au aux pour avec dans sur par est sont ete être etre pas ne je tu il elle on nous vous ils elles ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs qui que quoi dont ou y plus moins tres très aussi comme sans sous entre vers chez dans d une d un au aux du des
candidature poste offre lettre madame monsieur cordialement bien`
    .split(/\s+/)
    .filter(Boolean),
);

export function foldToken(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

export function tokenize(text) {
  const counts = new Map();
  const tokens = foldToken(text).match(/[a-z][a-z0-9-]{2,}/g) ?? [];
  for (const token of tokens) {
    if (STOPWORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([token, count]) => ({ token, count }));
}

export function profileFacts(profile) {
  const facts = [];
  for (const achievement of profile?.achievements ?? []) {
    if (String(achievement).trim()) facts.push(String(achievement).trim());
  }
  for (const experience of profile?.experiences ?? []) {
    for (const fact of experience.facts ?? []) {
      if (String(fact).trim()) facts.push(String(fact).trim());
    }
  }
  for (const skill of profile?.skills ?? []) {
    if (String(skill).trim()) facts.push(String(skill).trim());
  }
  return facts;
}

function scoreFact(fact, keywords) {
  const folded = foldToken(fact);
  return keywords.reduce((sum, keyword) => sum + (folded.includes(keyword) ? 1 : 0), 0);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderCoverLetter({ profile, offerText, role, company }) {
  const keywords = tokenize(offerText).slice(0, 12).map((item) => item.token);
  const ranked = profileFacts(profile)
    .map((fact) => ({ fact, score: scoreFact(fact, keywords) }))
    .sort((a, b) => b.score - a.score || a.fact.localeCompare(b.fact));
  const chosen = ranked.filter((item) => item.score > 0).slice(0, 4);
  const facts = (chosen.length ? chosen : ranked.slice(0, 2)).map((item) => item.fact);
  const name = profile?.fullName?.trim() || "";
  const roleLabel = role?.trim() || "";
  const companyLabel = company?.trim() || "";
  const intro = roleLabel
    ? `Je vous écris au sujet du poste de ${roleLabel}${companyLabel ? ` chez ${companyLabel}` : ""}.`
    : `Je vous écris au sujet d'un poste${companyLabel ? ` chez ${companyLabel}` : ""}.`;
  const keywordLine = keywords.length
    ? `Les mots de l'offre qui recoupent ce que je peux étayer : ${keywords.slice(0, 8).join(", ")}.`
    : "L'offre collée ne contient pas assez de termes distincts pour un recoupement.";
  const factBlock = facts.length
    ? facts.map((fact) => `- ${fact}`).join("\n")
    : "- Aucun fait n'est encore saisi dans le profil. La lettre n'invente rien.";
  const text = [
    "Madame, Monsieur,",
    "",
    intro,
    "",
    "Je m'appuie uniquement sur les éléments suivants, déjà présents dans mon profil :",
    factBlock,
    "",
    keywordLine,
    "",
    "Je reste disponible pour en parler.",
    "",
    "Bien cordialement,",
    name,
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .trim();
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Lettre</title></head>
<body style="font-family:Calibri,sans-serif;font-size:11pt;line-height:1.4">
${text
  .split("\n")
  .map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`)
  .join("\n")}
</body>
</html>
`;
  return { text, html, keywords, facts };
}
