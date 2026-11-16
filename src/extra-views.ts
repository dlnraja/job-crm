import { field, h } from "./dom";
import { jobsFromImportText, linkedinPeopleSearch } from "./lib/linkedin.mjs";
import type { AppController, Profile } from "./types";

export function blankProfile(): Profile {
  return { fullName: "", headline: "", location: "", linkedinUrl: "", experiences: [], skills: [], achievements: [] };
}

export function renderLinkedIn(host: HTMLElement, ui: AppController) {
  ui.postToExtension({ type: "status" });
  if (ui.data.profile) ui.postToExtension({ type: "profile", profile: ui.data.profile });
  host.append(
    h("header", { class: "view-head" }, [
      h("div", {}, [h("p", { class: "eyebrow", text: "Navigateur" }), h("h1", { text: "LinkedIn" })]),
      h("p", {
        class: "lede",
        text: "L'extension agit seulement dans votre session LinkedIn déjà ouverte. Elle n'appelle pas l'API Voyager et ne lit pas les cookies. Aucun garde-fou n'annule le risque de restriction.",
      }),
    ]),
    h("section", { class: "callout is-warn" }, [
      h("h2", { text: "Conditions LinkedIn" }),
      h("p", {
        text: "Automatiser LinkedIn contrevient à son contrat d'utilisation et peut restreindre le compte. Vous l'exécutez à vos risques. Le mode répétition est le défaut : rien n'est envoyé tant que vous n'activez pas chaque action.",
      }),
    ]),
    h("section", { class: "panel" }, [
      h("h2", { text: "Extension" }),
      h("p", { text: ui.linkedinStatus }),
      h("pre", { class: "letter", text: ui.linkedinSafety || "Compteurs indisponibles tant que l'extension n'est pas ouverte." }),
      h("div", { class: "row-actions" }, [
        h("button", {
          class: "primary",
          text: "Arrêt d'urgence",
          attrs: { type: "button" },
          on: { click: () => ui.postToExtension({ type: "kill", on: true }) },
        }),
        h("button", {
          class: "ghost",
          text: "Rafraîchir",
          attrs: { type: "button" },
          on: { click: () => ui.postToExtension({ type: "status" }) },
        }),
      ]),
    ]),
    h("section", { class: "panel" }, [
      h("h2", { text: "Installation" }),
      h("p", {
        text: "Le zip versionné est extension/dist/coffre-linkedin.zip (même fichier que la release extension-v1.0.0). Décompressez-le. Chrome ou Edge : mode développeur, chargez le dossier. Firefox : about:debugging, module temporaire, manifest.json.",
      }),
      h("p", {
        class: "muted",
        text: "Gmail reste dans l'onglet Gmail du CRM (jeton Google du navigateur). L'extension ne demande pas de jeton LinkedIn.",
      }),
    ]),
  );
}

export function renderLetters(host: HTMLElement, ui: AppController) {
  const offer = h("textarea", { attrs: { rows: "8", name: "offer" } });
  const select = h(
    "select",
    { attrs: { name: "applicationId" } },
    [h("option", { text: "Sans dossier", attrs: { value: "" } })].concat(
      ui.data.applications.map((application) =>
        h("option", {
          text: `${application.role} — ${ui.company(application.companyId)?.name ?? "Import"}`,
          attrs: { value: application.id },
        }),
      ),
    ),
  );
  const output = h("pre", { class: "letter", text: ui.letterText || "La lettre apparaîtra ici." });
  const form = h("form", { class: "stack" }, [
    field("Dossier", select),
    field("Texte de l'offre collé", offer),
    h("div", { class: "row-actions" }, [
      h("button", { class: "primary", text: "Générer", attrs: { type: "submit" } }),
      h("button", {
        class: "ghost",
        text: "Copier",
        attrs: { type: "button" },
        on: {
          click: () => {
            void navigator.clipboard?.writeText(ui.letterText);
          },
        },
      }),
      h("button", {
        class: "ghost",
        text: "Télécharger .txt",
        attrs: { type: "button" },
        on: { click: () => downloadText("lettre.txt", ui.letterText, "text/plain") },
      }),
      h("button", {
        class: "ghost",
        text: "Télécharger HTML (Word)",
        attrs: { type: "button" },
        on: { click: () => downloadText("lettre.html", ui.letterHtml, "text/html") },
      }),
    ]),
  ]);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    ui.generateLetter(offer.value, select.value);
    output.textContent = ui.letterText;
  });
  host.append(
    h("header", { class: "view-head" }, [
      h("div", {}, [h("p", { class: "eyebrow", text: "Modèles" }), h("h1", { text: "Lettres" })]),
      h("p", {
        class: "lede",
        text: "Le texte de l'offre est comparé aux faits du profil (mots vides FR/EN retirés). La lettre ne contient que ces faits.",
      }),
    ]),
    form,
    output,
  );
}

export function renderGmail(host: HTMLElement, ui: AppController) {
  if (!ui.gmailReady) {
    host.append(
      h("header", { class: "view-head" }, [
        h("div", {}, [h("p", { class: "eyebrow", text: "Boîte mail" }), h("h1", { text: "Gmail" })]),
      ]),
      h("section", { class: "callout" }, [
        h("h2", { text: "Client OAuth absent" }),
        h("p", {
          text: "Renseignez public/google-config.json avec l'identifiant client OAuth (origine JavaScript https://dlnraja.github.io). Les étapes sont dans docs/SETUP.md. Sans cet identifiant, le classement des mails et les brouillons restent indisponibles ; le reste du coffre fonctionne.",
        }),
      ]),
    );
    return;
  }
  const allowSend = h("input", { attrs: { type: "checkbox", name: "send" } });
  const note = h("p", { class: "muted", text: ui.gmailNote });
  host.append(
    h("header", { class: "view-head" }, [
      h("div", {}, [h("p", { class: "eyebrow", text: "Boîte mail" }), h("h1", { text: "Gmail" })]),
      h("p", {
        class: "lede",
        text: "Lecture seule et brouillons. L'envoi n'existe que si la case est cochée avant la connexion, puis au clic Envoyer dans Relances. Au plus 25 messages, un par un.",
      }),
    ]),
    h("div", { class: "row-actions" }, [
      h("label", { class: "check" }, [allowSend, h("span", { text: "Autoriser aussi l'envoi (gmail.send)" })]),
      h("button", {
        class: "primary",
        text: "Connecter Gmail",
        attrs: { type: "button" },
        on: { click: () => void ui.connectGmail(allowSend.checked) },
      }),
      h("button", { class: "ghost", text: "Analyser la boîte", attrs: { type: "button" }, on: { click: () => void ui.scanGmail() } }),
      h("button", { class: "ghost", text: "Appliquer au coffre", attrs: { type: "button" }, on: { click: () => void ui.applyGmail() } }),
    ]),
    note,
    h("pre", { class: "letter", text: ui.gmailSummary || "Aucune analyse pour l'instant." }),
  );
}

export function renderProfile(host: HTMLElement, ui: AppController) {
  const profile = ui.data.profile ?? blankProfile();
  const fullName = input(profile.fullName);
  const headline = input(profile.headline);
  const location = input(profile.location);
  const linkedinUrl = input(profile.linkedinUrl);
  const skills = h("textarea", { attrs: { rows: "3" }, text: profile.skills.join(", ") });
  const achievements = h("textarea", { attrs: { rows: "4" }, text: profile.achievements.join("\n") });
  const facts = h("textarea", {
    attrs: { rows: "5" },
    text: profile.experiences.flatMap((item) => item.facts).join("\n"),
  });
  const imports = h("textarea", { attrs: { rows: "4", placeholder: "Une URL ou un identifiant par ligne" } });
  const note = h("p", { class: "muted" });
  const save = h("form", { class: "stack" }, [
    field("Nom affiché", fullName),
    field("Titre", headline),
    field("Lieu", location),
    field("Profil LinkedIn", linkedinUrl),
    field("Compétences, séparées par des virgules", skills),
    field("Réalisations, une par ligne", achievements),
    field("Faits d'expérience, une ligne = un fait réel", facts),
    h("button", { class: "primary", text: "Enregistrer le profil", attrs: { type: "submit" } }),
  ]);
  save.addEventListener("submit", (event) => {
    event.preventDefault();
    const experienceFacts = facts.value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    void ui.updateProfile({
      fullName: fullName.value.trim(),
      headline: headline.value.trim(),
      location: location.value.trim(),
      linkedinUrl: linkedinUrl.value.trim(),
      skills: skills.value.split(",").map((item) => item.trim()).filter(Boolean),
      achievements: achievements.value.split(/\n+/).map((line) => line.trim()).filter(Boolean),
      experiences: experienceFacts.length
        ? [{ id: profile.experiences[0]?.id || "xp1", title: headline.value.trim() || "Expérience", organization: "", facts: experienceFacts }]
        : [],
    });
    note.textContent = "Profil enregistré dans le coffre chiffré.";
  });
  const searches = ui.data.companies.map((company) =>
    h("li", {}, [
      h("a", {
        class: "text-link",
        text: `RH chez ${company.name}`,
        attrs: { href: linkedinPeopleSearch(company.name), target: "_blank", rel: "noreferrer noopener" },
      }),
    ]),
  );
  const importForm = h("form", { class: "stack" }, [
    field("Liens ou identifiants d'offres LinkedIn", imports),
    h("button", { class: "ghost", text: "Importer les offres", attrs: { type: "submit" } }),
  ]);
  importForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void ui.importJobLines(imports.value).then((count) => {
      note.textContent = `${count} offre(s) ajoutée(s). ${jobsFromImportText(imports.value).length} lien(s) reconnu(s).`;
    });
  });
  host.append(
    h("header", { class: "view-head" }, [
      h("div", {}, [h("p", { class: "eyebrow", text: "Identité" }), h("h1", { text: "Profil" })]),
      h("p", {
        class: "lede",
        text: ui.cloud
          ? `Compte ${ui.accountEmail || "connecté"}. Le coffre est chiffré avant Firestore. LinkedIn n'a pas d'API publique de candidatures : seulement des liens.`
          : "Mode coffre local. Les comptes et Gmail se branchent quand public/firebase-config.json et public/google-config.json sont remplis.",
      }),
    ]),
    save,
    h("h2", { text: "Recherche de contacts RH" }),
    h("ul", { class: "inline-list" }, searches),
    importForm,
    importBlock(ui),
    note,
  );
}

function importBlock(ui: AppController) {
  if (!ui.cloud) {
    return h("p", { class: "muted", text: "L'import vers un compte apparaît après une connexion Firebase." });
  }
  const username = input("dylan");
  const password = h("input", { attrs: { type: "password", autocomplete: "current-password" } });
  const file = h("input", { attrs: { type: "file", accept: "application/json,.json" } });
  const replace = h("input", { attrs: { type: "checkbox" } });
  const message = h("p", { class: "muted" });
  const form = h("form", { class: "stack" }, [
    h("h2", { text: "Importer mon coffre existant" }),
    field("Identifiant du fichier", username),
    field("Mot de passe du fichier", password),
    field("Fichier JSON chiffré (vide = le coffre publié du site)", file),
    h("label", { class: "check" }, [replace, h("span", { text: "Remplacer le coffre déjà stocké sur le compte" })]),
    h("button", { class: "primary", text: "Importer dans mon compte", attrs: { type: "submit" } }),
    message,
  ]);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const chosen = file.files?.[0];
    const run = (text: string) => {
      void ui.importExistingVault(username.value, password.value, text, replace.checked).then(
        () => {
          message.textContent = "Coffre importé et rechiffré avec la phrase du compte.";
          password.value = "";
        },
        () => {
          message.textContent = "Import impossible. Vérifiez l'identifiant, le mot de passe, ou cochez le remplacement.";
          password.value = "";
        },
      );
    };
    if (!chosen) run("");
    else {
      const reader = new FileReader();
      reader.onload = () => run(String(reader.result ?? ""));
      reader.readAsText(chosen);
    }
  });
  return form;
}

function input(value: string) {
  return h("input", { attrs: { type: "text", value } });
}

function downloadText(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
