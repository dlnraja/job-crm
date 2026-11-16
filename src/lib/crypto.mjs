export const MIN_ITERATIONS = 600_000;
const MAX_ITERATIONS = 2_000_000;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function canonicalUsername(username) {
  return String(username).normalize("NFC").trim();
}

function material(username, password) {
  return textEncoder.encode(`${canonicalUsername(username)}\0${password}`);
}

function bytesToB64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function b64ToBytes(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error("envelope");
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object") throw new Error("envelope");
  if (envelope.v !== 1) throw new Error("envelope");
  if (envelope.alg !== "AES-256-GCM") throw new Error("envelope");
  if (envelope.kdf !== "PBKDF2-SHA256") throw new Error("envelope");
  if (
    !Number.isInteger(envelope.iterations) ||
    envelope.iterations < MIN_ITERATIONS ||
    envelope.iterations > MAX_ITERATIONS
  ) {
    throw new Error("iterations");
  }
  const salt = b64ToBytes(envelope.salt);
  const iv = b64ToBytes(envelope.iv);
  const tag = b64ToBytes(envelope.tag);
  const ciphertext = b64ToBytes(envelope.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1) {
    throw new Error("envelope");
  }
}

async function deriveKey(password, username, saltBytes, iterations) {
  const baseKey = await crypto.subtle.importKey("raw", material(username, password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function assertStoredUsername(data, username) {
  const stored = data?.auth?.username;
  if (typeof stored !== "string") throw new Error("auth");
  if (canonicalUsername(stored) !== canonicalUsername(username)) throw new Error("auth");
  if (!canonicalUsername(username)) throw new Error("auth");
}

async function decryptWithKey(key, envelope) {
  const iv = b64ToBytes(envelope.iv);
  const ciphertext = b64ToBytes(envelope.ciphertext);
  const tag = b64ToBytes(envelope.tag);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    combined,
  );
  return JSON.parse(textDecoder.decode(plain));
}

export async function encryptWithKey(key, plaintext, { salt, iterations }) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = textEncoder.encode(JSON.stringify(plaintext));
  const cipherBuf = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, encoded),
  );
  if (cipherBuf.length < 16) throw new Error("encrypt");
  const tag = cipherBuf.slice(cipherBuf.length - 16);
  const ciphertext = cipherBuf.slice(0, cipherBuf.length - 16);
  const envelope = {
    v: 1,
    alg: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iterations,
    salt,
    iv: bytesToB64(iv),
    tag: bytesToB64(tag),
    ciphertext: bytesToB64(ciphertext),
  };
  validateEnvelope(envelope);
  return envelope;
}

export async function encryptEnvelope(password, plaintext) {
  if (typeof password !== "string" || password.length === 0) throw new Error("password");
  const username = plaintext?.auth?.username;
  if (typeof username !== "string" || !canonicalUsername(username)) throw new Error("username");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, username, salt, MIN_ITERATIONS);
  return encryptWithKey(key, plaintext, {
    salt: bytesToB64(salt),
    iterations: MIN_ITERATIONS,
  });
}

export async function openEnvelope(envelope, password, username) {
  try {
    validateEnvelope(envelope);
    if (typeof password !== "string" || typeof username !== "string") throw new Error("auth");
    const key = await deriveKey(password, username, b64ToBytes(envelope.salt), envelope.iterations);
    const data = await decryptWithKey(key, envelope);
    assertStoredUsername(data, username);
    return {
      data,
      key,
      salt: envelope.salt,
      iterations: envelope.iterations,
    };
  } catch {
    throw new Error("auth");
  }
}
