import path from "node:path";
import os from "node:os";
import { access, mkdtemp, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { native, providers, FileProvider, FileStorageError } from "./native.js";
import {
  Dataset,
  decodeDataset,
  emptyDataset,
  modelNames,
  recordSession,
  storageError,
  validateDataset,
} from "./records.js";

export type FileProfile = {
  mode: "file";
  path: string;
  identity: string;
} & FileProvider;
export function databasePath(input: string) {
  const value = input.trim();
  if (
    !path.isAbsolute(value) ||
    !/\.(mdb|accdb)$/i.test(value) ||
    /[\r\n\0]/.test(value)
  )
    throw new FileStorageError(
      "PATH",
      "Informe o caminho completo de um arquivo .mdb ou .accdb.",
    );
  const full = path.normalize(value);
  const roots = [
    process.env.OneDrive,
    process.env.OneDriveCommercial,
    process.env.OneDriveConsumer,
  ].filter(Boolean) as string[];
  if (
    roots.some((root) => {
      const rel = path.relative(root.toLowerCase(), full.toLowerCase());
      return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    })
  )
    throw new FileStorageError(
      "SYNC",
      "Escolha uma pasta do servidor ou uma pasta local fora do OneDrive.",
    );
  return full;
}
export class FileStore {
  constructor(public profile: FileProfile) {}
  async read() {
    const result = await native(this.profile, {
      operation: "read",
      path: this.profile.path,
    });
    if (result.identity !== this.profile.identity)
      throw new FileStorageError(
        "BASE_CHANGED",
        "O arquivo foi substituído por outra base. Selecione a base novamente.",
      );
    if (!Number.isSafeInteger(result.revision) || result.revision! < 1)
      throw new FileStorageError("INVALID", "Versão de gravação inválida.");
    return { revision: result.revision!, data: decodeDataset(result.data!) };
  }
  async write(revision: number, data: Dataset) {
    validateDataset(data);
    const payload = JSON.stringify(data);
    if (Buffer.byteLength(payload, "utf8") > 16 * 1024 * 1024)
      throw new FileStorageError(
        "SIZE",
        "A base atingiu o limite de 16 MB desta versão. Faça uma cópia de segurança e contate o suporte.",
      );
    try {
      await native(this.profile, {
        operation: "write",
        path: this.profile.path,
        identity: this.profile.identity,
        revision,
        data: payload,
      });
    } catch (error) {
      if (error instanceof FileStorageError && error.code === "CONFLICT")
        throw storageError(
          "P2034",
          "Outra gravação ocorreu. Atualize e tente novamente.",
        );
      throw error;
    }
  }
}
export async function openFile(input: string, expected?: FileProfile) {
  const file = databasePath(input);
  if (!(await stat(file).catch(() => null))?.isFile())
    throw new FileStorageError(
      "UNAVAILABLE",
      "Arquivo não encontrado. Confira o caminho e o acesso à pasta.",
    );
  let last: unknown;
  for (const provider of expected
    ? [expected]
    : providers.filter(
        (p) => !/\.accdb$/i.test(file) || !p.provider.includes("Jet"),
      )) {
    try {
      const value = await native(provider, { operation: "read", path: file });
      if (!value.identity || !/^[\da-f-]{36}$/i.test(value.identity))
        throw new FileStorageError(
          "INVALID",
          "O arquivo não contém uma base válida do Mini ERP.",
        );
      const store = new FileStore({
        ...provider,
        mode: "file",
        path: file,
        identity: expected?.identity || value.identity,
      });
      const snapshot = await store.read();
      return { store, snapshot };
    } catch (error) {
      last = error;
      if (
        error instanceof FileStorageError &&
        !["PROVIDER", "UNAVAILABLE"].includes(error.code)
      )
        throw error;
    }
  }
  throw (
    last ||
    new FileStorageError(
      "PROVIDER",
      "Componente de banco em arquivo indisponível neste computador.",
    )
  );
}
export async function createFile(
  input: string,
  data: Dataset = emptyDataset(),
) {
  const file = databasePath(input);
  if (
    await access(file).then(
      () => true,
      () => false,
    )
  )
    throw new FileStorageError(
      "EXISTS",
      "Este arquivo já existe. Escolha outro nome ou abra a base existente.",
    );
  if (!(await stat(path.dirname(file)).catch(() => null))?.isDirectory())
    throw new FileStorageError(
      "PATH",
      "A pasta de destino precisa existir e permitir gravação.",
    );
  validateDataset(data);
  const payload = JSON.stringify(data);
  if (Buffer.byteLength(payload, "utf8") > 16 * 1024 * 1024)
    throw new FileStorageError(
      "SIZE",
      "A base ultrapassa o limite de 16 MB desta versão.",
    );
  // Descobrir o componente num arquivo descartável local, antes de tocar no destino.
  const temp = await mkdtemp(path.join(os.tmpdir(), "minierp-engine-"));
  let selected: FileProvider | undefined;
  try {
    for (const p of providers.filter(
      (p) => !/\.accdb$/i.test(file) || !p.provider.includes("Jet"),
    )) {
      try {
        await native(p, {
          operation: "create",
          path: path.join(temp, randomUUID() + path.extname(file)),
          identity: randomUUID(),
          data: JSON.stringify(emptyDataset()),
        });
        selected = p;
        break;
      } catch (error) {
        if (
          !(error instanceof FileStorageError) ||
          !["PROVIDER", "UNAVAILABLE"].includes(error.code)
        )
          throw error;
      }
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
  if (!selected)
    throw new FileStorageError(
      "PROVIDER",
      "Nenhum componente compatível foi encontrado. Para .mdb, verifique o suporte Access/Jet do Windows; .accdb requer ACE.",
    );
  const identity = randomUUID();
  await native(selected, {
    operation: "create",
    path: file,
    identity,
    data: payload,
  });
  return new FileStore({ ...selected, mode: "file", path: file, identity });
}
export function fileClient(store: FileStore): PrismaClient {
  let tail: Promise<unknown> = Promise.resolve();
  async function queued<T>(run: () => Promise<T>) {
    const pending = tail.then(run, run);
    tail = pending.catch(() => {});
    return pending;
  }
  async function transaction(fn: (tx: any) => Promise<any>) {
    const snapshot = await store.read();
    const session = recordSession(snapshot.data);
    const result = await fn(session.client);
    if (session.dirty) await store.write(snapshot.revision, session.data);
    return result;
  }
  const client: any = {
    $connect: async () => {
      await store.read();
    },
    $disconnect: async () => {},
    $transaction: (fn: (tx: any) => Promise<any>) =>
      queued(() => transaction(fn)),
    $queryRaw: (...args: any[]) => transaction((tx) => tx.$queryRaw(...args)),
    $executeRaw: (...args: any[]) =>
      transaction((tx) => tx.$executeRaw(...args)),
  };
  for (const model of modelNames)
    client[model[0].toLowerCase() + model.slice(1)] = new Proxy(
      {},
      {
        get:
          (_, method: string) =>
          async (...args: any[]) => {
            const run = async () => {
              for (let attempt = 0; ; attempt++) {
                try {
                  return await transaction((tx) =>
                    tx[model[0].toLowerCase() + model.slice(1)][method](
                      ...args,
                    ),
                  );
                } catch (error: any) {
                  if (error?.code !== "P2034" || attempt >= 7) throw error;
                  await new Promise((r) =>
                    setTimeout(
                      r,
                      50 + Math.random() * Math.min(1200, 100 * 2 ** attempt),
                    ),
                  );
                }
              }
            };
            return [
              "findMany",
              "findFirst",
              "findUnique",
              "findFirstOrThrow",
              "findUniqueOrThrow",
              "count",
              "groupBy",
            ].includes(method)
              ? run()
              : queued(run);
          },
      },
    );
  return client;
}
