import { readFileSync } from "node:fs";
import { openEnvelope } from "../src/lib/crypto.mjs";

const input = process.argv[2];

if (!input) {
  console.error("Usage: CRM_PASSWORD=… CRM_USERNAME=… node scripts/decrypt.mjs <data.enc.json>");
  process.exit(1);
}

const password = process.env.CRM_PASSWORD;
const username = process.env.CRM_USERNAME;
if (!password || !username) {
  console.error("CRM_PASSWORD and CRM_USERNAME are required.");
  process.exit(1);
}

let envelope;
try {
  envelope = JSON.parse(readFileSync(input, "utf8"));
} catch {
  console.error("Fichier chiffré illisible.");
  process.exit(1);
}

try {
  const opened = await openEnvelope(envelope, password, username);
  process.stdout.write(`${JSON.stringify(opened.data, null, 2)}\n`);
} catch {
  console.error("Déchiffrement impossible (identifiants ou fichier).");
  process.exit(1);
}
