import { cp, mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const out = path.resolve("dist-extension");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(path.resolve("extension"), out, {
  recursive: true,
  filter: (source) => !source.endsWith(`${path.sep}README.md`),
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
const zipPath = path.join(out, "coffre-linkedin.zip");
await new Promise((resolve, reject) => {
  const child = spawn("zip", ["-r", zipPath, "."], { cwd: out, stdio: "inherit" });
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`zip exited ${code}`))));
});
console.log(zipPath);
