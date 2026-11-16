export function linkedinJobUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const fromUrl = text.match(/linkedin\.com\/jobs\/view\/(\d+)/i);
  if (fromUrl) return `https://www.linkedin.com/jobs/view/${fromUrl[1]}/`;
  if (/^\d{6,}$/.test(text)) return `https://www.linkedin.com/jobs/view/${text}/`;
  return "";
}

export function linkedinPeopleSearch(company, role = "recrutement RH") {
  const keywords = [role, company].map((part) => String(part ?? "").trim()).filter(Boolean).join(" ");
  if (!keywords) return "";
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
}

export function extractLinkedinJobIds(text) {
  const ids = new Set();
  const source = String(text ?? "");
  for (const match of source.matchAll(/linkedin\.com\/jobs\/view\/(\d+)/gi)) ids.add(match[1]);
  for (const line of source.split(/\n+/)) {
    const trimmed = line.trim();
    if (/^\d{8,12}$/.test(trimmed)) ids.add(trimmed);
  }
  return [...ids];
}

export function jobsFromImportText(text) {
  const urls = [];
  const seen = new Set();
  for (const id of extractLinkedinJobIds(text)) {
    const url = linkedinJobUrl(id);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push({ id, url });
  }
  return urls;
}
