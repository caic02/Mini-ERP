import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { FileProfile, fileClient, openFile } from "./file.js";
import { FileStorageError, providers } from "./native.js";

type Profile = FileProfile | { mode: "postgres" };
const configPath =
  process.env.MINIERP_STORAGE_CONFIG ||
  path.join(
    process.env.LOCALAPPDATA || os.homedir(),
    "MiddlebyMiniERP",
    "storage.json",
  );
const context = new AsyncLocalStorage<PrismaClient>();
let client: PrismaClient | undefined,
  profile: Profile | undefined,
  failure: Error | undefined;
let initialized: Promise<void> | undefined,
  active = 0,
  switching = false;
export const canPostgres = !!process.env.DATABASE_URL;
export async function initializeStorage() {
  if (!initialized)
    initialized = (async () => {
      try {
        if (process.env.MINIERP_FILE_DATABASE) {
          const opened = await openFile(process.env.MINIERP_FILE_DATABASE);
          profile = opened.store.profile;
          client = fileClient(opened.store);
          return;
        }
        const raw = await readFile(configPath, "utf8").catch((e: any) => {
          if (e.code === "ENOENT") return null;
          throw e;
        });
        if (raw) {
          const saved = JSON.parse(raw);
          if (
            saved.version !== 1 ||
            !["file", "postgres"].includes(saved.profile?.mode)
          )
            throw new FileStorageError(
              "CONFIG",
              "Configuração local incompatível. Escolha a base novamente.",
            );
          profile = saved.profile;
          const configured = profile;
          if (
            configured?.mode === "file" &&
            (!providers.some(
              (p) =>
                p.architecture === configured.architecture &&
                p.provider === configured.provider,
            ) ||
              typeof configured.identity !== "string" ||
              !/^[\da-f-]{36}$/i.test(configured.identity))
          )
            throw new FileStorageError(
              "CONFIG",
              "Configuração da base inválida. Selecione o arquivo novamente.",
            );
        }
        if (profile?.mode === "file") {
          const opened = await openFile(profile.path, profile);
          client = fileClient(opened.store);
        } else if (
          canPostgres &&
          (profile?.mode === "postgres" ||
            process.env.MINIERP_STORAGE_SETUP !== "1")
        )
          client = new PrismaClient({ log: [] });
      } catch (error) {
        failure =
          error instanceof Error ? error : new Error("Base indisponível.");
      }
    })();
  return initialized;
}
export async function currentClient() {
  const captured = context.getStore();
  if (captured) return captured;
  await initializeStorage();
  if (switching)
    throw new FileStorageError(
      "SWITCHING",
      "A configuração está sendo atualizada. Tente novamente.",
    );
  if (!client || failure)
    throw new FileStorageError(
      "UNAVAILABLE",
      failure?.message || "Configure a base de dados para continuar.",
    );
  return client;
}
export async function disconnectStorage() {
  await client?.$disconnect();
}
export async function storageStatus() {
  await initializeStorage();
  let error = failure?.message || "";
  let ready = !!client && !failure;
  if (ready)
    try {
      await client!.$connect();
    } catch {
      ready = false;
      error =
        "A base está indisponível. Confira o caminho, as permissões e a conexão com a pasta.";
    }
  return {
    ready,
    needsChoice:
      !profile &&
      !process.env.MINIERP_FILE_DATABASE &&
      process.env.CONFIRM_TEST_DB !== "SIM",
    mode: profile?.mode || (client ? "postgres" : null),
    path: profile?.mode === "file" ? profile.path : "",
    identity: profile?.mode === "file" ? profile.identity : "",
    error,
    canPostgres,
  };
}
export async function useStorage<T>(fn: () => Promise<T>): Promise<T> {
  const selected = await currentClient();
  active++;
  try {
    return await context.run(selected, fn);
  } finally {
    active--;
  }
}
export async function beginRequest(
  run: () => void,
  completed: (done: () => void) => void,
) {
  const selected = await currentClient();
  active++;
  let finished = false;
  completed(() => {
    if (!finished) {
      finished = true;
      active--;
    }
  });
  context.run(selected, run);
}
export async function selectStorage(next: Profile, candidate: PrismaClient) {
  await initializeStorage();
  if (switching)
    throw new FileStorageError(
      "SWITCHING",
      "Já existe uma alteração de configuração em andamento.",
    );
  switching = true;
  try {
    const start = Date.now();
    while (active) {
      if (Date.now() - start > 30000)
        throw new FileStorageError(
          "BUSY",
          "Aguarde as operações em andamento terminarem e tente novamente.",
        );
      await new Promise((r) => setTimeout(r, 30));
    }
    await candidate.$connect();
    await mkdir(path.dirname(configPath), { recursive: true });
    const temporary = configPath + "." + randomUUID() + ".tmp";
    await writeFile(
      temporary,
      JSON.stringify({ version: 1, profile: next }, null, 2),
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    await rename(temporary, configPath);
    const old = client;
    client = candidate;
    profile = next;
    failure = undefined;
    await old
      ?.$disconnect()
      .catch(() =>
        console.error("A conexão anterior não pôde ser encerrada normalmente."),
      );
  } finally {
    switching = false;
  }
}
export async function retryStorage() {
  if (profile?.mode === "file") {
    const opened = await openFile(profile.path, profile);
    await selectStorage(profile, fileClient(opened.store));
  }
  return storageStatus();
}
export const database = new Proxy({} as PrismaClient, {
  get: (_, key: string) => {
    if (key === "then") return undefined;
    if (key.startsWith("$"))
      return async (...args: any[]) => {
        const selected: any = await currentClient();
        return selected[key](...args);
      };
    return new Proxy(
      {},
      {
        get:
          (_, method: string) =>
          async (...args: any[]) => {
            const selected: any = await currentClient();
            return selected[key][method](...args);
          },
      },
    );
  },
});
