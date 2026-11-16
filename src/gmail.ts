const READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const COMPOSE_SCOPE = "https://www.googleapis.com/auth/gmail.compose";
const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const MAX_MESSAGES = 25;
const GAP_MS = 150;

interface GsiTokenClient {
  requestAccessToken: (override?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => GsiTokenClient;
        };
      };
    };
  }
}

export interface GmailMessage {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  body: string;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("gis"));
    document.head.appendChild(script);
  });
}

export function requestGmailToken(clientId: string, allowSend: boolean): Promise<{ token: string; canSend: boolean }> {
  const scope = [READ_SCOPE, COMPOSE_SCOPE, allowSend ? SEND_SCOPE : ""].filter(Boolean).join(" ");
  return loadGis().then(
    () =>
      new Promise((resolve, reject) => {
        const oauth = window.google?.accounts?.oauth2;
        if (!oauth) {
          reject(new Error("gis"));
          return;
        }
        const client = oauth.initTokenClient({
          client_id: clientId,
          scope,
          callback: (response) => {
            if (response.access_token) resolve({ token: response.access_token, canSend: allowSend });
            else reject(new Error(response.error || "gmail"));
          },
        });
        client.requestAccessToken();
      }),
  );
}

function decodePart(data?: string) {
  if (!data) return "";
  const binary = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function readParts(part: { body?: { data?: string }; parts?: Array<{ body?: { data?: string }; mimeType?: string; parts?: never[] }> } | undefined): string {
  if (!part) return "";
  if (part.body?.data && !part.parts?.length) return decodePart(part.body.data);
  return (part.parts ?? []).map((child) => readParts(child)).join("\n");
}

export function simplifyGmailMessage(message: {
  id: string;
  snippet?: string;
  payload?: { headers?: Array<{ name: string; value: string }>; body?: { data?: string }; parts?: Array<{ body?: { data?: string }; mimeType?: string }> };
}): GmailMessage {
  const headers = message.payload?.headers ?? [];
  const header = (name: string) => headers.find((item) => item.name.toLowerCase() === name)?.value ?? "";
  return {
    id: message.id,
    from: header("from"),
    subject: header("subject"),
    snippet: message.snippet ?? "",
    body: readParts(message.payload).slice(0, 8000),
  };
}

export async function scanInbox(token: string, fetchImpl: typeof fetch = fetch): Promise<GmailMessage[]> {
  const query = encodeURIComponent(
    'newer_than:365d (candidature OR application OR entretien OR interview OR refusal OR "mailer-daemon" OR undeliverable)',
  );
  const list = await fetchImpl(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${MAX_MESSAGES}&q=${query}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (list.status === 429) throw new Error("rate");
  if (!list.ok) throw new Error("gmail");
  const payload = (await list.json()) as { messages?: Array<{ id: string }> };
  const messages: GmailMessage[] = [];
  for (const item of (payload.messages ?? []).slice(0, MAX_MESSAGES)) {
    await wait(GAP_MS);
    const response = await fetchImpl(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (response.status === 429) break;
    if (!response.ok) continue;
    messages.push(simplifyGmailMessage(await response.json()));
  }
  return messages;
}

async function gmailPost(token: string, path: string, raw: string) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(path === "drafts" ? { message: { raw } } : { raw }),
  });
  if (response.status === 429) throw new Error("rate");
  if (!response.ok) throw new Error("gmail");
  const payload = (await response.json()) as { id?: string; message?: { id?: string } };
  return payload.id || payload.message?.id || "";
}

export function createGmailDraft(token: string, raw: string) {
  return gmailPost(token, "drafts", raw);
}

export function sendGmailMessage(token: string, raw: string) {
  return gmailPost(token, "messages/send", raw);
}
