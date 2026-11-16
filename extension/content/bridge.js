const runtime = globalThis.chrome ?? globalThis.browser;

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== "coffre-crm") return;
  runtime.runtime.sendMessage(event.data);
});

runtime.runtime.onMessage.addListener((message) => {
  if (message?.source !== "coffre-extension") return;
  window.postMessage(message, location.origin);
});

runtime.runtime.sendMessage({ type: "status" }).then((status) => {
  window.postMessage({ source: "coffre-extension", type: "status", ...status }, location.origin);
});
