import { barFigure, donutFigure } from "./charts";
import { externalLink, field, formatDate, formatRate, formatWhen, gmailHref, h } from "./dom";
import { fold, guessEmails, PATTERN_LABELS } from "./lib/email-guesser.mjs";
import { confidenceFor, lookupMx } from "./lib/mx.mjs";
import { followUpFindings } from "./lib/followups.mjs";
import {
  deliveryLabel,
  emailStatusLabel,
  GROUP_LABELS,
  groupLabel,
  interviewLabel,
  PRIORITY_LABELS,
  priorityLabel,
  SOURCE_LABELS,
  sourceLabel,
  STATUS_LABELS,
  statusLabel,
} from "./lib/labels.mjs";
import {
  applicationsByGroup,
  computeKpis,
  deadlineItems,
  interviewItems,
  localISODate,
  recentActivity,
  statusCounts,
  weekSeries,
} from "./lib/stats.mjs";
import type { AppController, Application, SortKey, ViewName } from "./types";

const STATUS_COLORS: Record<string, string> = {
  a_preparer: "#8a8175",
  prete: "#8a5a12",
  envoyee: "#315f8a",
  en_cours: "#0e6b62",
  entretien: "#1f6b3a",
  refus: "#8d2e2e",
  offre: "#6b4c9a",
};

const GROUP_COLORS: Record<string, string> = {
  cac40: "#0e6b62",
  sbf120: "#315f8a",
  sp500: "#8a5a12",
  public: "#6b4c9a",
  autre: "#8a8175",
};

const NAV: Array<{ id: ViewName; label: string }> = [
  { id: "tableau", label: "Tableau de bord" },
  { id: "suivi", label: "Suivi" },
  { id: "contacts", label: "Contacts" },
  { id: "emails", label: "Devineur d'e-mails" },
  { id: "relances", label: "Relances" },
  { id: "lettres", label: "Lettres" },
  { id: "gmail", label: "Gmail" },
  { id: "profil", label: "Profil" },
  { id: "linkedin", label: "LinkedIn" },
];

export function renderNav(current: ViewName, go: (view: ViewName) => void): HTMLElement {
  return h(
    "nav",
    { class: "nav", attrs: { "aria-label": "Sections" } },
    NAV.map((item) => {
      const button = h("button", {
        class: item.id === current ? "nav-link is-current" : "nav-link",
        text: item.label,
        attrs: { type: "button" },
        on: { click: () => go(item.id) },
      });
      if (item.id === current) button.setAttribute("aria-current", "page");
      return button;
    }),
  );
}

export function renderDashboard(host: HTMLElement, ui: AppController): void {
  const kpis = computeKpis(ui.data);
  const today = localISODate(new Date());
  const cards: Array<[string, string, string]> = [
    ["Candidatures envoyées", String(kpis.sent), "Date d'envoi renseignée"],
    ["En cours", String(kpis.inProgress), "Envoyée ou en cours, hors entretien"],
    ["Entretiens", String(kpis.interviews), "Statut entretien"],
    ["Refus", String(kpis.refusals), "Statut refus"],
    ["Relances envoyées", String(kpis.followUpsSent), "Toutes les relances du journal"],
    ["Relances en rebond", String(kpis.followUpsBounced), "Accusé de non-distribution"],
    ["Taux de réponse", formatRate(kpis.responseRate), "Réponse, entretien, refus ou offre"],
  ];
  const grid = h(
    "section",
    { class: "kpi-grid" },
    cards.map(([label, value, hint]) =>
      h("article", { class: "kpi" }, [
        h("p", { class: "kpi-label", text: label }),
        h("p", { class: "kpi-value", text: value }),
        h("p", { class: "kpi-hint", text: hint }),
      ]),
    ),
  );

  const status = statusCounts(ui.data.applications);
  const weeks = weekSeries(ui.data.applications);
  const groups = applicationsByGroup(ui.data);
  const charts = h("section", { class: "chart-grid" }, [
    donutFigure(
      "Par statut",
      status.map((row) => ({
        label: statusLabel(row.status),
        count: row.count,
        color: STATUS_COLORS[row.status] ?? "#8a8175",
      })),
    ),
    barFigure(
      "Envois par semaine",
      weeks.map((row) => ({ label: row.label, count: row.count })),
    ),
    barFigure(
      "Par groupe",
      groups.map((row) => ({
        label: groupLabel(row.group),
        count: row.count,
        color: GROUP_COLORS[row.group],
      })),
    ),
  ]);

  const deadlines = deadlineItems(ui.data.applications, today);
  const interviews = interviewItems(ui.data.applications);
  const activity = recentActivity(ui.data);

  host.append(
    h("header", { class: "view-head" }, [
      h("div", {}, [
        h("p", { class: "eyebrow", text: "Vue d'ensemble" }),
        h("h1", { text: "Tableau de bord" }),
      ]),
      h("p", {
        class: "lede",
        text: "Le taux de réponse compte, parmi les dossiers envoyés, ceux passés en cours, en entretien, en refus ou en offre, ainsi que ceux dont une relance a reçu une réponse.",
      }),
    ]),
    grid,
    charts,
    h("section", { class: "split" }, [
      agenda("Échéances", deadlines.length ? null : "Aucune échéance.", deadlines.map((item) => {
        const company = ui.company(item.application.companyId);
        return agendaButton(
          `${formatDate(item.date)}${item.overdue ? " · dépassée" : ""}`,
          `${item.application.role} — ${company?.name ?? ""}`,
          item.application.nextAction || "Sans action",
          () => ui.go("suivi", item.application.id),
        );
      })),
      agenda(
        "Entretiens",
        interviews.length ? null : "Aucun entretien à l'horizon.",
        interviews.map((item) =>
          agendaButton(
            `${formatWhen(item.interview.at)}${item.upcoming ? "" : " · passé"}`,
            `${interviewLabel(item.interview.kind)} · ${item.interview.with}`,
            `${item.application.role} — ${item.interview.location || "Lieu non précisé"}`,
            () => ui.go("suivi", item.application.id),
          ),
        ),
      ),
    ]),
    h("section", { class: "panel" }, [
      h("h2", { text: "Activité récente" }),
      activity.length
        ? h(
            "ol",
            { class: "feed" },
            activity.map((item) =>
              h("li", {}, [
                h("time", { text: formatWhen(item.at), attrs: { datetime: item.at } }),
                h("button", {
                  class: "linkish",
                  text: item.summary,
                  attrs: { type: "button" },
                  on: { click: () => ui.go("suivi", item.applicationId) },
                }),
                h("span", { class: "muted", text: `${item.role} · ${item.company}` }),
              ]),
            ),
          )
        : h("p", { class: "muted", text: "Aucun événement." }),
    ]),
  );
}

function agenda(title: string, empty: string | null, items: HTMLElement[]): HTMLElement {
  return h("section", { class: "panel" }, [
    h("h2", { text: title }),
    empty ? h("p", { class: "muted", text: empty }) : h("ul", { class: "agenda" }, items),
  ]);
}

function agendaButton(when: string, title: string, detail: string, onClick: () => void): HTMLElement {
  return h("li", {}, [
    h("button", { class: "agenda-item", attrs: { type: "button" }, on: { click: onClick } }, [
      h("span", { class: "agenda-when", text: when }),
      h("span", { class: "agenda-title", text: title }),
      h("span", { class: "muted", text: detail }),
    ]),
  ]);
}

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "company", label: "Entreprise" },
  { key: "role", label: "Poste" },
  { key: "location", label: "Lieu" },
  { key: "salary", label: "Salaire" },
  { key: "source", label: "Source" },
  { key: "dateApplied", label: "Date" },
  { key: "status", label: "Statut" },
  { key: "priority", label: "Priorité" },
  { key: "nextAction", label: "Prochaine action" },
];

export function renderTracker(host: HTMLElement, ui: AppController): void {
  const rows = filteredApplications(ui);
  host.append(
    h("header", { class: "view-head" }, [
      h("div", {}, [
        h("p", { class: "eyebrow", text: "Pipeline" }),
        h("h1", { text: "Suivi" }),
      ]),
      h("p", { class: "lede", text: `${rows.length} dossier${rows.length > 1 ? "s" : ""} affiché${rows.length > 1 ? "s" : ""}.` }),
    ]),
    h("div", { class: "filters" }, [
      searchField(ui),
      selectFilter("Statut", "status", ["tous", ...Object.keys(STATUS_LABELS)], (value) =>
        value === "tous" ? "Tous les statuts" : statusLabel(value),
      ui),
      selectFilter("Source", "source", ["tous", ...Object.keys(SOURCE_LABELS)], (value) =>
        value === "tous" ? "Toutes les sources" : sourceLabel(value),
      ui),
      selectFilter("Groupe", "group", ["tous", ...Object.keys(GROUP_LABELS)], (value) =>
        value === "tous" ? "Tous les groupes" : groupLabel(value),
      ui),
    ]),
    h("div", { class: "table-wrap" }, [table(rows, ui)]),
    ui.selectedId ? detail(ui) : h("p", { class: "muted pick-hint", text: "Choisissez une ligne pour ouvrir la fiche, les notes et la chronologie." }),
  );
}

function searchField(ui: AppController): HTMLElement {
  const input = h("input", {
    attrs: {
      type: "search",
      placeholder: "Entreprise, poste, lieu, note…",
      value: ui.query,
      "data-focus": "search",
    },
  });
  input.addEventListener("input", () => ui.setQuery(input.value));
  return field("Recherche", input);
}

function selectFilter(
  label: string,
  name: "status" | "source" | "group",
  values: string[],
  text: (value: string) => string,
  ui: AppController,
): HTMLElement {
  const current = name === "status" ? ui.statusFilter : name === "source" ? ui.sourceFilter : ui.groupFilter;
  const select = h(
    "select",
    { attrs: { "data-focus": `filter-${name}` } },
    values.map((value) => {
      const option = h("option", { text: text(value), attrs: { value } });
      if (value === current) option.selected = true;
      return option;
    }),
  );
  select.addEventListener("change", () => ui.setFilter(name, select.value));
  return field(label, select);
}

function table(rows: Application[], ui: AppController): HTMLTableElement {
  const head = h(
    "tr",
    {},
    COLUMNS.map((column) => {
      const mark = ui.sortKey === column.key ? (ui.sortDir === "asc" ? " ↑" : " ↓") : "";
      return h("th", { attrs: { scope: "col" } }, [
        h("button", {
          class: "sort",
          text: column.label + mark,
          attrs: { type: "button" },
          on: { click: () => ui.toggleSort(column.key) },
        }),
      ]);
    }).concat(h("th", { attrs: { scope: "col" }, text: "Liens" })),
  );
  const body = h(
    "tbody",
    {},
    rows.map((application) => row(application, ui)),
  );
  return h("table", { class: "grid" }, [h("thead", {}, [head]), body]);
}

function row(application: Application, ui: AppController): HTMLTableRowElement {
  const company = ui.company(application.companyId);
  const tr = h("tr", {
    class: application.id === ui.selectedId ? "is-selected" : undefined,
    on: {
      click: (event) => {
        const target = event.target as HTMLElement;
        if (target.closest("a, button, select, input, textarea, label")) return;
        ui.select(application.id === ui.selectedId ? null : application.id);
      },
    },
  });
  const cells = [
    company?.name ?? "—",
    application.role,
    application.location,
    application.salary || "—",
    sourceLabel(application.source),
    formatDate(application.dateApplied),
    null,
    priorityLabel(application.priority),
    application.nextAction || "—",
  ];
  cells.forEach((value, index) => {
    if (index === 6) tr.append(h("td", {}, [statusSelect(application, ui)]));
    else tr.append(h("td", { text: value ?? "—" }));
  });
  tr.append(h("td", { class: "links" }, linkList(application)));
  return tr;
}

function statusSelect(application: Application, ui: AppController): HTMLSelectElement {
  const select = h(
    "select",
    { class: "status-select", attrs: { "data-status": application.status, "data-focus": `status-${application.id}`, "aria-label": `Statut de ${application.role}` } },
    Object.keys(STATUS_LABELS).map((status) => {
      const option = h("option", { text: statusLabel(status), attrs: { value: status } });
      if (status === application.status) option.selected = true;
      return option;
    }),
  );
  select.addEventListener("change", () => {
    if (select.value === application.status) return;
    const summary = `Statut : ${statusLabel(application.status)} → ${statusLabel(select.value)}`;
    void ui.patchApplication(application.id, { status: select.value as Application["status"] }, summary, "status");
  });
  return select;
}

function linkList(application: Application): HTMLElement[] {
  const links: HTMLElement[] = [];
  if (application.offerUrl) links.push(externalLink(application.offerUrl, "Offre"));
  if (application.linkedinJobUrl) links.push(externalLink(application.linkedinJobUrl, "LinkedIn"));
  for (const id of application.gmailMessageIds ?? []) links.push(externalLink(gmailHref(id), "Gmail"));
  return links.length ? links : [h("span", { class: "muted", text: "—" })];
}

function detail(ui: AppController): HTMLElement {
  const application = ui.application(ui.selectedId ?? "");
  if (!application) return h("p", { class: "muted", text: "Dossier introuvable." });
  const company = ui.company(application.companyId);
  const contacts = ui.data.contacts.filter(
    (contact) => contact.applicationIds.includes(application.id) || application.contactIds?.includes(contact.id),
  );
  return h("article", { class: "detail" }, [
    h("header", { class: "detail-head" }, [
      h("div", {}, [
        h("p", { class: "eyebrow", text: company?.name ?? "Entreprise" }),
        h("h2", { text: application.role }),
      ]),
      h("button", {
        class: "ghost",
        text: "Fermer",
        attrs: { type: "button" },
        on: { click: () => ui.select(null) },
      }),
    ]),
    h("dl", { class: "facts" }, [
      fact("Lieu", [application.location, application.remote].filter(Boolean).join(" · ")),
      fact("Groupe", groupLabel(company?.group)),
      fact("Salaire", application.salary || "—"),
      fact("Source", sourceLabel(application.source)),
      fact("Publiée", formatDate(application.datePublished)),
      fact("Envoyée", formatDate(application.dateApplied)),
      fact("Priorité", priorityLabel(application.priority)),
      fact("Urgence", application.urgency || "—"),
      fact("CV", application.cvFile || "—"),
      fact("Lettre", application.letterFile || "—"),
      fact("Score", application.score == null ? "—" : String(application.score)),
    ]),
    application.fitNote ? h("p", { class: "note", text: application.fitNote }) : null,
    h("div", { class: "edit-grid" }, [
      priorityEditor(application, ui),
      actionEditor(application, ui),
      notesEditor(application, ui),
    ]),
    h("h3", { text: "Contacts liés" }),
    contacts.length
      ? h(
          "ul",
          { class: "inline-list" },
          contacts.map((contact) =>
            h("li", { text: `${contact.firstName} ${contact.lastName} · ${contact.role} · ${contact.email || "sans e-mail"}` }),
          ),
        )
      : h("p", { class: "muted", text: "Aucun contact lié." }),
    h("h3", { text: "Chronologie" }),
    timeline(application, ui),
  ]);
}

function fact(label: string, value: string): HTMLElement {
  return h("div", {}, [h("dt", { text: label }), h("dd", { text: value })]);
}

function priorityEditor(application: Application, ui: AppController): HTMLElement {
  const select = h(
    "select",
    { attrs: { "data-focus": `priority-${application.id}` } },
    Object.keys(PRIORITY_LABELS).map((priority) => {
      const option = h("option", { text: priorityLabel(priority), attrs: { value: priority } });
      if (priority === application.priority) option.selected = true;
      return option;
    }),
  );
  select.addEventListener("change", () => {
    if (select.value === application.priority) return;
    void ui.patchApplication(
      application.id,
      { priority: select.value as Application["priority"] },
      `Priorité : ${priorityLabel(select.value)}`,
      "status",
    );
  });
  return field("Priorité", select);
}

function actionEditor(application: Application, ui: AppController): HTMLElement {
  const text = h("input", {
    attrs: { type: "text", value: application.nextAction ?? "", "data-focus": `action-${application.id}` },
  });
  const date = h("input", {
    attrs: { type: "date", value: application.nextActionDate ?? "", "data-focus": `action-date-${application.id}` },
  });
  const save = (kind: "text" | "date") => {
    const nextAction = text.value.trim();
    const nextActionDate = date.value || null;
    const same = (application.nextAction ?? "") === nextAction && (application.nextActionDate ?? null) === nextActionDate;
    if (same) return;
    void ui.patchApplication(
      application.id,
      { nextAction: nextAction || null, nextActionDate },
      kind === "date" ? `Échéance : ${formatDate(nextActionDate)}` : `Prochaine action : ${nextAction || "effacée"}`,
      "note",
    );
  };
  text.addEventListener("change", () => save("text"));
  date.addEventListener("change", () => save("date"));
  return h("div", { class: "action-edit" }, [field("Prochaine action", text), field("Échéance", date)]);
}

function notesEditor(application: Application, ui: AppController): HTMLElement {
  const area = h("textarea", {
    attrs: { rows: "4", "data-focus": `notes-${application.id}` },
    text: application.notes ?? "",
  });
  area.addEventListener("change", () => {
    const notes = area.value;
    if ((application.notes ?? "") === notes) return;
    void ui.patchApplication(application.id, { notes }, "Note mise à jour.", "note");
  });
  return field("Notes", area);
}

function timeline(application: Application, ui: AppController): HTMLElement {
  const items: Array<{ at: string; title: string; detail: string }> = [];
  for (const event of application.events ?? []) {
    items.push({ at: event.at, title: event.summary, detail: event.kind });
  }
  for (const interview of application.interviews ?? []) {
    items.push({
      at: interview.at,
      title: `${interviewLabel(interview.kind)} avec ${interview.with}`,
      detail: [interview.location, interview.notes].filter(Boolean).join(" · "),
    });
  }
  for (const followUp of ui.data.followUps.filter((item) => item.applicationId === application.id)) {
    items.push({
      at: `${followUp.date}T12:00:00`,
      title: `Relance : ${followUp.subject}`,
      detail: `${deliveryLabel(followUp.delivery)}${followUp.replyReceived ? " · réponse reçue" : ""} · ${followUp.to.join(", ")}`,
    });
  }
  items.sort((a, b) => b.at.localeCompare(a.at));
  if (!items.length) return h("p", { class: "muted", text: "Aucun événement." });
  return h(
    "ol",
    { class: "feed" },
    items.map((item) =>
      h("li", {}, [
        h("time", { text: formatWhen(item.at), attrs: { datetime: item.at } }),
        h("strong", { text: item.title }),
        item.detail ? h("span", { class: "muted", text: item.detail }) : null,
      ]),
    ),
  );
}

function filteredApplications(ui: AppController): Application[] {
  const query = fold(ui.query.trim());
  const rows = ui.data.applications.filter((application) => {
    if (ui.statusFilter !== "tous" && application.status !== ui.statusFilter) return false;
    if (ui.sourceFilter !== "tous" && application.source !== ui.sourceFilter) return false;
    const company = ui.company(application.companyId);
    if (ui.groupFilter !== "tous" && company?.group !== ui.groupFilter) return false;
    if (!query) return true;
    const hay = fold(
      [company?.name, application.role, application.location, application.notes, application.nextAction]
        .filter(Boolean)
        .join(" "),
    );
    return hay.includes(query);
  });
  const priorityRank: Record<string, number> = { haute: 3, moyenne: 2, basse: 1 };
  const valueOf = (application: Application): string | number | null => {
    const company = ui.company(application.companyId);
    switch (ui.sortKey) {
      case "company":
        return company?.name ?? "";
      case "role":
        return application.role;
      case "location":
        return application.location;
      case "salary":
        return application.salary || null;
      case "source":
        return sourceLabel(application.source);
      case "dateApplied":
        return application.dateApplied || null;
      case "status":
        return statusLabel(application.status);
      case "priority":
        return priorityRank[application.priority] ?? 0;
      case "nextAction":
        return application.nextActionDate || application.nextAction || null;
      default:
        return null;
    }
  };
  const dir = ui.sortDir === "asc" ? 1 : -1;
  return rows.sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    if (typeof left === "number" && typeof right === "number") return (left - right) * dir;
    return String(left).localeCompare(String(right), "fr") * dir;
  });
}

export function renderContacts(host: HTMLElement, ui: AppController): void {
  host.append(
    h("header", { class: "view-head" }, [
      h("div", {}, [
        h("p", { class: "eyebrow", text: "Personnes" }),
        h("h1", { text: "Contacts" }),
      ]),
      h("p", { class: "lede", text: "Recruteurs, RH et adresses publiées qui servent de modèle." }),
    ]),
    h("div", { class: "table-wrap" }, [
      h("table", { class: "grid" }, [
        h("thead", {}, [
          h("tr", {}, ["Nom", "Rôle", "Entreprise", "E-mail", "Statut", "Source", "Dossiers"].map((label) => h("th", { text: label, attrs: { scope: "col" } }))),
        ]),
        h(
          "tbody",
          {},
          ui.data.contacts.map((contact) => {
            const company = ui.company(contact.companyId);
            const links = (contact.applicationIds ?? [])
              .map((id) => ui.application(id))
              .filter((item): item is Application => Boolean(item));
            return h("tr", {}, [
              h("td", { text: `${contact.firstName} ${contact.lastName}` }),
              h("td", { text: contact.role }),
              h("td", { text: company?.name ?? "—" }),
              h("td", {}, contact.email ? [externalLink(`mailto:${contact.email}`, contact.email)] : [h("span", { text: "—" })]),
              h("td", {}, [h("span", { class: "pill", attrs: { "data-email": contact.emailStatus }, text: emailStatusLabel(contact.emailStatus) })]),
              h("td", { text: contact.sourceNote || "—" }),
              h(
                "td",
                {},
                links.length
                  ? links.map((application) =>
                      h("button", {
                        class: "linkish",
                        text: application.role,
                        attrs: { type: "button" },
                        on: { click: () => ui.go("suivi", application.id) },
                      }),
                    )
                  : [h("span", { class: "muted", text: "—" })],
              ),
            ]);
          }),
        ),
      ]),
    ]),
  );
}

export function renderGuesser(host: HTMLElement, ui: AppController): void {
  const results = h("div", { class: "guess-results" });
  const bouncedNote = h("p", { class: "callout" });
  const mxNote = h("p", { class: "muted" });
  let lastRows: Array<{ email: string; pattern: string; support: number; bounced: boolean; reason: string }> = [];
  const domain = h("input", { attrs: { name: "domain", required: "true", autocomplete: "off", spellcheck: "false" } });
  const samples = h("textarea", { attrs: { name: "samples", rows: "5", spellcheck: "false" } });
  const company = h(
    "select",
    { attrs: { name: "companyId" } },
    [h("option", { text: "Domaine libre", attrs: { value: "" } })].concat(
      ui.data.companies.map((item) => h("option", { text: item.name, attrs: { value: item.id } })),
    ),
  );
  const fill = (companyId: string) => {
    const match = ui.company(companyId);
    domain.value = match?.domain ?? "";
    const known = ui.data.emailSamples.filter((sample) => sample.companyId === companyId);
    samples.value = known.map((sample) => `${sample.firstName} ${sample.lastName} ${sample.email}`).join("\n");
    const bounced = ui.data.bouncedPatterns.filter((item) => item.companyId === companyId);
    bouncedNote.textContent = bounced.length
      ? `Modèles déjà en rebond pour ${match?.name ?? "ce domaine"} : ${bounced.map((item) => PATTERN_LABELS[item.pattern] ?? item.pattern).join(", ")}.`
      : "Aucun modèle en rebond enregistré pour cette sélection.";
  };
  company.addEventListener("change", () => fill(company.value));
  fill("");
  const form = h("form", { class: "guess-form" }, [
    field("Entreprise", company),
    field("Prénom", h("input", { attrs: { name: "firstName", required: "true", autocomplete: "off" } })),
    field("Nom", h("input", { attrs: { name: "lastName", required: "true", autocomplete: "off" } })),
    field("Domaine", domain),
    field("Adresses connues (prénom nom adresse, une par ligne)", samples),
    h("div", { class: "row-actions" }, [
      h("button", { class: "primary", text: "Proposer des adresses", attrs: { type: "submit" } }),
      h("button", {
        class: "ghost",
        text: "Vérifier le MX",
        attrs: { type: "button" },
        on: {
          click: () => {
            mxNote.textContent = "Requête DNS en cours…";
            void lookupMx(domain.value).then((mx) => {
              mxNote.textContent = mx.ok
                ? `MX trouvé : ${mx.hosts.join(", ")}.`
                : `Pas de MX utilisable (${mx.error}). Les scores baissent.`;
              if (lastRows.length) results.replaceChildren(renderGuessRows(lastRows, mx));
            });
          },
        },
      }),
    ]),
  ]);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const companyId = String(data.get("companyId") ?? "");
    const bounced = ui.data.bouncedPatterns
      .filter((item) => item.companyId === companyId)
      .map((item) => item.pattern);
    const parsed = parseSamples(String(data.get("samples") ?? ""));
    const rows = guessEmails({
      firstName: String(data.get("firstName") ?? ""),
      lastName: String(data.get("lastName") ?? ""),
      domain: String(data.get("domain") ?? ""),
      samples: parsed,
      bouncedPatterns: bounced,
    });
    lastRows = rows;
    results.replaceChildren(renderGuessRows(rows));
  });
  host.append(
    h("header", { class: "view-head" }, [
      h("div", {}, [
        h("p", { class: "eyebrow", text: "Modèles" }),
        h("h1", { text: "Devineur d'e-mails" }),
      ]),
      h("p", {
        class: "lede",
        text: "Le modèle est déduit des adresses déjà vues : prénom.nom, pnom, p.nom, prénommom, prénom, nom.prénom, prénom_nom, traits d'union et accents retirés.",
      }),
    ]),
    bouncedNote,
    form,
    mxNote,
    results,
  );
}

function parseSamples(text: string): Array<{ firstName: string; lastName: string; email: string }> {
  const rows = [];
  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (!match || match.index == null) continue;
    const name = trimmed.slice(0, match.index).replace(/[<>,"]/g, " ").trim();
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;
    rows.push({ firstName: parts[0], lastName: parts.slice(1).join(" "), email: match[0] });
  }
  return rows;
}

function renderGuessRows(
  rows: Array<{ email: string; pattern: string; support: number; bounced: boolean; reason: string }>,
  mx?: { ok: boolean },
): HTMLElement {
  if (!rows.length) return h("p", { class: "muted", text: "Aucune adresse à proposer. Vérifiez le prénom, le nom et le domaine." });
  return h("ol", { class: "guess-list" }, rows.map((row, index) => {
    const copy = h("button", {
      class: "ghost",
      text: "Copier",
      attrs: { type: "button" },
      on: {
        click: () => {
          void navigator.clipboard?.writeText(row.email).then(
            () => {
              copy.textContent = "Copié";
            },
            () => {
              copy.textContent = "À copier à la main";
            },
          );
        },
      },
    });
    return h("li", { class: row.bounced ? "is-bounced" : undefined }, [
      h("span", { class: "rank", text: String(index + 1) }),
      h("div", {}, [
        h("strong", { text: row.email }),
        h("span", {
          class: "muted",
          text: `${PATTERN_LABELS[row.pattern] ?? row.pattern} · confiance ${confidenceFor(row, index, mx)} · ${row.reason}`,
        }),
        row.bounced ? h("span", { class: "pill", attrs: { "data-email": "bounced" }, text: "Modèle déjà en rebond" }) : null,
      ]),
      copy,
    ]);
  }));
}

export function renderRelances(host: HTMLElement, ui: AppController): void {
  const findings = followUpFindings(ui.data.followUps);
  const actionNote = h("p", { class: "muted" });
  host.append(
    h("header", { class: "view-head" }, [
      h("div", {}, [
        h("p", { class: "eyebrow", text: "Journal" }),
        h("h1", { text: "Relances" }),
      ]),
      h("p", { class: "lede", text: "Une seule relance par offre. Un refus peut préparer un remerciement (brouillon) : l'envoi ne part qu'au clic sur Envoyer." }),
    ]),
    actionNote,
    h("section", { class: findings.length ? "callout is-warn" : "callout" }, [
      h("h2", { text: findings.length ? "Règles non respectées" : "Règles respectées" }),
      findings.length
        ? h(
            "ul",
            {},
            findings.map((finding) => {
              const application = finding.applicationId ? ui.application(finding.applicationId) : undefined;
              const who = application ? `${application.role} — ${ui.company(application.companyId)?.name ?? ""}` : "Offre";
              return h("li", { text: `${finding.message} ${who}.` });
            }),
          )
        : h("p", { text: "Aucune entorse : une relance au plus par offre, sans doublon." }),
    ]),
    h("div", { class: "table-wrap" }, [
      h("table", { class: "grid" }, [
        h("thead", {}, [
          h("tr", {}, ["Date", "Offre", "À", "Cc", "Objet", "Distribution", "Réponse", "Gmail", "Action"].map((label) => h("th", { text: label, attrs: { scope: "col" } }))),
        ]),
        h(
          "tbody",
          {},
          ui.data.followUps.map((item) => {
            const application = ui.application(item.applicationId);
            return h("tr", {}, [
              h("td", { text: formatDate(item.date) }),
              h("td", {}, [
                application
                  ? h("button", {
                      class: "linkish",
                      text: application.role,
                      attrs: { type: "button" },
                      on: { click: () => ui.go("suivi", application.id) },
                    })
                  : h("span", { text: item.applicationId }),
              ]),
              h("td", { text: item.to.join(", ") }),
              h("td", { text: item.cc.length ? item.cc.join(", ") : "—" }),
              h("td", { text: item.subject }),
              h("td", {}, [
                h("span", {
                  class: "pill",
                  attrs: { "data-email": item.state === "draft" ? "guessed" : item.delivery === "bounced" ? "bounced" : "verified" },
                  text: item.state === "draft" ? "Brouillon" : deliveryLabel(item.delivery),
                }),
              ]),
              h("td", { text: item.replyReceived ? "Oui" : "Non" }),
              h("td", {}, item.gmailMessageId ? [externalLink(gmailHref(item.gmailMessageId), "Ouvrir")] : [h("span", { text: "—" })]),
              h("td", {}, [
                application?.status === "refus"
                  ? h("button", {
                      class: "linkish",
                      text: "Remerciement",
                      attrs: { type: "button" },
                      on: {
                        click: () => {
                          void ui.prepareRefusalFollowUp(application.id).then((message) => {
                            actionNote.textContent = message;
                          });
                        },
                      },
                    })
                  : h("span", { class: "muted", text: "—" }),
                item.state === "draft"
                  ? h("button", {
                      class: "linkish",
                      text: "Envoyer",
                      attrs: { type: "button" },
                      on: {
                        click: () => {
                          void ui.sendDraft(item.id).then((message) => {
                            actionNote.textContent = message;
                          });
                        },
                      },
                    })
                  : null,
              ]),
            ]);
          }),
        ),
      ]),
    ]),
  );
}
