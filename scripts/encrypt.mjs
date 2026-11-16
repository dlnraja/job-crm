import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { encryptEnvelope } from "../src/lib/crypto.mjs";

const input = process.argv[2];
const output = process.argv[3] ?? path.resolve("data/data.enc.json");

if (!input) {
  console.error("Usage: node scripts/encrypt.mjs <data.json> [data/data.enc.json]");
  process.exit(1);
}

const password = process.env.CRM_PASSWORD;
if (!password) {
  console.error("CRM_PASSWORD is required.");
  process.exit(1);
}

let plaintext;
try {
  plaintext = JSON.parse(readFileSync(input, "utf8"));
} catch {
  console.error("Le fichier clair est illisible ou n'est pas du JSON.");
  process.exit(1);
}

try {
  const envelope = await encryptEnvelope(password, plaintext);
  writeFileSync(output, `${JSON.stringify(envelope, null, 2)}\n`);
  console.error(`Wrote ${output}`);
} catch (error) {
  if (error instanceof Error && error.message === "username") {
    console.error("Le JSON clair doit contenir auth.username (non vide).");
  } else {
    console.error("Chiffrement impossible.");
  }
  process.exit(1);
}
