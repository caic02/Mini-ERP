import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fork, ChildProcess } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  access,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  FileStore,
  createFile,
  fileClient,
} from "../../server/storage/file.js";
import { initialDataset } from "../../server/storage/initialize.js";
import type { Server } from "node:http";

let directory: string,
  store: FileStore,
  userId: string,
  server: Server | undefined;
const password = randomUUID();
before(async () => {
  await mkdir(".tools", { recursive: true });
  directory = await mkdtemp(path.resolve(".tools/storage-tests-"));
  store = await createFile(
    path.join(directory, "base.mdb"),
    await initialDataset("admin", password),
  );
  userId = (await store.read()).data.models.User[0].id;
});
after(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
});
function message(child: ChildProcess): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Processo de concorrência excedeu o tempo."));
    }, 30000);
    child.once("message", (value) => {
      clearTimeout(timer);
      resolve(value);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
async function dispute(mode: string, ids: string[]) {
  const workers = ids.map((id) =>
    fork(
      path.resolve("tests/storage/worker.ts"),
      [JSON.stringify(store.profile), mode, id],
      {
        ...{ windowsHide: true },
        execArgv: ["--import", "tsx"],
        stdio: ["ignore", "ignore", "inherit", "ipc"],
      },
    ),
  );
  await Promise.all(workers.map(message));
  const results = workers.map(message);
  workers.forEach((worker) => worker.send("go"));
  return Promise.all(results);
}
test("dois processos na mesma revisão confirmam somente uma alteração e seu histórico", async () => {
  const before = await store.read();
  const results = await dispute("cas", [userId, userId]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.filter((r) => r.code === "P2034").length, 1);
  const saved = await store.read();
  assert.equal(saved.revision, before.revision + 1);
  assert.equal(saved.data.models.Audit.length, 1);
  assert.match(saved.data.models.User[0].username, /^vencedor-/);
});
test("dois processos alteram registros diferentes com nova tentativa sem perder dados", async () => {
  const second = await fileClient(store).user.create({
    data: { username: "segundo", passwordHash: "!", role: "CONSULTA" },
  });
  const results = await dispute("retry", [userId, second.id]);
  assert.ok(results.every((r) => r.ok));
  const users = await fileClient(store).user.findMany();
  assert.ok(users.every((u) => u.username === "alterado-" + u.id));
});
test("erro no fim da transação reverte cadastro e auditoria; FK e unicidade são preservadas", async () => {
  const client = fileClient(store);
  const before = await store.read();
  await assert.rejects(
    client.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { username: "não-salvar" },
      });
      await tx.audit.create({
        data: {
          userId,
          action: "TESTE",
          entity: "User",
          entityId: userId,
          fields: [],
        },
      });
      await tx.user.create({
        data: { username: "não-salvar", passwordHash: "!" },
      });
    }),
    (e: any) => e.code === "P2002",
  );
  assert.deepEqual(await store.read(), before);
  await assert.rejects(
    client.audit.create({
      data: {
        userId: "inexistente",
        action: "TESTE",
        entity: "User",
        entityId: userId,
        fields: [],
      },
    }),
    (e: any) => e.code === "P2003",
  );
  await assert.rejects(
    client.user.delete({ where: { id: userId } }),
    (e: any) => e.code === "P2003",
  );
  assert.deepEqual(await store.read(), before);
});
test("base ausente não cria substituta e identidade diferente é recusada", async () => {
  const original = store.profile.path,
    backup = path.join(directory, "original.mdb");
  await rename(original, backup);
  try {
    await assert.rejects(store.read(), (e: any) => e.code === "UNAVAILABLE");
    await assert.rejects(access(original));
    const other = await createFile(
      original,
      await initialDataset("outra", password),
    );
    assert.notEqual(other.profile.identity, store.profile.identity);
    await assert.rejects(store.read(), (e: any) => e.code === "BASE_CHANGED");
    await rename(original, path.join(directory, "outra.mdb"));
  } finally {
    await rename(backup, original);
  }
});
test("configuração antes do login: origem/token, base nova, persistência local, login e indisponibilidade", async () => {
  delete process.env.MINIERP_FILE_DATABASE;
  process.env.MINIERP_STORAGE_SETUP = "1";
  process.env.MINIERP_STORAGE_CONFIG = path.join(directory, "profile.json");
  process.env.APP_ORIGIN = "http://storage-test";
  const { app } = await import("../../server/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  const status = await fetch(base + "/api/storage/status").then((r) =>
    r.json(),
  );
  assert.equal(status.ready, false);
  assert.equal(status.needsChoice, true);
  const request = (
    route: string,
    body: unknown,
    token = status.token,
    origin = process.env.APP_ORIGIN!,
  ) =>
    fetch(base + "/api/storage/" + route, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "X-Storage-Token": token,
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await request(
        "select",
        { mode: "file", path: store.profile.path },
        "invalid",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "select",
        { mode: "file", path: store.profile.path },
        status.token,
        "http://evil",
      )
    ).status,
    403,
  );
  const file = path.join(directory, "created-by-api.mdb");
  assert.equal(
    (await request("create", { path: file, username: "primeiro", password }))
      .status,
    201,
  );
  const configured = await fetch(base + "/api/storage/status").then((r) =>
    r.json(),
  );
  assert.equal(configured.ready, true);
  assert.equal(configured.path, file);
  const listed = await request("browse", { path: file }).then((r) => r.json());
  assert.equal(listed.path, directory);
  assert.ok(
    listed.entries.some(
      (entry: any) => entry.path === file && !entry.directory,
    ),
  );
  assert.equal(
    (await request("browse", { path: path.join(directory, "missing-folder") }))
      .status,
    422,
  );
  const saved = JSON.parse(
    await readFile(process.env.MINIERP_STORAGE_CONFIG!, "utf8"),
  );
  assert.equal(saved.profile.identity, configured.identity);
  assert.equal(saved.version, 1);
  assert.equal(JSON.stringify(saved).includes(password), false);
  assert.equal(
    (await request("create", { path: file, username: "primeiro", password }))
      .status,
    422,
  );
  const response = await fetch(base + "/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: process.env.APP_ORIGIN!,
    },
    body: JSON.stringify({ username: "primeiro", password }),
  });
  const login = await response.json();
  assert.equal(response.status, 200);
  assert.equal(login.user.role, "RH");
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const me = await fetch(base + "/api/me", { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
  await rename(file, file + ".offline");
  try {
    assert.equal(
      (await fetch(base + "/api/storage/status").then((r) => r.json())).ready,
      false,
    );
    const failed = await fetch(base + "/api/me", {
      headers: { Cookie: cookie },
    });
    assert.equal(failed.status, 503);
    assert.equal((await failed.json()).storageUnavailable, true);
    await assert.rejects(access(file));
  } finally {
    await rename(file + ".offline", file);
  }
  assert.equal((await request("retry", {})).status, 200);
  const restart = () =>
    message(
      fork(path.resolve("tests/storage/worker.ts"), ["{}", "profile"], {
        ...{ windowsHide: true },
        execArgv: ["--import", "tsx"],
        stdio: ["ignore", "ignore", "inherit", "ipc"],
      }),
    );
  const reopened = await restart();
  assert.equal(reopened.ready, true);
  assert.equal(reopened.needsChoice, false);
  assert.equal(reopened.identity, configured.identity);
  await writeFile(
    process.env.MINIERP_STORAGE_CONFIG!,
    JSON.stringify({
      ...saved,
      profile: { ...saved.profile, architecture: "invalid" },
    }),
  );
  try {
    assert.equal((await restart()).ready, false);
  } finally {
    await writeFile(process.env.MINIERP_STORAGE_CONFIG!, JSON.stringify(saved));
  }
});
