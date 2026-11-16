export type Source = "linkedin" | "welcome_to_the_jungle" | "career_site" | "public_sector";
export type AppStatus =
  | "a_preparer"
  | "prete"
  | "envoyee"
  | "en_cours"
  | "entretien"
  | "refus"
  | "offre";
export type Priority = "haute" | "moyenne" | "basse";
export type Urgency = "haute" | "normale" | "basse";
export type CompanyGroup = "cac40" | "sbf120" | "sp500" | "public" | "autre";
export type EmailStatus = "published" | "guessed" | "verified" | "bounced";
export type Delivery = "delivered" | "bounced";
export type InterviewKind = "screening" | "rh" | "manager" | "final";
export type ViewName = "tableau" | "suivi" | "contacts" | "emails" | "relances" | "lettres" | "gmail" | "profil";
export type SortKey =
  | "company"
  | "role"
  | "location"
  | "salary"
  | "source"
  | "dateApplied"
  | "status"
  | "priority"
  | "nextAction";

export interface Company {
  id: string;
  name: string;
  domain: string;
  group: CompanyGroup;
  sector?: string | null;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  companyId: string;
  linkedinUrl?: string | null;
  email?: string | null;
  emailStatus: EmailStatus;
  sourceNote?: string | null;
  applicationIds: string[];
}

export interface EmailSample {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  email: string;
  note?: string | null;
}

export interface BouncedPattern {
  companyId: string;
  pattern: string;
}

export interface Interview {
  id: string;
  kind: InterviewKind;
  at: string;
  with: string;
  location?: string | null;
  notes?: string | null;
}

export interface TimelineEvent {
  id: string;
  at: string;
  kind: string;
  summary: string;
}

export interface Application {
  id: string;
  companyId: string;
  role: string;
  location: string;
  zone?: string | null;
  remote?: string | null;
  salary?: string | null;
  source: Source;
  datePublished?: string | null;
  dateApplied?: string | null;
  status: AppStatus;
  priority: Priority;
  urgency: Urgency;
  nextAction?: string | null;
  nextActionDate?: string | null;
  offerUrl?: string | null;
  linkedinJobUrl?: string | null;
  gmailMessageIds: string[];
  cvFile?: string | null;
  letterFile?: string | null;
  contactIds: string[];
  notes?: string | null;
  score?: number | null;
  fitNote?: string | null;
  interviews: Interview[];
  events: TimelineEvent[];
}

export interface FollowUp {
  id: string;
  applicationId: string;
  date: string;
  to: string[];
  cc: string[];
  subject: string;
  gmailMessageId?: string | null;
  delivery: Delivery;
  replyReceived: boolean;
  state?: "draft" | "sent";
  body?: string;
}

export interface Experience {
  id: string;
  title: string;
  organization: string;
  start?: string;
  end?: string;
  facts: string[];
}

export interface Profile {
  fullName: string;
  headline: string;
  location: string;
  linkedinUrl: string;
  experiences: Experience[];
  skills: string[];
  achievements: string[];
}

export interface CrmData {
  schemaVersion: 1;
  updatedAt: string;
  auth: { username: string };
  companies: Company[];
  contacts: Contact[];
  applications: Application[];
  followUps: FollowUp[];
  emailSamples: EmailSample[];
  bouncedPatterns: BouncedPattern[];
  profile?: Profile;
}

export type ApplicationPatch = Partial<
  Pick<Application, "status" | "notes" | "nextAction" | "nextActionDate" | "priority" | "urgency">
>;

export interface AppController {
  data: CrmData;
  query: string;
  statusFilter: string;
  sourceFilter: string;
  groupFilter: string;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  selectedId: string | null;
  setQuery(value: string): void;
  setFilter(name: "status" | "source" | "group", value: string): void;
  toggleSort(key: SortKey): void;
  select(id: string | null): void;
  patchApplication(
    id: string,
    patch: ApplicationPatch,
    summary?: string,
    kind?: string,
  ): Promise<void>;
  company(id: string): Company | undefined;
  application(id: string): Application | undefined;
  go(view: ViewName, applicationId?: string): void;
  cloud: boolean;
  gmailReady: boolean;
  gmailNote: string;
  accountEmail: string;
  letterText: string;
  letterHtml: string;
  updateProfile(profile: Profile): Promise<void>;
  importJobLines(text: string): Promise<number>;
  generateLetter(offer: string, applicationId: string): void;
  connectGmail(allowSend: boolean): Promise<void>;
  scanGmail(): Promise<void>;
  applyGmail(): Promise<void>;
  gmailSummary: string;
  prepareRefusalFollowUp(applicationId: string): Promise<string>;
  sendDraft(followUpId: string): Promise<string>;
  importExistingVault(username: string, password: string, fileText: string, replace: boolean): Promise<void>;
}
