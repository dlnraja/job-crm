function normalizedList(values) {
  return (values ?? [])
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(",");
}

function duplicateKey(item) {
  return [
    item.applicationId,
    item.date,
    String(item.subject ?? "").trim().toLowerCase(),
    normalizedList(item.to),
    normalizedList(item.cc),
  ].join("|");
}

export function followUpFindings(followUps) {
  const findings = [];
  const byApplication = new Map();
  for (const item of followUps) {
    const list = byApplication.get(item.applicationId) ?? [];
    list.push(item);
    byApplication.set(item.applicationId, list);
  }
  for (const [applicationId, list] of byApplication) {
    if (list.length > 1) {
      findings.push({
        code: "one-per-offer",
        applicationId,
        followUpIds: list.map((item) => item.id),
        message: "Plusieurs relances pour la même offre.",
      });
    }
  }

  const seen = new Map();
  for (const item of followUps) {
    const key = duplicateKey(item);
    if (seen.has(key)) {
      findings.push({
        code: "duplicate",
        applicationId: item.applicationId,
        followUpIds: [seen.get(key), item.id],
        message: "Doublon : même offre, même date, même objet et mêmes destinataires.",
      });
    } else {
      seen.set(key, item.id);
    }
  }

  const gmail = new Map();
  for (const item of followUps) {
    if (!item.gmailMessageId) continue;
    if (gmail.has(item.gmailMessageId)) {
      findings.push({
        code: "duplicate-gmail",
        applicationId: item.applicationId,
        followUpIds: [gmail.get(item.gmailMessageId), item.id],
        message: "Identifiant Gmail déjà utilisé par une autre relance.",
      });
    } else {
      gmail.set(item.gmailMessageId, item.id);
    }
  }
  return findings;
}
