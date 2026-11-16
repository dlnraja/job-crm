const STYLE_ORDER = ["compact", "hyphened", "dotted", "underscored"];

export const PATTERN_IDS = [
  "first.last",
  "f.last",
  "flast",
  "firstlast",
  "first_last",
  "first-last",
  "last.first",
  "first",
  "last",
  "f_last",
  "f-last",
  "last_first",
  "last-first",
  "lastfirst",
  "firstl",
  "first.l",
  "l.first",
];

export const DEFAULT_PATTERNS = PATTERN_IDS;

/** @type {Record<string, string>} */
export const PATTERN_LABELS = {
  "first.last": "prénom.nom",
  "f.last": "p.nom",
  "flast": "pnom",
  firstlast: "prénommom",
  first_last: "prénom_nom",
  "first-last": "prénom-nom",
  "last.first": "nom.prénom",
  first: "prénom",
  last: "nom",
  f_last: "p_nom",
  "f-last": "p-nom",
  last_first: "nom_prénom",
  "last-first": "nom-prénom",
  lastfirst: "nomprénom",
  firstl: "prénomm",
  "first.l": "prénom.n",
  "l.first": "n.prénom",
};

export function fold(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae");
}

function forms(raw) {
  if (typeof raw !== "string") return null;
  const parts = fold(raw)
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (!parts.length) return null;
  return {
    compact: parts.join(""),
    hyphened: parts.join("-"),
    dotted: parts.join("."),
    underscored: parts.join("_"),
    initial: parts[0][0],
  };
}

function apply(pattern, firstForm, lastForm, firstInitial, lastInitial) {
  switch (pattern) {
    case "first.last":
      return `${firstForm}.${lastForm}`;
    case "first-last":
      return `${firstForm}-${lastForm}`;
    case "first_last":
      return `${firstForm}_${lastForm}`;
    case "firstlast":
      return `${firstForm}${lastForm}`;
    case "flast":
      return `${firstInitial}${lastForm}`;
    case "f.last":
      return `${firstInitial}.${lastForm}`;
    case "f-last":
      return `${firstInitial}-${lastForm}`;
    case "f_last":
      return `${firstInitial}_${lastForm}`;
    case "first":
      return firstForm;
    case "last":
      return lastForm;
    case "last.first":
      return `${lastForm}.${firstForm}`;
    case "last-first":
      return `${lastForm}-${firstForm}`;
    case "last_first":
      return `${lastForm}_${firstForm}`;
    case "lastfirst":
      return `${lastForm}${firstForm}`;
    case "firstl":
      return `${firstForm}${lastInitial}`;
    case "first.l":
      return `${firstForm}.${lastInitial}`;
    case "l.first":
      return `${lastInitial}.${firstForm}`;
    default:
      return "";
  }
}

function patternLocals(pattern, first, last) {
  const locals = [];
  for (const style of STYLE_ORDER) {
    const local = apply(pattern, first[style], last[style], first.initial, last.initial);
    if (local && !locals.includes(local)) locals.push(local);
  }
  return locals;
}

function localPart(email) {
  if (typeof email !== "string") return "";
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return "";
  return trimmed.slice(0, at);
}

function bestStyle(pattern, samples) {
  const counts = Object.fromEntries(STYLE_ORDER.map((style) => [style, 0]));
  for (const sample of samples) {
    const local = localPart(sample.email);
    const first = forms(sample.firstName);
    const last = forms(sample.lastName);
    if (!local || !first || !last) continue;
    for (const style of STYLE_ORDER) {
      if (apply(pattern, first[style], last[style], first.initial, last.initial) === local) {
        counts[style] += 1;
      }
    }
  }
  return STYLE_ORDER.reduce(
    (best, style) => (counts[style] > counts[best] ? style : best),
    "compact",
  );
}

function orderedLocals(pattern, first, last, preferred) {
  const styles = [preferred, ...STYLE_ORDER.filter((style) => style !== preferred)];
  const locals = [];
  for (const style of styles) {
    const local = apply(pattern, first[style], last[style], first.initial, last.initial);
    if (local && !locals.includes(local)) locals.push(local);
  }
  return locals.slice(0, 2);
}

function normalizeDomain(domain) {
  return String(domain ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}

/**
 * @param {{
 *   firstName?: string,
 *   lastName?: string,
 *   domain?: string,
 *   samples?: Array<{ firstName: string, lastName: string, email: string }>,
 *   bouncedPatterns?: string[],
 * }} [input]
 */
export function guessEmails({
  firstName,
  lastName,
  domain,
  samples = [],
  bouncedPatterns = [],
} = {}) {
  const targetFirst = forms(firstName);
  const targetLast = forms(lastName);
  const host = normalizeDomain(domain);
  if (!targetFirst || !targetLast || !host || host.includes("@") || /\s/.test(host)) return [];

  const sampleList = (Array.isArray(samples) ? samples : []).filter(
    (sample) => localPart(sample?.email) && forms(sample?.firstName) && forms(sample?.lastName),
  );
  const bounced = new Set(Array.isArray(bouncedPatterns) ? bouncedPatterns : []);
  const support = new Map(PATTERN_IDS.map((id) => [id, 0]));

  for (const sample of sampleList) {
    const local = localPart(sample.email);
    const first = forms(sample.firstName);
    const last = forms(sample.lastName);
    for (const pattern of PATTERN_IDS) {
      if (patternLocals(pattern, first, last).includes(local)) {
        support.set(pattern, support.get(pattern) + 1);
      }
    }
  }

  const detected = PATTERN_IDS.filter((pattern) => support.get(pattern) > 0).sort((a, b) => {
    const delta = support.get(b) - support.get(a);
    if (delta) return delta;
    return DEFAULT_PATTERNS.indexOf(a) - DEFAULT_PATTERNS.indexOf(b);
  });
  const ordered = detected.length
    ? [...detected, ...DEFAULT_PATTERNS.filter((pattern) => !detected.includes(pattern))]
    : [...DEFAULT_PATTERNS];

  const rows = [];
  const seen = new Set();
  ordered.forEach((pattern, index) => {
    const count = support.get(pattern) ?? 0;
    const locals = orderedLocals(pattern, targetFirst, targetLast, bestStyle(pattern, sampleList));
    locals.forEach((local, localIndex) => {
      const email = `${local}@${host}`;
      if (seen.has(email)) return;
      seen.add(email);
      const base = count > 0 ? 1000 + count * 10 : 100;
      rows.push({
        email,
        local,
        pattern,
        support: count,
        bounced: bounced.has(pattern),
        score: base - index * 2 - localIndex,
        reason:
          count > 0
            ? `Observé sur ${count} adresse${count > 1 ? "s" : ""} connue${count > 1 ? "s" : ""}`
            : "Hypothèse fréquente, aucun modèle confirmé",
      });
    });
  });

  rows.sort((a, b) => b.score - a.score || a.email.localeCompare(b.email));
  return rows;
}
