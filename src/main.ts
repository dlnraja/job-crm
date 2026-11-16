import "./styles.css";
import { encryptWithKey, openEnvelope } from "./lib/crypto.mjs";
import { applicationsToCsv } from "./lib/csv.mjs";
import { assertCrm } from "./lib/schema.mjs";
import { field, h } from "./dom";
import type { ApplicationPatch, AppController, CrmData, SortKey, ViewName } from "./types";
import { renderContacts, renderDashboard, renderGuesser, renderNav, renderRelances, renderTracker } from "./views";

const LOCAL_KEY = "job-crm.local.enc.v1";
const VIEWS: ViewName[] = ["tableau", "suivi", "contacts", "emails", "relances"];

function viewFromHash(): ViewName {
  const name = location.hash.replace(/^#/, "");
  return VIEWS.includes(name as ViewName) ? (name as ViewName) : "tableau";
}

class CrmApp implements AppController {
  readonly root: HTMLElement;
  data: CrmData = emptyData();
  query = "";
  statusFilter = "tous";
  sourceFilter = "tous";
  groupFilter = "tous";
  sortKey: SortKey = "dateApplied";
  sortDir: "asc" | "desc" = "desc";
  selectedId: string | null = null;
  view: ViewName = viewFromHash();
  private session: {
    data: CrmData;
    key: CryptoKey;
    salt: string;
    iterations: number;
  } | null = null;
  private usernameDraft = "demo";
  private loginError = "";
  private busy = false;
  private banner = "";
  private saveNote = "";

  constructor(root: HTMLElement) {
    this.root = root;
    window.addEventListener("hashchange", () => {
      this.view = viewFromHash();
      if (this.session) this.render();
    });
    this.render();
  }

  company(id: string) {
    return this.data.companies.find((item) => item.id === id);
  }

  application(id: string) {
    return this.data.applications.find((item) => item.id === id);
  }

  setQuery(value: string) {
    this.query = value;
    this.renderMain();
  }

  setFilter(name: "status" | "source" | "group", value: string) {
    if (name === "status") this.statusFilter = value;
    if (name === "source") this.sourceFilter = value;
    if (name === "group") this.groupFilter = value;
    this.renderMain();
  }

  toggleSort(key: SortKey) {
    if (this.sortKey === key) this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
    else {
      this.sortKey = key;
      this.sortDir = key === "dateApplied" ? "desc" : "asc";
    }
    this.renderMain();
  }

  select(id: string | null) {
    this.selectedId = id;
    this.renderMain();
  }

  go(view: ViewName, applicationId?: string) {
    if (applicationId) this.selectedId = applicationId;
    if (location.hash === `#${view}`) this.render();
    else location.hash = view;
  }

  async patchApplication(id: string, patch: ApplicationPatch, summary?: string, kind = "status") {
    if (!this.session) return;
    const application = this.application(id);
    if (!application) return;
    Object.assign(application, patch);
    if (summary) {
      application.events = application.events ?? [];
      application.events.push({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind,
        summary,
      });
    }
    this.data.updatedAt = new Date().toISOString();
    await this.persist();
    this.renderMain();
  }

  private async persist() {
    if (!this.session) return;
    try {
      const envelope = await encryptWithKey(this.session.key, this.data, {
        salt: this.session.salt,
        iterations: this.session.iterations,
      });
      localStorage.setItem(LOCAL_KEY, JSON.stringify(envelope));
      this.saveNote = "Copie locale chiffrée mise à jour.";
    } catch {
      this.saveNote = "Copie locale impossible. Exportez le JSON chiffré.";
    }
    this.paintNote();
  }

  private async onLogin(username: string, password: string) {
    this.usernameDraft = username;
    this.busy = true;
    this.loginError = "";
    this.render();
    let secret = password;
    try {
      const response = await fetch(new URL("data/data.enc.json", document.baseURI), { cache: "no-store" });
      if (!response.ok) {
        this.loginError = "Impossible de charger le coffre.";
        return;
      }
      const envelope = await response.json();
      const opened = await openEnvelope(envelope, secret, username);
      let data = assertCrm(opened.data) as CrmData;
      let key = opened.key;
      let salt = opened.salt;
      let iterations = opened.iterations;
      this.banner = "";
      const localRaw = localStorage.getItem(LOCAL_KEY);
      if (localRaw) {
        try {
          const local = await openEnvelope(JSON.parse(localRaw), secret, username);
          const localData = assertCrm(local.data) as CrmData;
          const localTime = Date.parse(localData.updatedAt);
          const fileTime = Date.parse(data.updatedAt);
          if (Number.isFinite(localTime) && localTime > fileTime) {
            data = localData;
            key = local.key;
            salt = local.salt;
            iterations = local.iterations;
            this.banner = "Une copie locale plus récente est ouverte. Exportez le JSON chiffré pour la réintégrer au dépôt.";
          }
        } catch {
          /* An older or foreign local copy is ignored. */
        }
      }
      this.session = { data, key, salt, iterations };
      this.data = data;
      this.view = viewFromHash();
      this.saveNote = "";
    } catch (error) {
      this.session = null;
      this.loginError = error instanceof Error && error.message === "schema"
        ? "Schéma du coffre non reconnu."
        : "Identifiants incorrects.";
    } finally {
      secret = "";
      this.busy = false;
      this.render();
    }
  }

  lock() {
    this.session = null;
    this.data = emptyData();
    this.selectedId = null;
    this.banner = "";
    this.saveNote = "";
    this.loginError = "";
    this.render();
  }

  forgetLocal() {
    localStorage.removeItem(LOCAL_KEY);
    this.banner = "Copie locale effacée de cet appareil. Le fichier du site n'a pas changé.";
    this.saveNote = "";
    this.render();
  }

  async exportEncrypted() {
    if (!this.session) return;
    const envelope = await encryptWithKey(this.session.key, this.data, {
      salt: this.session.salt,
      iterations: this.session.iterations,
    });
    download("data.enc.json", new Blob([`${JSON.stringify(envelope, null, 2)}\n`], { type: "application/json" }));
  }

  exportCsv() {
    if (!this.session) return;
    download("candidatures.csv", new Blob([applicationsToCsv(this.data)], { type: "text/csv;charset=utf-8" }));
  }

  private render() {
    this.root.replaceChildren(this.session ? this.shell() : this.login());
    if (this.session) this.renderMain();
  }

  private login(): HTMLElement {
    const username = h("input", {
      attrs: {
        name: "username",
        autocomplete: "username",
        required: "true",
        value: this.usernameDraft,
        autocapitalize: "off",
        spellcheck: "false",
      },
    });
    const password = h("input", {
      attrs: { name: "password", type: "password", autocomplete: "current-password", required: "true" },
    });
    const button = h("button", {
      class: "primary",
      text: this.busy ? "Dérivation de la clé…" : "Ouvrir",
      attrs: { type: "submit" },
    });
    if (this.busy) button.disabled = true;
    const form = h("form", { class: "gate-card" }, [
      h("h2", { text: "Ouvrir le coffre" }),
      field("Identifiant", username),
      field("Mot de passe", password),
      h("p", {
        class: "hint",
        text: "PBKDF2-SHA256, 600 000 itérations. Le mot de passe ne quitte pas cet onglet.",
      }),
      button,
      this.loginError ? h("p", { class: "error", text: this.loginError, attrs: { role: "alert" } }) : null,
      h("p", {
        class: "demo-note",
        text: "Démonstration publique : identifiant demo, mot de passe demo-only-public. Ces accès ne déverrouillent que des données fictives.",
      }),
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (this.busy) return;
      void this.onLogin(username.value, password.value);
      password.value = "";
    });
    return h("main", { class: "gate" }, [
      h("section", { class: "gate-copy" }, [
        h("p", { class: "eyebrow", text: "Coffre local" }),
        h("h1", { text: "Suivi de candidatures" }),
        h("p", {
          text: "Les dossiers, contacts et relances restent dans un fichier AES-256-GCM. Rien n'est envoyé à un serveur, et un mauvais identifiant n'affiche rien d'autre.",
        }),
      ]),
      form,
    ]);
  }

  private shell(): HTMLElement {
    return h("div", { class: "shell" }, [
      h("header", { class: "top" }, [
        h("div", { class: "brand" }, [h("span", { class: "mark", text: "C" }), h("strong", { text: "Coffre" })]),
        renderNav(this.view, (view) => this.go(view)),
        h("div", { class: "tools" }, [
          h("span", { class: "save-note", text: this.saveNote }),
          h("button", { class: "ghost", text: "Exporter JSON chiffré", attrs: { type: "button" }, on: { click: () => void this.exportEncrypted() } }),
          h("button", { class: "ghost", text: "Exporter CSV", attrs: { type: "button" }, on: { click: () => this.exportCsv() } }),
          h("button", { class: "ghost", text: "Oublier la copie locale", attrs: { type: "button" }, on: { click: () => this.forgetLocal() } }),
          h("button", { class: "primary", text: "Verrouiller", attrs: { type: "button" }, on: { click: () => this.lock() } }),
        ]),
      ]),
      this.banner ? h("p", { class: "banner", text: this.banner, attrs: { role: "status" } }) : null,
      h("main", { attrs: { id: "main" } }),
      h("footer", { class: "colophon", text: "Déchiffré dans cet onglet uniquement. Aucune analytique, aucun envoi." }),
    ]);
  }

  private renderMain() {
    const main = this.root.querySelector("#main");
    if (!main) return;
    const active = document.activeElement;
    const focusId = active instanceof HTMLElement ? active.dataset.focus : undefined;
    const selection =
      active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
        ? [active.selectionStart, active.selectionEnd]
        : null;
    main.replaceChildren();
    if (this.view === "tableau") renderDashboard(main as HTMLElement, this);
    else if (this.view === "suivi") renderTracker(main as HTMLElement, this);
    else if (this.view === "contacts") renderContacts(main as HTMLElement, this);
    else if (this.view === "emails") renderGuesser(main as HTMLElement, this);
    else renderRelances(main as HTMLElement, this);
    if (focusId) {
      const next = main.querySelector(`[data-focus="${CSS.escape(focusId)}"]`);
      if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
        next.focus();
        if (selection) next.setSelectionRange(selection[0], selection[1]);
      } else if (next instanceof HTMLElement) next.focus();
    }
    this.paintNote();
  }

  private paintNote() {
    const note = this.root.querySelector(".save-note");
    if (note) note.textContent = this.saveNote;
  }
}

function emptyData(): CrmData {
  return {
    schemaVersion: 1,
    updatedAt: "",
    auth: { username: "" },
    companies: [],
    contacts: [],
    applications: [],
    followUps: [],
    emailSamples: [],
    bouncedPatterns: [],
  };
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const root = document.querySelector("#app");
if (root instanceof HTMLElement) new CrmApp(root);
