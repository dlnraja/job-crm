import { answerQuestion } from "./lib/easy-apply.mjs";
import { guessEmails } from "./lib/email-guesser.mjs";
import { encryptEnvelope, encryptWithKey, openEnvelope } from "./lib/crypto.mjs";
import { renderCoverLetter } from "./lib/letters.mjs";
import { mayContact, renderVariant } from "./lib/linkedin-messages.mjs";
import {
  applyError,
  applyWarning,
  decide,
  freshSafetyState,
  recordAction,
  safetySnapshot,
} from "./lib/linkedin-safety.mjs";
import { textToPdf } from "./lib/pdf-text.mjs";

const runtime = globalThis.chrome ?? globalThis.browser;
const VAULT_USER = "coffre-extension";
const memory = {
  state: freshSafetyState(),
  key: null,
  salt: "",
  iterations: 0,
  profile: {},
  learned: {},
  busy: false,
};

let queue = Promise.resolve();

function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function persist() {
  if (!memory.key) return;
  const payload = {
    auth: { username: VAULT_USER },
    state: memory.state,
    profile: memory.profile,
    learned: memory.learned,
  };
  const envelope = await encryptWithKey(memory.key, payload, {
    salt: memory.salt,
    iterations: memory.iterations,
  });
  await runtime.storage.local.set({ envelope });
}

function publicStatus() {
  const snap = safetySnapshot(memory.state);
  return {
    unlocked: Boolean(memory.key),
    summary: memory.key ? "Extension déverrouillée." : "Extension verrouillée.",
    safetyText: snap.lines.join("\n"),
    killed: snap.killed,
    dryRun: snap.dryRun,
    cooldownUntil: snap.cooldownUntil,
    cooldownReason: snap.cooldownReason,
    lastWarning: snap.lastWarning,
    log: (memory.state.log ?? []).slice(0, 12),
  };
}

async function notifyCrm(extra = {}) {
  const tabs = await runtime.tabs.query({
    url: ["https://dlnraja.github.io/job-crm/*", "http://127.0.0.1/*", "http://localhost/*"],
  });
  for (const tab of tabs) {
    if (!tab.id) continue;
    runtime.tabs.sendMessage(tab.id, { source: "coffre-extension", type: "status", ...publicStatus(), ...extra }).catch(() => {});
  }
}

runtime.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  enqueue(() => handle(message))
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, reason: error instanceof Error ? error.message : "erreur" }));
  return true;
});

async function handle(message) {
  if (message?.type === "unlock") {
    const stored = await runtime.storage.local.get("envelope");
    if (!stored.envelope) {
      const state = freshSafetyState();
      const envelope = await encryptEnvelope(message.passphrase, {
        auth: { username: VAULT_USER },
        state,
        profile: {},
        learned: {},
      });
      const opened = await openEnvelope(envelope, message.passphrase, VAULT_USER);
      memory.state = opened.data.state;
      memory.profile = {};
      memory.learned = {};
      memory.key = opened.key;
      memory.salt = opened.salt;
      memory.iterations = opened.iterations;
      await runtime.storage.local.set({ envelope });
      return { ok: true, created: true, ...publicStatus() };
    }
    const opened = await openEnvelope(stored.envelope, message.passphrase, VAULT_USER);
    memory.state = opened.data.state ?? freshSafetyState();
    memory.profile = opened.data.profile ?? {};
    memory.learned = opened.data.learned ?? {};
    memory.key = opened.key;
    memory.salt = opened.salt;
    memory.iterations = opened.iterations;
    return { ok: true, ...publicStatus() };
  }
  if (message?.type === "lock") {
    memory.key = null;
    return { ok: true, ...publicStatus() };
  }
  if (!memory.key) return { ok: false, reason: "Verrouillez puis ouvrez l'extension avec la phrase secrète." };
  if (message?.type === "status") return { ok: true, ...publicStatus() };
  if (message?.type === "sync-offer") {
    await notifyCrm({ type: "offer", job: message.job, people: message.people, score: message.score, interests: message.interests });
    return { ok: true };
  }
  if (message?.type === "kill") {
    memory.state.killed = Boolean(message.on);
    await persist();
    await notifyCrm();
    return { ok: true, ...publicStatus() };
  }
  if (message?.type === "profile") {
    memory.profile = { ...memory.profile, ...message.profile };
    await persist();
    return { ok: true };
  }
  if (message?.type === "decide") {
    if (memory.busy && message.action !== "status") {
      return { allow: false, preview: false, reason: "Une seule action à la fois." };
    }
    const decision = decide(memory.state, message.action, new Date(), {
      autonomous: Boolean(message.autonomous),
      category: message.category,
    });
    return { ok: true, ...decision, ...publicStatus() };
  }
  if (message?.type === "record") {
    memory.busy = true;
    try {
      recordAction(memory.state, message.action);
      await persist();
      await notifyCrm();
      return { ok: true, ...publicStatus() };
    } finally {
      memory.busy = false;
    }
  }
  if (message?.type === "warning") {
    applyWarning(memory.state, message.kind || "warning");
    await persist();
    await notifyCrm({ warning: `LinkedIn : ${message.kind}. Pause de 24 à 48 h.` });
    return { ok: true, ...publicStatus() };
  }
  if (message?.type === "error") {
    applyError(memory.state);
    await persist();
    await notifyCrm();
    return { ok: true, ...publicStatus() };
  }
  if (message?.type === "guess") {
    return {
      ok: true,
      rows: guessEmails({
        firstName: message.firstName,
        lastName: message.lastName,
        domain: message.domain,
        samples: message.samples ?? [],
        bouncedPatterns: message.bouncedPatterns ?? [],
      }).slice(0, 5),
    };
  }
  if (message?.type === "letter") {
    const letter = renderCoverLetter({
      profile: memory.profile,
      offerText: message.offerText,
      role: message.role,
      company: message.company,
    });
    return { ok: true, text: letter.text, pdf: textToPdf(letter.text) };
  }
  if (message?.type === "answer") {
    const result = answerQuestion(message.question, memory.profile, memory.learned);
    return { ok: true, ...result };
  }
  if (message?.type === "learn") {
    memory.learned = { ...memory.learned, [message.key]: message.answer };
    await persist();
    return { ok: true };
  }
  if (message?.type === "draft") {
    const gate = mayContact({
      linkedApplicationId: message.linkedApplicationId,
      threadId: message.threadId,
      threadsReplied: memory.state.threadsReplied,
    });
    if (!gate.ok) return { ok: false, reason: gate.reason };
    const text = renderVariant(message.category, message.fields, memory.state.lastTexts);
    if (!text) return { ok: false, reason: "Texte déjà utilisé. Aucun envoi." };
    return { ok: true, text };
  }
  if (message?.type === "sent") {
    memory.state.lastTexts = [message.text, ...(memory.state.lastTexts ?? [])].slice(0, 30);
    if (message.threadId) memory.state.threadsReplied[message.threadId] = true;
    recordAction(memory.state, message.action || "message");
    await persist();
    await notifyCrm();
    return { ok: true };
  }
  return { ok: false, reason: "Message inconnu." };
}
