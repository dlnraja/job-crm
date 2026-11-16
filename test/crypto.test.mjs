import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  MIN_ITERATIONS,
  encryptEnvelope,
  encryptWithKey,
  openEnvelope,
  validateEnvelope,
} from "../src/lib/crypto.mjs";

const execFileAsync = promisify(execFile);

test("round-trips AES-256-GCM with PBKDF2-SHA256", async () => {
  const plaintext = {
    auth: { username: "demo" },
    schemaVersion: 1,
    note: "rond — accents et clés",
  };
  const envelope = await encryptEnvelope("correct horse battery", plaintext);

  assert.equal(envelope.v, 1);
  assert.equal(envelope.alg, "AES-256-GCM");
  assert.equal(envelope.kdf, "PBKDF2-SHA256");
  assert.ok(envelope.iterations >= 600_000);
  assert.equal(envelope.iterations, MIN_ITERATIONS);
  validateEnvelope(envelope);

  const opened = await openEnvelope(envelope, "correct horse battery", "demo");
  assert.deepEqual(opened.data, plaintext);

  const again = await encryptWithKey(opened.key, plaintext, {
    salt: opened.salt,
    iterations: opened.iterations,
  });
  const reopened = await openEnvelope(again, "correct horse battery", " demo ");
  assert.deepEqual(reopened.data, plaintext);
});

test("two encryptions use a fresh salt and IV", async () => {
  const plaintext = { auth: { username: "demo" }, n: 1 };
  const a = await encryptEnvelope("same-password", plaintext);
  const b = await encryptEnvelope("same-password", plaintext);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
});

test("wrong password fails with a generic error", async () => {
  const envelope = await encryptEnvelope("right-password", {
    auth: { username: "demo" },
  });
  await assert.rejects(
    openEnvelope(envelope, "wrong-password", "demo"),
    (error) => error instanceof Error && error.message === "auth",
  );
});

test("wrong username fails even with the right password", async () => {
  const envelope = await encryptEnvelope("right-password", {
    auth: { username: "demo" },
  });
  await assert.rejects(
    openEnvelope(envelope, "right-password", "autre"),
    (error) => error instanceof Error && error.message === "auth",
  );
});

test("username comparison is NFC-insensitive", async () => {
  const composed = "Élodie";
  const decomposed = "E\u0301lodie";
  const envelope = await encryptEnvelope("right-password", {
    auth: { username: decomposed },
  });
  const opened = await openEnvelope(envelope, "right-password", composed);
  assert.equal(opened.data.auth.username.normalize("NFC"), composed);
});

test("password is not trimmed", async () => {
  const envelope = await encryptEnvelope("secret", {
    auth: { username: "demo" },
  });
  await assert.rejects(
    openEnvelope(envelope, "secret ", "demo"),
    (error) => error instanceof Error && error.message === "auth",
  );
});

test("tampered ciphertext fails authentication", async () => {
  const envelope = await encryptEnvelope("right-password", {
    auth: { username: "demo" },
    secret: "valeur",
  });
  const bytes = Buffer.from(envelope.ciphertext, "base64");
  bytes[0] ^= 0xff;
  envelope.ciphertext = bytes.toString("base64");
  await assert.rejects(
    openEnvelope(envelope, "right-password", "demo"),
    (error) => error instanceof Error && error.message === "auth",
  );
});

test("refuses a KDF weaker than 600k iterations", () => {
  assert.throws(
    () =>
      validateEnvelope({
        v: 1,
        alg: "AES-256-GCM",
        kdf: "PBKDF2-SHA256",
        iterations: 1000,
        salt: Buffer.alloc(16, 1).toString("base64"),
        iv: Buffer.alloc(12, 2).toString("base64"),
        tag: Buffer.alloc(16, 3).toString("base64"),
        ciphertext: Buffer.alloc(8, 4).toString("base64"),
      }),
    (error) => error instanceof Error && error.message === "iterations",
  );
});

test("encrypt and decrypt scripts round-trip on disk", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "job-crm-"));
  const plainPath = path.join(dir, "data.json");
  const encPath = path.join(dir, "data.enc.json");
  const plaintext = {
    auth: { username: "demo" },
    schemaVersion: 1,
    marker: "script-round-trip",
  };
  await writeFile(plainPath, JSON.stringify(plaintext));
  try {
    await execFileAsync(process.execPath, ["scripts/encrypt.mjs", plainPath, encPath], {
      cwd: path.resolve("."),
      env: { ...process.env, CRM_PASSWORD: "script-secret" },
    });
    const { stdout } = await execFileAsync(
      process.execPath,
      ["scripts/decrypt.mjs", encPath],
      {
        cwd: path.resolve("."),
        env: { ...process.env, CRM_PASSWORD: "script-secret", CRM_USERNAME: "demo" },
      },
    );
    assert.deepEqual(JSON.parse(stdout), plaintext);
    const raw = await readFile(encPath, "utf8");
    assert.equal(raw.includes("script-round-trip"), false);
    assert.equal(raw.includes("script-secret"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
