export const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

/** Scopes registered on the public OAuth client. gmail.compose is not enabled. */
export function gmailScopes(allowSend) {
  const scopes = [GMAIL_READ_SCOPE];
  if (allowSend) scopes.push(GMAIL_SEND_SCOPE);
  return scopes.join(" ");
}
