import "dotenv/config";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import {
  emptyDataset,
  modelNames,
  validateDataset,
} from "../server/storage/records.js";
import { createFile, fileClient, openFile } from "../server/storage/file.js";

const destination = process.argv[process.argv.indexOf("--out") + 1];
if (!process.argv.includes("--out") || !destination)
  throw new Error(
    "Informe --out com o caminho completo de um novo arquivo .mdb ou .accdb.",
  );
const sourceFile = process.argv.includes("--from-file")
  ? process.argv[process.argv.indexOf("--from-file") + 1]
  : undefined;
// O cliente de origem é isolado da configuração por computador e nunca escreve.
const source = sourceFile
  ? fileClient((await openFile(sourceFile)).store)
  : new PrismaClient({ log: [] });
try {
  const data = await source.$transaction(
    async (tx) => {
      const value = emptyDataset();
      for (const name of modelNames)
        value.models[name] = await (tx as any)[
          name[0].toLowerCase() + name.slice(1)
        ].findMany();
      return value;
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
  // Uma cópia tem identidade própria e não transporta sessões de login.
  data.models.Session = [];
  if (process.argv.includes("--public-demo")) {
    // Somente para os cadastros fictícios autorizados para publicação.
    // O modo normal de exportação continua preservando as credenciais.
    const originalHashes = data.models.User.map(
      (user) => user.passwordHash,
    ).filter((hash) => hash.startsWith("$2"));
    for (const [index, user] of data.models.User.entries()) {
      if (user.username !== "sistema.ferias")
        user.username = "historico-" + (index + 1);
      user.passwordHash = "!";
      user.active = false;
    }
    const admin = data.models.User.find(
      (user) => user.role === "RH" && user.username !== "sistema.ferias",
    );
    assert.ok(admin, "A demonstração precisa ter um autor de RH existente.");
    admin.username = "demo";
    admin.passwordHash = await bcrypt.hash("DemoMiniERP2026!", 12);
    admin.active = true;
    const payload = JSON.stringify(data);
    assert.ok(
      originalHashes.every((hash) => !payload.includes(hash)),
      "Credencial original encontrada na cópia pública.",
    );
  }
  validateDataset(data);
  const store = await createFile(destination, data);
  const saved = (await store.read()).data;
  assert.deepEqual(
    JSON.parse(JSON.stringify(saved)),
    JSON.parse(JSON.stringify(data)),
    "Os dados relidos não correspondem integralmente à origem.",
  );
  for (const name of modelNames)
    if (saved.models[name].length !== data.models[name].length)
      throw new Error("A cópia não passou na conferência: " + name);
  console.log(
    JSON.stringify(
      {
        path: store.profile.path,
        identity: store.profile.identity,
        counts: Object.fromEntries(
          modelNames.map((name) => [name, saved.models[name].length]),
        ),
      },
      null,
      2,
    ),
  );
} finally {
  await source.$disconnect();
}
