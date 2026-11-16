export function parseMxResponse(payload) {
  const answers = payload?.Answer || payload?.answer || [];
  const hosts = [];
  for (const item of answers) {
    const type = item?.type ?? item?.Type;
    if (type !== 15 && String(type).toUpperCase() !== "MX") continue;
    const data = String(item.data || item.rdata || "").trim();
    const host = data.split(/\s+/).pop()?.replace(/\.$/, "") || "";
    if (host) hosts.push(host.toLowerCase());
  }
  return hosts;
}

export async function lookupMx(domain, fetchImpl = globalThis.fetch) {
  const name = String(domain ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
  if (!name || /[\s/]/.test(name) || !name.includes(".")) {
    return { ok: false, hosts: [], error: "domaine" };
  }
  const endpoints = [
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=MX`,
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=MX`,
  ];
  let lastError = "introuvable";
  for (const url of endpoints) {
    try {
      const response = await fetchImpl(url, { headers: { Accept: "application/dns-json" } });
      if (!response.ok) {
        lastError = `http ${response.status}`;
        continue;
      }
      const payload = await response.json();
      const hosts = parseMxResponse(payload);
      if (hosts.length) return { ok: true, hosts, error: "" };
      return { ok: false, hosts: [], error: "aucun MX" };
    } catch {
      lastError = "réseau";
    }
  }
  return { ok: false, hosts: [], error: lastError };
}

export function confidenceFor(row, index, mx) {
  let confidence = row.support > 0 ? Math.min(92, 58 + row.support * 12) : Math.max(18, 40 - index);
  if (row.bounced) confidence = Math.min(confidence, 12);
  if (mx?.ok === false) confidence = Math.max(0, confidence - 28);
  if (mx?.ok === true) confidence = Math.min(99, confidence + 5);
  return confidence;
}
