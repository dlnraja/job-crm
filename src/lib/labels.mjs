export const STATUS_LABELS = {
  a_preparer: "À préparer",
  prete: "Prête à envoyer",
  envoyee: "Envoyée",
  en_cours: "En cours",
  entretien: "Entretien",
  refus: "Refus",
  offre: "Offre",
};

export const SOURCE_LABELS = {
  linkedin: "LinkedIn",
  welcome_to_the_jungle: "Welcome to the Jungle",
  career_site: "Site carrière",
  public_sector: "Secteur public",
};

export const GROUP_LABELS = {
  cac40: "CAC 40",
  sbf120: "SBF 120",
  sp500: "S&P 500",
  public: "Secteur public",
  autre: "Autre",
};

export const PRIORITY_LABELS = {
  haute: "Haute",
  moyenne: "Moyenne",
  basse: "Basse",
};

export const EMAIL_STATUS_LABELS = {
  published: "Publiée",
  guessed: "Devinée",
  verified: "Vérifiée",
  bounced: "Rebond",
};

export const DELIVERY_LABELS = {
  delivered: "Distribué",
  bounced: "Rebond",
};

export const INTERVIEW_LABELS = {
  screening: "Pré-qualification",
  rh: "Entretien RH",
  manager: "Manager",
  final: "Final",
};

export const STATUS_ORDER = Object.keys(STATUS_LABELS);
export const GROUP_ORDER = Object.keys(GROUP_LABELS);

function label(table, value) {
  if (value == null || value === "") return "—";
  return table[value] ?? String(value);
}

export const statusLabel = (value) => label(STATUS_LABELS, value);
export const sourceLabel = (value) => label(SOURCE_LABELS, value);
export const groupLabel = (value) => label(GROUP_LABELS, value);
export const priorityLabel = (value) => label(PRIORITY_LABELS, value);
export const emailStatusLabel = (value) => label(EMAIL_STATUS_LABELS, value);
export const deliveryLabel = (value) => label(DELIVERY_LABELS, value);
export const interviewLabel = (value) => label(INTERVIEW_LABELS, value);
