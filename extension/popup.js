const runtime = globalThis.chrome ?? globalThis.browser;
const safety = document.querySelector("#safety");
const note = document.querySelector("#note");

async function refresh() {
  const status = await runtime.runtime.sendMessage({ type: "status" });
  safety.textContent = status?.safetyText || status?.reason || "Verrouillé.";
  note.textContent = status?.killed ? "Arrêt d'urgence actif." : status?.dryRun === false ? "Mode autonome possible." : "Mode répétition.";
}

document.querySelector("#unlock").addEventListener("submit", async (event) => {
  event.preventDefault();
  const passphrase = document.querySelector("#pass").value;
  document.querySelector("#pass").value = "";
  const status = await runtime.runtime.sendMessage({ type: "unlock", passphrase });
  note.textContent = status?.ok ? "Ouvert. Les données restent chiffrées sur cet appareil." : "Phrase incorrecte.";
  refresh();
});

document.querySelector("#kill").addEventListener("click", async () => {
  await runtime.runtime.sendMessage({ type: "kill", on: true });
  refresh();
});

refresh();
