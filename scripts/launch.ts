import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await access(path.join(root, "dist/index.html")).catch(() => {
  throw new Error(
    "Interface não preparada. Execute npm.cmd run build antes de iniciar.",
  );
});
const port = Number(process.env.MINIERP_PORT || 3401);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Porta local inválida.");
const url = `http://127.0.0.1:${port}`;
try {
  await fetch(url + "/api/storage/status", {
    signal: AbortSignal.timeout(800),
  });
  throw new Error(
    `A porta ${port} já está em uso. Feche a outra janela do programa ou defina MINIERP_PORT.`,
  );
} catch (e) {
  if (e instanceof Error && e.message.includes("já está em uso")) throw e;
}
const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    APP_ORIGIN: url,
    MINIERP_STORAGE_SETUP: "1",
  },
});
let exited = false;
child.once("exit", (code) => {
  exited = true;
  process.exitCode = code || 0;
});
child.once("error", (error) => {
  exited = true;
  console.error(error.message);
  process.exitCode = 1;
});
for (let attempt = 0; attempt < 120 && !exited; attempt++) {
  try {
    // A página abre antes da leitura da base: o usuário pode corrigir um caminho indisponível.
    const response = await fetch(url + "/", {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) {
      console.log(
        "Mantenha esta janela aberta enquanto usar o sistema. Endereço: " + url,
      );
      if (process.platform === "win32")
        spawn("explorer.exe", [url], {
          windowsHide: true,
          stdio: "ignore",
        }).unref();
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));
