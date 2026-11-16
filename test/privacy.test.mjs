import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { openEnvelope } from "../src/lib/crypto.mjs";
import { DEMO_PASSWORD, DEMO_USERNAME } from "../scripts/demo-constants.mjs";

const envelopePath = new URL("../data/data.enc.json", import.meta.url);

test("committed vault is encrypted and holds no plaintext personal data", async () => {
  const raw = await readFile(envelopePath, "utf8");
  const lower = raw.toLowerCase();
  assert.equal(lower.includes("rajasekaram"), false);
  assert.equal(lower.includes("@gmail.com"), false);
  assert.equal(lower.includes("/workspace/"), false);
  assert.equal(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(raw), false);
  const envelope = JSON.parse(raw);
  assert.equal(typeof envelope, "object");
});

test("committed vault does not open with the public demo credentials", async () => {
  const envelope = JSON.parse(await readFile(envelopePath, "utf8"));
  await assert.rejects(
    openEnvelope(envelope, DEMO_PASSWORD, DEMO_USERNAME),
    (error) => error instanceof Error && error.message === "auth",
  );
});
