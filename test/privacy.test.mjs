import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { openEnvelope } from "../src/lib/crypto.mjs";
import { assertCrm } from "../src/lib/schema.mjs";
import { DEMO_PASSWORD, DEMO_USERNAME } from "../scripts/demo-constants.mjs";

test("committed vault opens with the public demo credentials and stays fictional", async () => {
  const envelope = JSON.parse(await readFile(new URL("../data/data.enc.json", import.meta.url), "utf8"));
  const opened = await openEnvelope(envelope, DEMO_PASSWORD, DEMO_USERNAME);
  const data = assertCrm(opened.data);
  assert.equal(data.auth.username, DEMO_USERNAME);
  const blob = JSON.stringify(data).toLowerCase();
  assert.equal(blob.includes("rajasekaram"), false);
  assert.equal(blob.includes("@gmail.com"), false);
  assert.equal(blob.includes("/workspace/"), false);
  const emails = [];
  const walk = (value) => {
    if (typeof value === "string") {
      emails.push(...(value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []));
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(data);
  assert.ok(emails.length >= 3);
  for (const email of emails) assert.match(email, /\.example$/i);
});
