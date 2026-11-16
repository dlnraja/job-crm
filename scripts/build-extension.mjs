import { cp, mkdir, readdir, rm, utimes } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(".");
const out = path.join(root, "dist-extension");
const committed = path.join(root, "extension", "dist", "coffre-linkedin.zip");
const stamp = new Date("2026-01-01T00:00:00Z");

async function freezeTimes(dir) {
  await utimes(dir, stamp, stamp);
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await freezeTimes(full);
    else await utimes(full, stamp, stamp);
  }
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(path.resolve("extension"), out, {
  recursive: true,
  filter: (source) => {
    const relative = path.relative(path.resolve("extension"), source);
    if (!relative) return true;
    if (relative === "README.md" || relative.startsWith(`README.md${path.sep}`)) return false;
    if (relative === "dist" || relative.startsWith(`dist${path.sep}`)) return false;
    return !relative.endsWith(".zip");
  },
});
await mkdir(path.join(out, "lib"), { recursive: true });
for (const file of [
  "crypto.mjs",
  "easy-apply.mjs",
  "email-guesser.mjs",
  "letters.mjs",
  "linkedin-extract.mjs",
  "linkedin-messages.mjs",
  "linkedin-safety.mjs",
  "linkedin-score.mjs",
  "pdf-text.mjs",
]) {
  await cp(path.resolve("src/lib", file), path.join(out, "lib", file));
}
await freezeTimes(out);
const zipPath = path.join(out, "coffre-linkedin.zip");
await new Promise((resolve, reject) => {
  const child = spawn("zip", ["-X", "-r", zipPath, "."], { cwd: out, stdio: "inherit" });
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`zip exited ${code}`))));
});
await mkdir(path.dirname(committed), { recursive: true });
await cp(zipPath, committed);
console.log(committed);
