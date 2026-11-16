function decode(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function strip(value) {
  return decode(String(value).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function first(html, pattern) {
  const match = html.match(pattern);
  return match ? strip(match[1]) : "";
}

export function extractJob(html, url = "") {
  const source = String(html ?? "");
  const idFromUrl = String(url).match(/jobs\/view\/(\d+)/);
  const idFromMarkup = source.match(/\/jobs\/view\/(\d+)/);
  const easy = /candidature simplifiée|easy apply/i.test(source);
  const salary = first(source, /class="[^"]*job-salary[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
    || (source.match(/(\d[\d\s]*\s?[–-]\s?\d[\d\s]*\s?(?:k€|€|eur))/i)?.[1] ?? "");
  return {
    id: idFromUrl?.[1] || idFromMarkup?.[1] || "",
    title: first(source, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
    company: first(source, /class="[^"]*job-company[^"]*"[^>]*>([\s\S]*?)<\/a>/i),
    companyUrl: source.match(/class="[^"]*job-company[^"]*"[^>]*href="([^"]+)"/i)?.[1]
      || source.match(/href="(https:\/\/www\.linkedin\.com\/company\/[^"]+)"/i)?.[1]
      || "",
    location: first(source, /class="[^"]*job-location[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
    salary: strip(salary),
    description: first(source, /id="job-details"[^>]*>([\s\S]*?)<\/div>/i),
    easyApply: easy,
    applyType: easy ? "easy_apply" : /postuler|apply/i.test(source) ? "external" : "unknown",
    posterName: first(source, /class="[^"]*job-poster[^"]*"[^>]*>([\s\S]*?)<\/a>/i),
    posterUrl: source.match(/class="[^"]*job-poster[^"]*"[^>]*href="([^"]+)"/i)?.[1] || "",
    url: String(url || ""),
  };
}

export function extractPeople(html) {
  const people = [];
  const seen = new Set();
  const source = String(html ?? "");
  const pattern = /<a[^>]*href="(https:\/\/www\.linkedin\.com\/in\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of source.matchAll(pattern)) {
    const url = match[1].split("?")[0];
    const name = strip(match[2]);
    if (!name || seen.has(url) || name.length > 80) continue;
    seen.add(url);
    const bits = name.split(/\s+/);
    people.push({
      name,
      firstName: bits[0] || "",
      lastName: bits.slice(1).join(" "),
      profileUrl: url,
    });
  }
  return people;
}

export function extractInterestLinks(html) {
  const source = String(html ?? "");
  const section = source.match(/offres susceptibles[\s\S]{0,6000}|jobs you may be interested in[\s\S]{0,6000}/i);
  if (!section) return [];
  return [...new Set([...section[0].matchAll(/\/jobs\/view\/(\d+)/g)].map((match) => match[1]))];
}

export function extractSearchCards(html) {
  const cards = [];
  const source = String(html ?? "");
  const chunks = source.split(/<article/i).slice(1);
  for (const chunk of chunks) {
    const job = extractJob(`<article${chunk}`, "");
    if (job.id || job.title) cards.push(job);
  }
  return cards;
}
