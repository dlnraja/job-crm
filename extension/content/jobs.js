const runtime = globalThis.chrome ?? globalThis.browser;
const seen = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function load(name) {
  return import(runtime.runtime.getURL(`lib/${name}`));
}

async function typeInto(element, text) {
  element.focus();
  const proto = element instanceof HTMLTextAreaElement
    ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")
    : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  let current = "";
  for (const char of text) {
    current += char;
    proto?.set?.call(element, current);
    element.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: char, inputType: "insertText" }));
    element.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
    await sleep(40 + Math.floor(Math.random() * 140));
  }
}

function labelFor(control) {
  const id = control.getAttribute("id");
  const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
  return explicit?.innerText || control.getAttribute("aria-label") || control.closest("label, div")?.innerText || "";
}

async function readOffer() {
  const { extractJob, extractPeople, extractInterestLinks } = await load("linkedin-extract.mjs");
  const { scoreOffer } = await load("linkedin-score.mjs");
  const main = document.querySelector("main")?.innerHTML || document.body.innerHTML;
  const job = extractJob(main, location.href);
  const people = extractPeople(main);
  const interests = extractInterestLinks(main);
  const profile = (await runtime.runtime.sendMessage({ type: "status" }))?.profile;
  const score = scoreOffer(`${job.title}\n${job.description}`, profile || {});
  return { job, people, interests, score };
}

async function gate(action, autonomous) {
  if (document.documentElement.dataset.coffrePaused) return { allow: false, reason: "Pause de sécurité." };
  return runtime.runtime.sendMessage({ type: "decide", action, autonomous });
}

async function panel(info) {
  const existing = document.getElementById("coffre-panel");
  existing?.remove();
  const box = document.createElement("aside");
  box.id = "coffre-panel";
  box.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99999;width:280px;padding:12px;background:#faf6ee;color:#1c1915;border:1px solid #e0d6c6;border-radius:12px;font:14px system-ui";
  const title = document.createElement("strong");
  title.textContent = info.job.title || "Offre";
  const meta = document.createElement("p");
  meta.textContent = `${info.job.company} · score ${info.score.score}`;
  const add = document.createElement("button");
  add.type = "button";
  add.textContent = "Ajouter au CRM";
  add.addEventListener("click", () => syncOffer(info, false));
  const invite = document.createElement("button");
  invite.type = "button";
  invite.textContent = "Note d'invitation";
  invite.addEventListener("click", () => invitePoster(info));
  box.append(title, meta, add, invite);
  document.body.append(box);
}

async function syncOffer(info, autonomous) {
  const decision = await gate(autonomous ? "autoAdd" : "pageView", autonomous);
  if (!decision?.allow && !decision?.preview) return;
  if (autonomous && !decision.allow) return;
  await runtime.runtime.sendMessage({ type: "record", action: "pageView" });
  await runtime.runtime.sendMessage({
    type: "sync-offer",
    job: info.job,
    people: info.people,
    score: info.score,
    interests: info.interests,
  });
}

async function assistEasyApply() {
  const dialog = document.querySelector("[role='dialog'], dialog");
  if (!dialog) return;
  const { answerQuestion } = await load("easy-apply.mjs");
  const controls = [...dialog.querySelectorAll("input, textarea, select")];
  let unknown = false;
  for (const control of controls) {
    if (control instanceof HTMLInputElement && (control.type === "hidden" || control.type === "file")) continue;
    const question = labelFor(control).slice(0, 400);
    const learned = {};
    const result = answerQuestion(question, {}, learned);
    const stored = await runtime.runtime.sendMessage({ type: "answer", question });
    const answer = stored?.answer || result.answer;
    const source = stored?.source || result.source;
    if (!answer || source === "unknown") {
      unknown = true;
      control.style.outline = "3px solid #a24b2d";
      continue;
    }
    if (control instanceof HTMLSelectElement) {
      const option = [...control.options].find((item) => item.textContent?.toLowerCase().includes(answer.toLowerCase()));
      if (option) control.value = option.value;
      continue;
    }
    await typeInto(control, answer);
  }
  const decision = await gate("easyApply", true);
  const submit = [...dialog.querySelectorAll("button")].find((button) => /submit|envoyer|déposer|next|suivant/i.test(button.innerText || ""));
  if (!submit) return;
  if (unknown || !decision?.allow) {
    submit.style.outline = "3px solid #a24b2d";
    return;
  }
  const { readingDelayMs } = await load("linkedin-safety.mjs");
  const description = dialog.innerText?.length || 400;
  const steps = 3;
  for (let step = 0; step < steps; step += 1) {
    window.scrollBy({ top: 180 + Math.floor(Math.random() * 220), behavior: "smooth" });
    await sleep(Math.round(readingDelayMs(description, Math.random) / steps));
  }
  submit.click();
  runtime.runtime.sendMessage({ type: "record", action: "easyApply" });
}

async function invitePoster(info) {
  const person = info.people[0];
  if (!person || !info.job.id) return;
  const draft = await runtime.runtime.sendMessage({
    type: "draft",
    category: "invitation",
    linkedApplicationId: info.job.id,
    threadId: person.profileUrl,
    fields: { firstName: person.firstName, role: info.job.title, company: info.job.company, detail: "" },
  });
  const note = document.createElement("p");
  note.textContent = draft?.text || draft?.reason || "Pas de note.";
  document.getElementById("coffre-panel")?.append(note);
  const decision = await gate("invitation", true);
  if (!decision?.allow || !draft?.text) return;
  const field = document.querySelector("textarea");
  if (field) await typeInto(field, draft.text);
  const button = [...document.querySelectorAll("button")].find((item) => /se connecter|connect/i.test(item.innerText || ""));
  if (!button) return;
  button.click();
  runtime.runtime.sendMessage({ type: "sent", action: "invitation", text: draft.text, threadId: person.profileUrl });
}

async function tick() {
  if (!/\/jobs\//.test(location.pathname)) return;
  const info = await readOffer();
  if (info.job.id && !seen.has(info.job.id)) {
    seen.add(info.job.id);
    await panel(info);
    const auto = await gate("autoAdd", true);
    if (auto?.allow) await syncOffer(info, true);
  }
  await assistEasyApply();
}

tick();
setInterval(tick, 4000);
