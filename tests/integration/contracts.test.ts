import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, serial } from "../../server/db.js";
import {
  saveContractResource,
  changeContractStatus,
  reconcileContract,
  cancelForecast,
  bootstrap,
} from "../../server/contracts/service.js";
import { app } from "../../server/app.js";
import bcrypt from "bcryptjs";
import { today, iso, addDays } from "../../server/domain.js";
import type { Server } from "node:http";
if (
  process.env.CONFIRM_TEST_DB !== "SIM" ||
  !new URL(process.env.DATABASE_URL || "http://invalid").pathname.endsWith(
    "_test",
  )
)
  throw new Error("Banco _test obrigatório.");
const prefix = "CT-" + randomUUID();
let author: string;
let unit: any;
let term: any;
let supplier: any;
let category: any;
let contract: any;
let item: any;
let server: Server;
let base: string;
const month = today().toISOString().slice(0, 7);
const end = iso(
  new Date(Date.UTC(today().getUTCFullYear(), today().getUTCMonth() + 3, 0)),
);
const fresh = () =>
  db.contract.findUniqueOrThrow({ where: { id: contract.id } });
before(async () => {
  const user = await db.user.create({
    data: { username: prefix, passwordHash: "!", role: "RH" },
  });
  author = user.id;
  unit = await db.unit.create({
    data: {
      code: prefix,
      name: "Unidade fictícia de contratos",
      kind: "FILIAL",
    },
  });
  term = await saveContractResource(
    "payment-terms",
    { name: prefix, mode: "FIXO", day: 31 },
    undefined,
    author,
  );
  supplier = await saveContractResource(
    "suppliers",
    { name: prefix, paymentTermId: term.id },
    undefined,
    author,
  );
  category = await saveContractResource(
    "categories",
    { name: prefix },
    undefined,
    author,
  );
  contract = await saveContractResource(
    "contracts",
    {
      name: prefix,
      supplierId: supplier.id,
      unitId: unit.id,
      categoryId: category.id,
      paymentTermId: term.id,
      kind: "FIXO",
      start: month + "-01",
      end,
      alertDays: 90,
    },
    undefined,
    author,
  );
});
after(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  await db.$disconnect();
});
test("contrato nasce em elaboração; código automático; ativação sem itens é recusada", async () => {
  assert.equal(contract.status, "ELABORACAO");
  assert.match(contract.code, /^C\d{5,}$/);
  await assert.rejects(
    changeContractStatus(
      contract.id,
      { status: "VIGENTE", version: contract.version },
      author,
    ),
    /item ativo/,
  );
  assert.equal(
    await db.contractForecast.count({ where: { contractId: contract.id } }),
    0,
  );
});
test("fornecedor possui categoria padrão; inativação preserva associação e bloqueia novo uso", async () => {
  const updated = await saveContractResource(
    "suppliers",
    { ...supplier, categoryId: category.id },
    supplier.id,
    author,
  );
  assert.equal(updated.categoryId, category.id);
  assert.equal(
    (await bootstrap()).suppliers.find((s) => s.id === supplier.id)?.category
      ?.id,
    category.id,
  );
  await saveContractResource(
    "categories",
    { name: category.name, active: false },
    category.id,
    author,
  );
  await assert.rejects(
    saveContractResource(
      "suppliers",
      { name: prefix + "-blocked", categoryId: category.id },
      undefined,
      author,
    ),
    /Categoria inativa/,
  );
  const preserved = await saveContractResource(
    "suppliers",
    { ...updated, contact: "Contato fictício" },
    supplier.id,
    author,
  );
  assert.equal(preserved.categoryId, category.id);
  await assert.rejects(
    db.contractCategory.delete({ where: { id: category.id } }),
  );
  await saveContractResource(
    "categories",
    { name: category.name, active: true },
    category.id,
    author,
  );
});
test("itens geram cronograma exato e reconciliação concorrente não duplica competências", async () => {
  item = await saveContractResource(
    "items",
    {
      contractId: contract.id,
      version: (await fresh()).version,
      name: "Serviço fictício",
      quantity: "3",
      unitPrice: "0.10",
      billingUnit: "MENSALIDADE",
      allocationMode: "VALOR",
    },
    undefined,
    author,
  );
  let rows = await db.contractForecast.findMany({
    where: { contractId: contract.id },
  });
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.amount.toFixed(2) === "0.30"));
  await Promise.all([
    serial((tx) => reconcileContract(tx, contract.id)),
    serial((tx) => reconcileContract(tx, contract.id)),
  ]);
  assert.equal(
    await db.contractForecast.count({ where: { contractId: contract.id } }),
    3,
  );
  await assert.rejects(
    saveContractResource(
      "items",
      { ...item, quantity: "2", unitPrice: "1.00", version: contract.version },
      item.id,
      author,
    ),
    /outra operação/,
  );
  await saveContractResource(
    "items",
    {
      ...item,
      quantity: "2",
      unitPrice: "12.345",
      version: (await fresh()).version,
    },
    item.id,
    author,
  ).then(
    () => assert.fail("Preço com três casas aceito"),
    () => {},
  );
});
test("mudanças de itens atualizam apenas previsões livres e cancelamentos são preservados", async () => {
  const f = await db.contractForecast.findFirstOrThrow({
    where: { contractId: contract.id },
    orderBy: { month: "asc" },
  });
  await cancelForecast(
    f.id,
    "Cancelamento fictício de planejamento",
    (await fresh()).version,
    author,
  );
  item = await saveContractResource(
    "items",
    {
      ...item,
      quantity: "2.500",
      unitPrice: "20.00",
      version: (await fresh()).version,
    },
    item.id,
    author,
  );
  const rows = await db.contractForecast.findMany({
    where: { contractId: contract.id },
  });
  assert.equal(rows.find((r) => r.id === f.id)!.status, "CANCELADA");
  assert.equal(rows.find((r) => r.id === f.id)!.amount.toFixed(2), "0.30");
  assert.ok(
    rows
      .filter((r) => r.status === "PREVISTA")
      .every((r) => r.amount.toFixed(2) === "50.00"),
  );
});
test("ativação preserva termos e itens; situação respeita versão e encerramento preserva histórico", async () => {
  let c = await fresh();
  c = await changeContractStatus(
    c.id,
    { status: "VIGENTE", version: c.version },
    author,
  );
  assert.ok(c.activatedAt);
  await assert.rejects(
    saveContractResource(
      "items",
      { ...item, quantity: "4", unitPrice: "1.00", version: c.version },
      item.id,
      author,
    ),
    /elaboração/,
  );
  await assert.rejects(
    saveContractResource(
      "contracts",
      {
        ...c,
        start: iso(c.start),
        end: iso(c.end!),
        adjustmentDate: null,
        name: "Mudança indevida",
      },
      c.id,
      author,
    ),
    /revisão/,
  );
  await saveContractResource(
    "payment-terms",
    { name: prefix, mode: "FIXO", day: 5 },
    term.id,
    author,
  );
  await serial((tx) => reconcileContract(tx, c.id));
  assert.equal((await fresh()).paymentDay, 31);
  const suspended = await changeContractStatus(
    c.id,
    { status: "SUSPENSO", version: c.version },
    author,
  );
  assert.equal(suspended.status, "SUSPENSO");
  await assert.rejects(
    changeContractStatus(
      c.id,
      { status: "VIGENTE", version: c.version },
      author,
    ),
    /outra operação/,
  );
  const closed = await changeContractStatus(
    c.id,
    {
      status: "ENCERRADO",
      version: suspended.version,
      closedOn: iso(today()),
      reason: "Encerramento fictício",
    },
    author,
  );
  assert.equal(closed.status, "ENCERRADO");
  assert.equal(
    await db.contractForecast.count({
      where: { contractId: c.id, status: "PREVISTA" },
    }),
    0,
  );
  assert.equal(await db.contractItem.count({ where: { contractId: c.id } }), 1);
  await assert.rejects(db.supplier.delete({ where: { id: supplier.id } }));
});
test("eventual não gera mensalidades; contrato aberto avança até mês de referência", async () => {
  for (const kind of ["EVENTUAL", "FIXO"]) {
    const c = await saveContractResource(
      "contracts",
      {
        name: prefix + "-" + kind,
        supplierId: supplier.id,
        unitId: unit.id,
        categoryId: category.id,
        paymentTermId: term.id,
        start: month + "-01",
        end: null,
        kind,
      },
      undefined,
      author,
    );
    await saveContractResource(
      "items",
      {
        contractId: c.id,
        name: "Item",
        quantity: "1",
        unitPrice: "100.00",
        billingUnit: "SERVICO",
        allocationMode: "VALOR",
        version: c.version,
      },
      undefined,
      author,
    );
    assert.equal(
      await db.contractForecast.count({ where: { contractId: c.id } }),
      kind === "EVENTUAL" ? 0 : 1,
    );
    await serial((tx) =>
      reconcileContract(
        tx,
        c.id,
        new Date(
          Date.UTC(today().getUTCFullYear(), today().getUTCMonth() + 2, 1),
        ),
      ),
    );
    assert.equal(
      await db.contractForecast.count({ where: { contractId: c.id } }),
      kind === "EVENTUAL" ? 0 : 3,
    );
  }
});
test("alterar condição atualiza apenas contratos em elaboração e permite cancelar contrato futuro", async () => {
  const start = iso(
    new Date(Date.UTC(today().getUTCFullYear(), today().getUTCMonth() + 1, 1)),
  );
  const c = await saveContractResource(
    "contracts",
    {
      name: prefix + "-future",
      supplierId: supplier.id,
      unitId: unit.id,
      categoryId: category.id,
      paymentTermId: term.id,
      start,
      end: null,
      kind: "FIXO",
    },
    undefined,
    author,
  );
  await saveContractResource(
    "items",
    {
      contractId: c.id,
      name: "Item futuro",
      quantity: "1",
      unitPrice: "10.00",
      billingUnit: "MENSALIDADE",
      allocationMode: "VALOR",
      version: c.version,
    },
    undefined,
    author,
  );
  await saveContractResource(
    "payment-terms",
    { name: prefix, mode: "FIXO", day: 12 },
    term.id,
    author,
  );
  const current = await db.contract.findUniqueOrThrow({ where: { id: c.id } });
  assert.equal(current.paymentDay, 12);
  assert.equal(
    (
      await db.contractForecast.findFirstOrThrow({
        where: { contractId: c.id },
      })
    ).due.getUTCDate(),
    12,
  );
  assert.equal((await fresh()).paymentDay, 31);
  const cancelled = await changeContractStatus(
    c.id,
    {
      status: "CANCELADO",
      version: current.version,
      closedOn: iso(today()),
      reason: "Cancelamento antes do início",
    },
    author,
  );
  assert.equal(cancelled.status, "CANCELADO");
});
test("consulta e anônimos não acessam dados ou comandos financeiros; RH tem auditoria", async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = "http://127.0.0.1:" + address.port;
  assert.equal((await fetch(base + "/api/contracts/bootstrap")).status, 401);
  const username = prefix + "-consulta";
  await db.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash("ReadOnly!Contracts2026", 12),
      role: "CONSULTA",
    },
  });
  const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5173";
  const login = await fetch(base + "/api/login", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "ReadOnly!Contracts2026" }),
  });
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const { csrf } = (await login.json()) as any;
  assert.equal(
    (
      await fetch(base + "/api/contracts/bootstrap", {
        headers: { Cookie: cookie },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/contracts/resources/suppliers", {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: origin,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ name: "Não autorizado" }),
      })
    ).status,
    403,
  );
  assert.ok(
    (await db.audit.count({
      where: { userId: author, entity: "contracts.items" },
    })) > 0,
  );
  assert.ok((await bootstrap()).contracts.some((c) => c.id === contract.id));
});
