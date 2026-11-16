/** Conservative limits. No setting here removes LinkedIn's own enforcement. */
export const DEFAULT_CAPS = {
  easyApplyPerDay: 12,
  messagesPerDay: 10,
  invitationsPerDay: 8,
  invitationsPerWeek: 70,
  pageViewsPerDay: 120,
  actionsPerHour: 6,
  sessionsPerDay: 3,
};

export const WARMUP_DAYS = 14;
const SESSION_GAP_MS = 45 * 60 * 1000;

export function parisParts(date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  });
  const bag = {};
  for (const part of fmt.formatToParts(date)) bag[part.type] = part.value;
  return {
    weekday: bag.weekday,
    minutes: Number(bag.hour) * 60 + Number(bag.minute),
    dayKey: `${bag.year}-${bag.month}-${bag.day}`,
  };
}

export function weekKey(dayKey) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function parseClock(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function warmupMultiplier(dayIndex) {
  const index = Math.max(0, dayIndex);
  if (index >= WARMUP_DAYS - 1) return 1;
  return 0.3 + (0.7 * index) / (WARMUP_DAYS - 1);
}

export function effectiveCap(base, dayIndex, warmupOn = true) {
  const factor = warmupOn ? warmupMultiplier(dayIndex) : 1;
  return Math.max(1, Math.round(base * factor));
}

export function freshSafetyState(now = new Date()) {
  const day = parisParts(now).dayKey;
  return {
    killed: false,
    dryRun: true,
    warmup: true,
    warmUpStarted: day,
    autonomous: {
      easyApply: false,
      autoAdd: false,
      invitations: false,
      messages: { interview: false, refusal: false, info: false, inmail: false },
    },
    hours: { start: "08:30", end: "19:30", weekdaysOnly: true },
    caps: { ...DEFAULT_CAPS },
    cooldownUntil: null,
    cooldownReason: "",
    warnings: [],
    consecutiveErrors: 0,
    stoppedForDay: null,
    sessionsToday: 0,
    lastActionAt: null,
    actionsSinceBreak: 0,
    nextAllowedAt: null,
    hourWindow: [],
    counts: {
      day,
      week: weekKey(day),
      easyApply: 0,
      messages: 0,
      invitations: 0,
      invitationsWeek: 0,
      pageViews: 0,
    },
    threadsReplied: {},
    lastTexts: [],
    log: [],
  };
}

export function dayIndex(state, now) {
  const start = state.warmUpStarted || parisParts(now).dayKey;
  const current = parisParts(now).dayKey;
  const [ys, ms, ds] = start.split("-").map(Number);
  const [yc, mc, dc] = current.split("-").map(Number);
  const a = Date.UTC(ys, ms - 1, ds);
  const b = Date.UTC(yc, mc - 1, dc);
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function withinWorkingHours(state, now) {
  const parts = parisParts(now);
  if (state.hours?.weekdaysOnly !== false && (parts.weekday === "Sat" || parts.weekday === "Sun")) {
    return false;
  }
  const start = parseClock(state.hours?.start) ?? 8 * 60 + 30;
  const end = parseClock(state.hours?.end) ?? 19 * 60 + 30;
  return parts.minutes >= start && parts.minutes <= end;
}

export function rollState(state, now) {
  const day = parisParts(now).dayKey;
  const week = weekKey(day);
  if (state.counts.day !== day) {
    state.counts.day = day;
    state.counts.easyApply = 0;
    state.counts.messages = 0;
    state.counts.invitations = 0;
    state.counts.pageViews = 0;
    state.sessionsToday = 0;
    if (state.stoppedForDay && state.stoppedForDay !== day) state.stoppedForDay = null;
  }
  if (state.counts.week !== week) {
    state.counts.week = week;
    state.counts.invitationsWeek = 0;
  }
  const cutoff = now.getTime() - 60 * 60 * 1000;
  state.hourWindow = (state.hourWindow ?? []).filter((stamp) => Date.parse(stamp) >= cutoff);
  return state;
}

function capName(action) {
  if (action === "easyApply") return "easyApplyPerDay";
  if (action === "message") return "messagesPerDay";
  if (action === "invitation") return "invitationsPerDay";
  if (action === "pageView") return "pageViewsPerDay";
  return "";
}

function countName(action) {
  if (action === "easyApply") return "easyApply";
  if (action === "message") return "messages";
  if (action === "invitation") return "invitations";
  if (action === "pageView") return "pageViews";
  return "";
}

export function featureEnabled(state, action) {
  if (action === "easyApply") return Boolean(state.autonomous?.easyApply);
  if (action === "autoAdd") return Boolean(state.autonomous?.autoAdd);
  if (action === "invitation") return Boolean(state.autonomous?.invitations);
  if (action === "message") return false;
  return false;
}

export function messageCategoryEnabled(state, category) {
  return Boolean(state.autonomous?.messages?.[category]);
}

export function decide(state, action, now = new Date(), options = {}) {
  rollState(state, now);
  if (state.killed) return { allow: false, preview: false, reason: "Interrupteur d'arrêt actif." };
  if (state.cooldownUntil && Date.parse(state.cooldownUntil) > now.getTime()) {
    return { allow: false, preview: false, reason: `Pause de sécurité jusqu'au ${state.cooldownUntil}.` };
  }
  if (state.stoppedForDay === parisParts(now).dayKey) {
    return { allow: false, preview: false, reason: "Arrêt pour la journée après plusieurs erreurs." };
  }
  if (!withinWorkingHours(state, now)) {
    return { allow: false, preview: false, reason: "Hors des heures ouvrées (lun–ven, 8 h 30–19 h 30, Paris)." };
  }
  if (state.nextAllowedAt && Date.parse(state.nextAllowedAt) > now.getTime()) {
    return { allow: false, preview: false, reason: "Délai en cours entre deux actions." };
  }
  const last = state.lastActionAt ? Date.parse(state.lastActionAt) : 0;
  if (last && now.getTime() - last > SESSION_GAP_MS) {
    /* A new session will be counted when the action is recorded. */
  } else if (!last && state.sessionsToday === 0) {
    /* First action opens session 1. */
  }
  const projectedSessions = state.sessionsToday + (!last || now.getTime() - last > SESSION_GAP_MS ? 1 : 0);
  if (projectedSessions > (state.caps?.sessionsPerDay ?? DEFAULT_CAPS.sessionsPerDay) && (!last || now.getTime() - last > SESSION_GAP_MS)) {
    return { allow: false, preview: false, reason: "Nombre de sessions du jour atteint." };
  }
  const index = dayIndex(state, now);
  const baseKey = capName(action);
  if (baseKey) {
    const cap = effectiveCap(state.caps?.[baseKey] ?? DEFAULT_CAPS[baseKey], index, state.warmup !== false);
    const used = state.counts[countName(action)] ?? 0;
    if (used >= cap) return { allow: false, preview: false, reason: `Plafond ${action} atteint (${used}/${cap}).` };
  }
  if (action === "invitation") {
    const weekly = effectiveCap(
      state.caps?.invitationsPerWeek ?? DEFAULT_CAPS.invitationsPerWeek,
      index,
      state.warmup !== false,
    );
    if ((state.counts.invitationsWeek ?? 0) >= weekly) {
      return { allow: false, preview: false, reason: `Plafond hebdomadaire d'invitations atteint (${weekly}).` };
    }
  }
  const hourCap = state.caps?.actionsPerHour ?? DEFAULT_CAPS.actionsPerHour;
  if ((state.hourWindow ?? []).length >= hourCap) {
    return { allow: false, preview: false, reason: "Plafond horaire atteint. Les actions sont étalées." };
  }
  if (options.autonomous && state.dryRun !== false) {
    return { allow: false, preview: true, reason: "Mode répétition : aperçu seulement, rien n'est envoyé." };
  }
  if (options.autonomous && action === "message" && !messageCategoryEnabled(state, options.category)) {
    return { allow: false, preview: true, reason: "Envoi autonome désactivé pour cette catégorie." };
  }
  if (options.autonomous && action !== "message" && !featureEnabled(state, action)) {
    return { allow: false, preview: true, reason: "Mode autonome désactivé pour cette action." };
  }
  return { allow: true, preview: false, reason: "" };
}

export function recordAction(state, action, now = new Date(), random = Math.random) {
  rollState(state, now);
  const last = state.lastActionAt ? Date.parse(state.lastActionAt) : 0;
  if (!last || now.getTime() - last > SESSION_GAP_MS) state.sessionsToday += 1;
  const key = countName(action);
  if (key) state.counts[key] += 1;
  if (action === "invitation") state.counts.invitationsWeek += 1;
  state.hourWindow.push(now.toISOString());
  state.lastActionAt = now.toISOString();
  state.actionsSinceBreak = (state.actionsSinceBreak ?? 0) + 1;
  const wait = action === "easyApply" ? applicationDelayMs(random) : actionDelayMs(random);
  let extra = 0;
  if (state.actionsSinceBreak >= 4 + Math.floor(random() * 4)) {
    state.actionsSinceBreak = 0;
    extra = Math.round((3 + random() * 5) * 60 * 1000);
  }
  state.nextAllowedAt = new Date(now.getTime() + wait + extra).toISOString();
  state.consecutiveErrors = 0;
  pushLog(state, now, action);
  return state;
}

export function applyWarning(state, kind, now = new Date(), random = Math.random) {
  const hours = 24 + random() * 24;
  state.cooldownUntil = new Date(now.getTime() + hours * 3600 * 1000).toISOString();
  state.cooldownReason = kind;
  state.warnings = [{ at: now.toISOString(), kind }, ...(state.warnings ?? [])].slice(0, 20);
  state.consecutiveErrors = 0;
  pushLog(state, now, `warning:${kind}`);
  return state;
}

export function applyError(state, now = new Date()) {
  state.consecutiveErrors = (state.consecutiveErrors ?? 0) + 1;
  if (state.consecutiveErrors >= 3) state.stoppedForDay = parisParts(now).dayKey;
  pushLog(state, now, "error");
  return state;
}

function pushLog(state, now, kind) {
  state.log = [{ at: now.toISOString(), kind }, ...(state.log ?? [])].slice(0, 80);
}

export function actionDelayMs(random = Math.random) {
  return Math.round((8 + random() * 32) * 1000);
}

export function applicationDelayMs(random = Math.random) {
  return Math.round((120 + random() * 240) * 1000);
}

export function readingDelayMs(textLength, random = Math.random) {
  const length = Math.max(0, Number(textLength) || 0);
  return Math.min(90_000, Math.round(800 + length * (8 + random() * 12)));
}

export function typingDelayMs(random = Math.random) {
  return Math.round(40 + random() * 140);
}

export function safetySnapshot(state, now = new Date()) {
  rollState(state, now);
  const index = dayIndex(state, now);
  const line = (label, used, baseKey) => {
    const cap = effectiveCap(state.caps?.[baseKey] ?? DEFAULT_CAPS[baseKey], index, state.warmup !== false);
    return `${label} ${used}/${cap}`;
  };
  return {
    killed: Boolean(state.killed),
    dryRun: state.dryRun !== false,
    cooldownUntil: state.cooldownUntil,
    cooldownReason: state.cooldownReason,
    stoppedForDay: state.stoppedForDay,
    lastWarning: state.warnings?.[0] ?? null,
    lines: [
      line("Candidatures", state.counts.easyApply, "easyApplyPerDay"),
      line("Messages", state.counts.messages, "messagesPerDay"),
      line("Invitations (jour)", state.counts.invitations, "invitationsPerDay"),
      line("Invitations (semaine)", state.counts.invitationsWeek, "invitationsPerWeek"),
      line("Pages vues", state.counts.pageViews, "pageViewsPerDay"),
      `Actions cette heure ${state.hourWindow.length}/${state.caps?.actionsPerHour ?? DEFAULT_CAPS.actionsPerHour}`,
      `Sessions ${state.sessionsToday}/${state.caps?.sessionsPerDay ?? DEFAULT_CAPS.sessionsPerDay}`,
    ],
  };
}
