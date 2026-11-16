export function isNoReplyAddress(email) {
  return /no[-_.]?reply|nepasrepondre|ne-pas-repondre|donotreply|do-not-reply|mailer-daemon|notification/i.test(
    String(email ?? ""),
  );
}

/**
 * @param {{
 *   application: { id?: string, role?: string, companyId?: string },
 *   company?: { id?: string, name?: string },
 *   contacts?: Array<{ companyId?: string, email?: string | null, firstName?: string, emailStatus?: string }>,
 *   followUps?: Array<{ applicationId?: string }>,
 *   profile?: { fullName?: string },
 *   quote?: string,
 * }} input
 * @returns {{ ok: false, reason: string } | { ok: true, to: string[], cc: string[], subject: string, body: string, missingRecipient: boolean }}
 */
export function planRefusalFollowUp({ application, company, contacts = [], followUps = [], profile, quote = "" }) {
  if (!application?.id) return { ok: false, reason: "Offre introuvable." };
  const existing = followUps.filter((item) => item.applicationId === application.id);
  if (existing.length) return { ok: false, reason: "Une relance existe déjà pour cette offre." };
  const related = contacts.filter((contact) => contact.companyId === company?.id && contact.email);
  const hr = related.find((contact) => !isNoReplyAddress(contact.email) && contact.emailStatus !== "bounced");
  const cc = related.filter((contact) => isNoReplyAddress(contact.email)).map((contact) => contact.email);
  const greeting = hr ? `Bonjour ${hr.firstName},` : "Bonjour,";
  const where = company?.name ? ` chez ${company.name}` : "";
  const quoted = String(quote ?? "").trim();
  const quoteBlock = quoted ? `\n\nLe message reçu indiquait :\n« ${quoted} »\n` : "\n";
  const name = profile?.fullName?.trim() || "";
  const body = `${greeting}

Je vous remercie pour votre retour au sujet de ma candidature au poste de ${application.role}${where}. Je prends bonne note de votre décision.${quoteBlock}
Si un bref retour est possible sur ce qui a manqué, je le lirai avec attention.

Bien cordialement,
${name}`.trim();
  return {
    ok: true,
    to: hr ? [hr.email] : [],
    cc,
    subject: `Retour sur ma candidature — ${application.role}`,
    body,
    missingRecipient: !hr,
  };
}
