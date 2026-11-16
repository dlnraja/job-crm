const runtime = globalThis.chrome ?? globalThis.browser;
const WARNINGS = [
  { kind: "captcha", pattern: /captcha|security check|vérification de sécurité/i },
  { kind: "unusual-activity", pattern: /unusual activity|activité inhabituelle/i },
  { kind: "weekly-limit", pattern: /weekly invitation limit|limite hebdomadaire d'invitations|limite d'invitations/i },
  { kind: "restricted", pattern: /account restricted|temporarily restricted|compte restreint/i },
  { kind: "http-429", pattern: /too many requests|trop de demandes|\b429\b/i },
];

let reported = "";

function look() {
  const text = document.body?.innerText?.slice(0, 20000) ?? "";
  const hit = WARNINGS.find((item) => item.pattern.test(text));
  if (!hit || reported === hit.kind) return;
  reported = hit.kind;
  runtime.runtime.sendMessage({ type: "warning", kind: hit.kind });
  document.documentElement.dataset.coffrePaused = hit.kind;
}

look();
new MutationObserver(() => look()).observe(document.documentElement, { childList: true, subtree: true });
