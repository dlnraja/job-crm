import { priorityLabel, sourceLabel, statusLabel } from "./labels.mjs";

function cell(value) {
  const text = value == null ? "" : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function applicationsToCsv(data) {
  const headers = [
    "Entreprise",
    "Poste",
    "Lieu",
    "Salaire",
    "Source",
    "Date de candidature",
    "Statut",
    "Priorité",
    "Urgence",
    "Prochaine action",
    "Échéance",
    "URL offre",
    "URL LinkedIn",
    "CV",
    "Lettre",
    "Notes",
  ];
  const lines = [headers.map(cell).join(",")];
  for (const application of data.applications ?? []) {
    const company = (data.companies ?? []).find((item) => item.id === application.companyId);
    lines.push(
      [
        company?.name ?? "",
        application.role ?? "",
        application.location ?? "",
        application.salary ?? "",
        sourceLabel(application.source),
        application.dateApplied ?? "",
        statusLabel(application.status),
        priorityLabel(application.priority),
        application.urgency ?? "",
        application.nextAction ?? "",
        application.nextActionDate ?? "",
        application.offerUrl ?? "",
        application.linkedinJobUrl ?? "",
        application.cvFile ?? "",
        application.letterFile ?? "",
        application.notes ?? "",
      ]
        .map(cell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
