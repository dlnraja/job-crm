import { copyFileSync, createReadStream, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import type { Connect } from "vite";

function encryptedVault(): Plugin {
  const source = resolve("data/data.enc.json");
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url?.split("?")[0] ?? "";
    if (url !== "/data/data.enc.json") {
      next();
      return;
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    createReadStream(source).pipe(res);
  };
  return {
    name: "encrypted-vault",
    configureServer(server) {
      server.middlewares.use(serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve);
    },
    writeBundle() {
      mkdirSync(resolve("dist/data"), { recursive: true });
      copyFileSync(source, resolve("dist/data/data.enc.json"));
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [encryptedVault()],
});
