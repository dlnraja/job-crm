const runtime = globalThis.chrome ?? globalThis.browser;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function load(name) {
  return import(runtime.runtime.getURL(`lib/${name}`));
}

let working = false;

async function consider() {
  if (working || document.body.dataset.coffreReplied === "1") return;
  working = true;
  try {
    await considerOnce();
  } finally {
    working = false;
  }
}

async function considerOnce() {
  const thread = document.querySelector("[data-message-id], .msg-s-message-list");
  if (!thread) return;
  const text = thread.innerText?.slice(0, 4000) || "";
  const { classifyRecruiterMessage } = await load("linkedin-messages.mjs");
  const category = classifyRecruiterMessage(text);
  if (category === "other") return;
  const threadId = location.pathname;
  const draft = await runtime.runtime.sendMessage({
    type: "draft",
    category,
    threadId,
    linkedApplicationId: document.body.dataset.coffreOffer || "",
    fields: { firstName: "", role: "ce poste", company: "", detail: "" },
  });
  if (!draft?.ok || !draft.text) return;
  const box = document.querySelector("div[role='textbox'], textarea");
  if (!box) return;
  const decision = await runtime.runtime.sendMessage({
    type: "decide",
    action: "message",
    autonomous: true,
    category,
  });
  if (!decision?.allow) {
    box.setAttribute("data-coffre-draft", draft.text);
    return;
  }
  box.focus();
  for (const char of draft.text) {
    document.execCommand("insertText", false, char);
    await sleep(40 + Math.floor(Math.random() * 140));
  }
  const send = [...document.querySelectorAll("button")].find((button) => /envoyer|send/i.test(button.innerText || ""));
  send?.click();
  document.body.dataset.coffreReplied = "1";
  runtime.runtime.sendMessage({ type: "sent", action: "message", text: draft.text, threadId });
}

setInterval(consider, 8000);
