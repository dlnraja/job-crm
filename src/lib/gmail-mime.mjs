function utf8Base64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function encodeSubject(value) {
  return `=?UTF-8?B?${utf8Base64(value)}?=`;
}

/**
 * @param {{ to?: string[], cc?: string[], subject: string, body: string }} input
 */
export function buildPlainMessage({ to = [], cc = [], subject, body }) {
  const headers = [
    `To: ${to.join(", ")}`,
    cc.length ? `Cc: ${cc.join(", ")}` : "",
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ].filter(Boolean);
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export function toBase64Url(value) {
  return utf8Base64(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
