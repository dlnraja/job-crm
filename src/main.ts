import "./styles.css";
import { encryptEnvelope, encryptWithKey, openEnvelope } from "./lib/crypto.mjs";
import { applicationsToCsv } from "./lib/csv.mjs";
import { isFirebaseConfigured, isGoogleClientConfigured } from "./lib/config.mjs";
import { planRefusalFollowUp } from "./lib/followup-drafts.mjs";
import { applyInboxPlans, planInboxUpdates } from "./lib/gmail-classify.mjs";
import { buildPlainMessage, toBase64Url } from "./lib/gmail-mime.mjs";
import { renderCoverLetter } from "./lib/letters.mjs";
import { jobsFromImportText } from "./lib/linkedin.mjs";
import { assertCrm } from "./lib/schema.mjs";
import { localISODate } from "./lib/stats.mjs";
import { field, h } from "./dom";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type * as Cloud from "./cloud";
import { createGmailDraft, requestGmailToken, scanInbox, sendGmailMessage } from "./gmail";
import { renderGmail, renderLetters, renderProfile } from "./extra-views";
import type { ApplicationPatch, AppController, CrmData, Profile, SortKey, ViewName } from "./types";
import { renderContacts, renderDashboard, renderGuesser, renderNav, renderRelances, renderTracker } from "./views";

const LOCAL_KEY = "job-crm.local.enc.v1";
const VIEWS: ViewName[] = ["tableau", "suivi", "contacts", "emails", "relances", "lettres", "gmail", "profil"];

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
  private usernameDraft = "dylan";
  private loginError = "";
  private busy = false;
  private banner = "";
  private saveNote = "";
  private firebase: { auth: Auth; db: Firestore } | null = null;
  private cloudApi: typeof Cloud | null = null;
  private account: { uid: string; email: string } | null = null;
  private passphraseError = "";
  private googleClientId = "";
  private gmailToken = "";
  private gmailCanSend = false;
  private gmailPlans: ReturnType<typeof planInboxUpdates> = [];
  letterText = "";
  letterHtml = "";
  gmailNote = "";
  gmailSummary = "";

  constructor(root: HTMLElement) {
    this.root = root;
    window.addEventListener("hashchange", () => {
      this.view = viewFromHash();
      if (this.session) this.render();
    });
    this.render();
    void this.boot();
  }

  get cloud() {
    return this.firebase !== null;
  }

  get gmailReady() {
    return this.googleClientId !== "";
  }

  get accountEmail() {
    return this.account?.email ?? "";
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
      if (this.account && this.firebase && this.cloudApi) {
        await this.cloudApi.writeVault(this.firebase.db, this.account.uid, envelope, this.data.updatedAt);
        this.saveNote = "Coffre chiffré enregistré sur le compte.";
      } else this.saveNote = "Copie locale chiffrée mise à jour.";
    } catch {
      this.saveNote = "Enregistrement impossible. Exportez le JSON chiffré.";
    }
    this.paintNote();
  }

  private async boot() {
    const [firebaseConfig, googleConfig] = await Promise.all([
      loadJson("firebase-config.json"),
      loadJson("google-config.json"),
    ]);
    if (firebaseConfig && isFirebaseConfigured(firebaseConfig)) {
      this.cloudApi = await import("./cloud");
      this.firebase = this.cloudApi.connectFirebase({
        apiKey: firebaseConfig.apiKey,
        authDomain: firebaseConfig.authDomain,
        projectId: firebaseConfig.projectId,
        appId: firebaseConfig.appId,
        storageBucket: firebaseConfig.storageBucket,
        messagingSenderId: firebaseConfig.messagingSenderId,
      });
    }
    if (googleConfig && isGoogleClientConfigured(googleConfig)) this.googleClientId = String(googleConfig.clientId).trim();
    if (!this.session) this.render();
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
    const auth = this.firebase?.auth;
    this.session = null;
    this.account = null;
    this.gmailToken = "";
    this.gmailCanSend = false;
    this.gmailPlans = [];
    this.data = emptyData();
    this.selectedId = null;
    this.banner = "";
    this.saveNote = "";
    this.loginError = "";
    this.passphraseError = "";
    this.letterText = "";
    this.letterHtml = "";
    if (auth && this.cloudApi) void this.cloudApi.signOutAccount(auth);
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

  async updateProfile(profile: Profile) {
    this.data.profile = profile;
    this.data.updatedAt = new Date().toISOString();
    await this.persist();
  }

  async importJobLines(text: string) {
    let added = 0;
    for (const job of jobsFromImportText(text)) {
      if (this.data.applications.some((application) => application.linkedinJobUrl === job.url)) continue;
      this.data.applications.push({
        id: `app_li_${job.id}`,
        companyId: "",
        role: "Offre importée",
        location: "",
        salary: null,
        source: "linkedin",
        dateApplied: null,
        status: "a_preparer",
        priority: "moyenne",
        urgency: "normale",
        nextAction: "Ouvrir la fiche LinkedIn",
        nextActionDate: null,
        offerUrl: null,
        linkedinJobUrl: job.url,
        gmailMessageIds: [],
        cvFile: null,
        letterFile: null,
        contactIds: [],
        notes: "",
        interviews: [],
        events: [
          {
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            kind: "note",
            summary: "Import d'un lien LinkedIn.",
          },
        ],
      });
      added += 1;
    }
    if (added) {
      this.data.updatedAt = new Date().toISOString();
      await this.persist();
      this.renderMain();
    }
    return added;
  }

  generateLetter(offer: string, applicationId: string) {
    const application = applicationId ? this.application(applicationId) : undefined;
    const company = application ? this.company(application.companyId) : undefined;
    const letter = renderCoverLetter({
      profile: this.data.profile,
      offerText: offer,
      role: application?.role,
      company: company?.name,
    });
    this.letterText = letter.text;
    this.letterHtml = letter.html;
  }

  async connectGmail(allowSend: boolean) {
    try {
      const granted = await requestGmailToken(this.googleClientId, allowSend);
      this.gmailToken = granted.token;
      this.gmailCanSend = granted.canSend;
      this.gmailNote = granted.canSend
        ? "Gmail connecté, envoi inclus. Rien n'est envoyé sans un clic."
        : "Gmail connecté en lecture et brouillons.";
    } catch {
      this.gmailNote = "Connexion Gmail annulée ou refusée.";
    }
    this.renderMain();
  }

  async scanGmail() {
    if (!this.gmailToken) {
      this.gmailNote = "Connectez Gmail d'abord.";
      this.renderMain();
      return;
    }
    try {
      const messages = await scanInbox(this.gmailToken);
      this.gmailPlans = planInboxUpdates(messages, this.data);
      const counts = this.gmailPlans.reduce<Record<string, number>>((bag, plan) => {
        const key = plan.type === "application" ? plan.kind : plan.type;
        bag[key] = (bag[key] ?? 0) + 1;
        return bag;
      }, {});
      this.gmailSummary = this.gmailPlans.length
        ? this.gmailPlans
            .map((plan) =>
              plan.type === "application"
                ? `${plan.kind} → ${this.application(plan.applicationId)?.role ?? plan.applicationId}`
                : plan.type === "bounce"
                  ? `rebond ${plan.email || "adresse inconnue"}`
                  : `${plan.kind} non rattaché : ${plan.subject}`,
            )
            .join("\n")
        : "Aucun message classé.";
      this.gmailNote = `${messages.length} message(s) lus. ${JSON.stringify(counts)}`;
    } catch (error) {
      this.gmailNote = error instanceof Error && error.message === "rate"
        ? "Gmail limite les appels. Réessayez un peu plus tard."
        : "Lecture Gmail impossible.";
    }
    this.renderMain();
  }

  async applyGmail() {
    if (!this.gmailPlans.length) {
      this.gmailNote = "Rien à appliquer.";
      this.renderMain();
      return;
    }
    const next = applyInboxPlans(this.gmailPlans.length ? this.data : this.data, this.gmailPlans) as CrmData;
    next.auth = this.data.auth;
    this.data = next;
    if (this.session) this.session.data = next;
    await this.persist();
    this.gmailNote = "Mises à jour écrites dans le coffre chiffré.";
    this.renderMain();
  }

  async prepareRefusalFollowUp(applicationId: string) {
    const application = this.application(applicationId);
    if (!application) return "Offre introuvable.";
    const refusal = [...(application.events ?? [])].reverse().find((event) => event.kind === "refusal");
    const quote = refusal?.summary?.split(" — ").slice(1).join(" — ") ?? "";
    const plan = planRefusalFollowUp({
      application,
      company: this.company(application.companyId),
      contacts: this.data.contacts,
      followUps: this.data.followUps,
      profile: this.data.profile,
      quote,
    });
    if (!plan.ok) return plan.reason || "Relance impossible.";
    this.data.followUps.push({
      id: crypto.randomUUID(),
      applicationId,
      date: localISODate(new Date()),
      to: plan.to,
      cc: plan.cc,
      subject: plan.subject,
      gmailMessageId: null,
      delivery: "delivered",
      replyReceived: false,
      state: "draft",
      body: plan.body,
    });
    let message = plan.missingRecipient
      ? "Brouillon enregistré sans destinataire RH."
      : "Brouillon enregistré. Rien n'a été envoyé.";
    if (this.gmailToken && plan.to.length) {
      try {
        await createGmailDraft(this.gmailToken, toBase64Url(buildPlainMessage(plan)));
        message = "Brouillon créé dans Gmail. Rien n'a été envoyé.";
      } catch {
        message = "Brouillon gardé dans le coffre. Gmail n'a pas créé le brouillon.";
      }
    }
    await this.persist();
    this.renderMain();
    return message;
  }

  async sendDraft(followUpId: string) {
    const followUp = this.data.followUps.find((item) => item.id === followUpId);
    if (!followUp || followUp.state !== "draft") return "Aucun brouillon à envoyer.";
    if (!this.gmailCanSend || !this.gmailToken) return "Cochez l'envoi avant de connecter Gmail, puis réessayez.";
    if (!followUp.to.length) return "Ajoutez un destinataire avant d'envoyer.";
    try {
      const id = await sendGmailMessage(
        this.gmailToken,
        toBase64Url(buildPlainMessage({ to: followUp.to, cc: followUp.cc, subject: followUp.subject, body: followUp.body ?? "" })),
      );
      followUp.state = "sent";
      followUp.gmailMessageId = id || followUp.gmailMessageId;
      await this.persist();
      this.renderMain();
      return "Message envoyé.";
    } catch {
      return "Envoi refusé par Gmail.";
    }
  }

  async importExistingVault(username: string, password: string, fileText: string, replace: boolean) {
    if (!this.account || !this.firebase || !this.cloudApi || !this.session) throw new Error("account");
    const remote = await this.cloudApi?.readVault(this.firebase.db, this.account.uid);
    if (remote && !replace) throw new Error("replace");
    const envelope = fileText.trim()
      ? JSON.parse(fileText)
      : await (await fetch(new URL("data/data.enc.json", document.baseURI), { cache: "no-store" })).json();
    const opened = await openEnvelope(envelope, password, username);
    const data = assertCrm(opened.data) as CrmData;
    data.auth.username = this.account.uid;
    data.updatedAt = new Date().toISOString();
    this.data = data;
    this.session.data = data;
    await this.persist();
    this.render();
  }

  private async onAccount(email: string, password: string, mode: "in" | "up" | "google") {
    if (!this.firebase) return;
    this.busy = true;
    this.loginError = "";
    this.render();
    try {
      if (!this.cloudApi) return;
      const account = mode === "google"
        ? await this.cloudApi.signInGoogle(this.firebase.auth)
        : mode === "up"
          ? await this.cloudApi.signUpEmail(this.firebase.auth, email, password)
          : await this.cloudApi.signInEmail(this.firebase.auth, email, password);
      this.account = account;
      this.passphraseError = "";
    } catch (error) {
      this.account = null;
      this.loginError = accountError(error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async onPassphrase(passphrase: string) {
    if (!this.account || !this.firebase || !this.cloudApi) return;
    this.busy = true;
    this.passphraseError = "";
    this.render();
    let secret = passphrase;
    try {
      const remote = await this.cloudApi.readVault(this.firebase.db, this.account.uid);
      if (remote) {
        const opened = await openEnvelope(remote, secret, this.account.uid);
        this.adopt(assertCrm(opened.data) as CrmData, opened.key, opened.salt, opened.iterations);
      } else {
        const data = emptyData();
        data.auth.username = this.account.uid;
        data.updatedAt = new Date().toISOString();
        const envelope = await encryptEnvelope(secret, data);
        const opened = await openEnvelope(envelope, secret, this.account.uid);
        await this.cloudApi.writeVault(this.firebase.db, this.account.uid, envelope, data.updatedAt);
        this.adopt(assertCrm(opened.data) as CrmData, opened.key, opened.salt, opened.iterations);
      }
    } catch {
      this.passphraseError = "Phrase secrète incorrecte.";
    } finally {
      secret = "";
      this.busy = false;
      this.render();
    }
  }

  private adopt(data: CrmData, key: CryptoKey, salt: string, iterations: number) {
    this.session = { data, key, salt, iterations };
    this.data = data;
    this.view = viewFromHash();
    this.banner = this.account
      ? "Coffre du compte ouvert dans cet onglet. Firestore ne voit que le chiffré."
      : "";
  }

  private render() {
    const screen = this.session ? this.shell() : this.account ? this.passphrase() : this.login();
    this.root.replaceChildren(screen);
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
        text: "Le coffre publié s'ouvre avec l'identifiant dylan et le mot de passe choisi au chiffrement. Un autre couple n'affiche rien.",
      }),
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (this.busy) return;
      void this.onLogin(username.value, password.value);
      password.value = "";
    });
    const column = h("div", { class: "gate-stack" }, [form]);
    if (this.firebase) column.prepend(this.accountForm());
    return h("main", { class: "gate" }, [
      h("section", { class: "gate-copy" }, [
        h("p", { class: "eyebrow", text: this.firebase ? "Comptes" : "Coffre local" }),
        h("h1", { text: "Suivi de candidatures" }),
        h("p", {
          text: this.firebase
            ? "Le compte sert à retrouver votre coffre. La phrase secrète le chiffre avant l'envoi : le serveur ne lit pas les dossiers."
            : "Les dossiers restent dans un fichier AES-256-GCM. Sans configuration Firebase, rien n'est envoyé à un serveur.",
        }),
      ]),
      column,
    ]);
  }

  private accountForm(): HTMLElement {
    const email = h("input", { attrs: { type: "email", autocomplete: "username", required: "true" } });
    const password = h("input", { attrs: { type: "password", autocomplete: "current-password", required: "true" } });
    const form = h("form", { class: "gate-card" }, [
      h("h2", { text: "Compte" }),
      field("E-mail", email),
      field("Mot de passe du compte", password),
      h("div", { class: "row-actions" }, [
        h("button", { class: "primary", text: "Se connecter", attrs: { type: "submit" } }),
        h("button", {
          class: "ghost",
          text: "Créer un compte",
          attrs: { type: "button" },
          on: { click: () => void this.onAccount(email.value, password.value, "up") },
        }),
      ]),
      h("button", {
        class: "ghost wide",
        text: "Continuer avec Google",
        attrs: { type: "button" },
        on: { click: () => void this.onAccount("", "", "google") },
      }),
      h("p", { class: "hint", text: "Google ne donne pas la phrase du coffre. Elle est demandée ensuite, y compris pour un compte Google." }),
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.onAccount(email.value, password.value, "in");
      password.value = "";
    });
    return form;
  }

  private passphrase(): HTMLElement {
    const secret = h("input", { attrs: { type: "password", autocomplete: "new-password", required: "true" } });
    const form = h("form", { class: "gate-card" }, [
      h("h2", { text: "Phrase du coffre" }),
      h("p", { class: "hint", text: this.account?.email || "Compte ouvert" }),
      field("Phrase secrète", secret),
      h("p", {
        class: "hint",
        text: "Elle dérive la clé AES. Si aucun coffre n'existe encore, cette phrase en crée un vide.",
      }),
      h("button", {
        class: "primary",
        text: this.busy ? "Dérivation de la clé…" : "Ouvrir le coffre",
        attrs: { type: "submit" },
      }),
      this.passphraseError ? h("p", { class: "error", text: this.passphraseError, attrs: { role: "alert" } }) : null,
      h("button", { class: "ghost", text: "Fermer la session", attrs: { type: "button" }, on: { click: () => this.lock() } }),
    ]);
    if (this.busy) form.querySelector("button")?.setAttribute("disabled", "true");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (this.busy) return;
      void this.onPassphrase(secret.value);
      secret.value = "";
    });
    return h("main", { class: "gate" }, [
      h("section", { class: "gate-copy" }, [
        h("p", { class: "eyebrow", text: "Chiffrement" }),
        h("h1", { text: "Votre coffre" }),
        h("p", { text: "Après l'ouverture, le profil permet d'importer le coffre local existant (identifiant et mot de passe du fichier)." }),
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
    else if (this.view === "relances") renderRelances(main as HTMLElement, this);
    else if (this.view === "lettres") renderLetters(main as HTMLElement, this);
    else if (this.view === "gmail") renderGmail(main as HTMLElement, this);
    else renderProfile(main as HTMLElement, this);
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

async function loadJson(name: string): Promise<Record<string, string> | null> {
  try {
    const response = await fetch(new URL(name, document.baseURI), { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function accountError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Identifiants incorrects.";
  }
  if (code.includes("email-already-in-use")) return "Un compte existe déjà pour cet e-mail.";
  if (code.includes("popup-closed") || code.includes("cancelled")) return "Connexion annulée.";
  return "Connexion impossible.";
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
