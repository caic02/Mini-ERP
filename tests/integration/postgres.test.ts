import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { advanceVacationStatuses } from "../../server/services.js";
import bcrypt from "bcryptjs";
import { db, serial } from "../../server/db.js";
import { saveResource, reconcile } from "../../server/services.js";
import { app } from "../../server/app.js";
import { date, today, addDays, iso, balance } from "../../server/domain.js";
import type { Server } from "node:http";
const url = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
if (process.env.CONFIRM_TEST_DB !== "SIM" || !url.pathname.endsWith("_test"))
  throw new Error(
    "Use exclusivamente banco com sufixo _test e CONFIRM_TEST_DB=SIM.",
  );
const prefix = "T-" + randomUUID();
let userId: string;
let employee: any;
let period: any;
let unit: any;
let cc: any;
let dept: any;
let job: any;
let person: any;
let server: Server;
let base: string;
const optionalPerson = {
  socialName: null,
  phone: null,
  email: null,
  address: null,
  emergencyName: null,
  emergencyPhone: null,
  emergencyRelation: null,
  notes: null,
  archived: false,
};
test("automação reconcilia datas, preserva pendências e não duplica gozo ou auditoria", async () => {
  const now = today();
  const p = await db.person.create({
    data: {
      name: "Automação fictícia " + prefix,
      cpf: cpf(Math.floor(100000000 + Math.random() * 800000000)),
      birthDate: date("1990-01-01"),
    },
  });
  const e = await db.employment.create({
    data: {
      personId: p.id,
      registration: prefix + "-auto",
      unitId: unit.id,
      costCenterId: cc.id,
      departmentId: dept.id,
      jobId: job.id,
      admission: addDays(now, -425),
    },
  });
  const period = await db.vacationPeriod.create({
    data: {
      employmentId: e.id,
      start: e.admission,
      end: addDays(now, -61),
      concessionStart: addDays(now, -60),
      concessionEnd: addDays(now, 304),
      target: addDays(now, 274),
    },
  });
  async function booking(status: string, offset: number, days: number) {
    const start = addDays(now, offset);
    return db.vacationBooking.create({
      data: {
        periodId: period.id,
        status,
        start,
        days,
        end: addDays(start, days - 1),
        returnDate: addDays(start, days),
        changedBy: userId,
        reviewConfirmed: true,
        consent: true,
      },
    });
  }
  const past = await booking("APROVADA", -45, 20),
    current = await booking("APROVADA", -2, 5),
    future = await booking("APROVADA", 10, 5);
  const pending = await Promise.all(
    ["RASCUNHO", "PROGRAMADA", "CANCELADA"].map((status, i) =>
      booking(status, -20 + i * 5, 5),
    ),
  );
  const snapshot = () =>
    db.vacationPeriod.findUniqueOrThrow({
      where: { id: period.id },
      include: { bookings: true, adjustments: true },
    });
  assert.equal(balance(await snapshot(), now).reserved, 30);
  await Promise.all([
    serial((tx) => advanceVacationStatuses(tx, now)),
    serial((tx) => advanceVacationStatuses(tx, now)),
  ]);
  let after = await snapshot();
  assert.equal(
    after.bookings.find((b) => b.id === past.id)!.status,
    "CONCLUIDA",
  );
  assert.equal(
    after.bookings.find((b) => b.id === current.id)!.status,
    "EM_ANDAMENTO",
  );
  assert.equal(
    after.bookings.find((b) => b.id === future.id)!.status,
    "APROVADA",
  );
  assert.equal(balance(after, now).available, 0);
  assert.equal(balance(after, now).used, 20);
  assert.equal(balance(after, now).reserved, 10);
  for (const b of pending)
    assert.equal(after.bookings.find((x) => x.id === b.id)!.status, b.status);
  const autoAudit = () =>
    db.audit.count({
      where: {
        entity: "bookings",
        entityId: { in: [past.id, current.id, future.id] },
        userId: "system-vacation-automation",
      },
    });
  assert.equal(await autoAudit(), 2);
  await Promise.all([
    serial((tx) => advanceVacationStatuses(tx, now)),
    serial((tx) => advanceVacationStatuses(tx, now)),
  ]);
  assert.equal(await autoAudit(), 2);
  const later = addDays(now, 100);
  await serial((tx) => advanceVacationStatuses(tx, later));
  after = await snapshot();
  assert.equal(balance(after, later).used, 30);
  assert.equal(balance(after, later).reserved, 0);
  assert.equal(balance(after, later).available, 0);
  assert.equal(await autoAudit(), 4);
  await serial((tx) => advanceVacationStatuses(tx, later));
  assert.equal(await autoAudit(), 4);
  assert.equal(
    (
      await db.user.findUniqueOrThrow({
        where: { id: "system-vacation-automation" },
      })
    ).active,
    false,
  );
});
function cpf(n: number) {
  const a = String(n).padStart(9, "0");
  let s = a;
  for (const size of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(s[i]) * (size + 1 - i);
    const digit = (sum * 10) % 11;
    s += digit === 10 ? "0" : String(digit);
  }
  return s;
}
before(async () => {
  const user = await db.user.create({
    data: {
      username: prefix,
      passwordHash: await bcrypt.hash("LocalTest!Pass2026", 12),
      role: "RH",
    },
  });
  userId = user.id;
  unit = await saveResource(
    "units",
    {
      code: prefix,
      name: "Unidade fictícia teste",
      kind: "FILIAL",
      active: true,
    },
    undefined,
    userId,
  );
  cc = await saveResource(
    "cost-centers",
    { code: prefix, name: "Centro teste", unitIds: [unit.id], active: true },
    undefined,
    userId,
  );
  dept = await saveResource(
    "lookups",
    { kind: "DEPARTAMENTO", name: prefix, active: true },
    undefined,
    userId,
  );
  job = await saveResource(
    "lookups",
    { kind: "CARGO", name: prefix, active: true },
    undefined,
    userId,
  );
  person = await saveResource(
    "people",
    {
      ...optionalPerson,
      name: prefix,
      cpf: cpf(Math.floor(100000000 + Math.random() * 800000000)),
      birthDate: "1990-01-01",
    },
    undefined,
    userId,
  );
  employee = await saveResource(
    "employments",
    {
      personId: person.id,
      registration: prefix,
      unitId: unit.id,
      costCenterId: cc.id,
      departmentId: dept.id,
      jobId: job.id,
      kind: "CLT",
      admission: iso(addDays(today(), -800)),
      status: "ATIVO",
    },
    undefined,
    userId,
  );
  period = await db.vacationPeriod.findFirstOrThrow({
    where: { employmentId: employee.id },
    orderBy: { start: "asc" },
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = "http://127.0.0.1:" + address.port;
});
after(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});
test("reconciliação idempotente, meses sem abrir e histórico sem duplicação", async () => {
  const before = await db.vacationPeriod.count({
    where: { employmentId: employee.id },
  });
  await serial((tx) => reconcile(tx, employee.id));
  await serial((tx) => reconcile(tx, employee.id));
  assert.equal(
    await db.vacationPeriod.count({ where: { employmentId: employee.id } }),
    before,
  );
  assert.ok(before >= 3);
  await saveResource(
    "periods",
    {
      ...period,
      start: iso(period.start),
      end: iso(period.end),
      concessionStart: iso(period.concessionStart),
      concessionEnd: iso(period.concessionEnd),
      target: iso(period.target),
      notes: "Histórico importado e conferido",
      review: false,
    },
    period.id,
    userId,
  );
  await serial((tx) => reconcile(tx, employee.id));
  assert.equal(
    await db.vacationPeriod.count({ where: { employmentId: employee.id } }),
    before,
  );
  await assert.rejects(
    saveResource(
      "periods",
      {
        employmentId: employee.id,
        start: iso(addDays(period.start, 1)),
        end: iso(period.end),
        concessionStart: iso(period.concessionStart),
        concessionEnd: iso(period.concessionEnd),
        target: iso(period.target),
        entitlement: 30,
        notes: "Duplicado",
      },
      undefined,
      userId,
    ),
    /sobreposto/,
  );
});
test("aprovação salva imediatamente como em andamento no início ou após ele", async () => {
  const p = await db.vacationPeriod.findFirstOrThrow({
    where: { employmentId: employee.id, end: { lt: today() } },
    orderBy: { start: "desc" },
  });
  for (const offset of [0, -1, 10]) {
    const body = {
      periodId: p.id,
      start: iso(addDays(today(), offset)),
      days: 5,
      status: "PROGRAMADA",
      reviewConfirmed: true,
      consent: true,
    };
    const pending = await saveResource("bookings", body, undefined, userId);
    assert.equal(pending.status, "PROGRAMADA");
    const approved = await saveResource(
      "bookings",
      { ...body, status: "APROVADA" },
      pending.id,
      userId,
    );
    assert.equal(approved.status, offset <= 0 ? "EM_ANDAMENTO" : "APROVADA");
    assert.equal(
      (
        await db.vacationBooking.findUniqueOrThrow({
          where: { id: approved.id },
        })
      ).status,
      approved.status,
    );
    if (offset <= 0)
      assert.equal(approved.changedBy, "system-vacation-automation");
    await saveResource(
      "bookings",
      { ...body, status: "CANCELADA" },
      approved.id,
      userId,
    );
  }
  const snapshot = await db.vacationPeriod.findUniqueOrThrow({
    where: { id: p.id },
    include: { bookings: true, adjustments: true },
  });
  assert.equal(balance(snapshot).available, 30);
  assert.equal(balance(snapshot).used, 0);
});
test("aprovações concorrentes não deixam saldo negativo e cancelamento libera reserva", async () => {
  const period = await db.vacationPeriod.findFirstOrThrow({
    where: { employmentId: employee.id, end: { lt: today() } },
    orderBy: { start: "desc" },
  });
  const one = {
    periodId: period.id,
    start: iso(addDays(today(), 10)),
    days: 20,
    status: "APROVADA",
    reviewConfirmed: true,
    consent: true,
  };
  const two = { ...one, start: iso(addDays(today(), 40)) };
  const results = await Promise.allSettled([
    saveResource("bookings", one, undefined, userId),
    saveResource("bookings", two, undefined, userId),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  const p = await db.vacationPeriod.findUniqueOrThrow({
    where: { id: period.id },
    include: { bookings: true, adjustments: true },
  });
  assert.equal(balance(p).reserved, 20);
  assert.equal(balance(p).available, 10);
  const booking = p.bookings.find((b) => b.status === "APROVADA")!;
  await saveResource(
    "bookings",
    { ...one, start: iso(booking.start), status: "CANCELADA" },
    booking.id,
    userId,
  );
  const after = await db.vacationPeriod.findUniqueOrThrow({
    where: { id: period.id },
    include: { bookings: true, adjustments: true },
  });
  assert.equal(balance(after).available, 30);
  assert.equal(balance(after).reserved, 0);
});
test("conclusão converte reserva sem dupla contagem e preserva abono e ajustes", async () => {
  const body = {
    periodId: period.id,
    start: iso(addDays(period.concessionStart, 70)),
    days: 20,
    status: "APROVADA",
    reviewConfirmed: true,
    consent: true,
  };
  const booking = await saveResource("bookings", body, undefined, userId);
  assert.equal(booking.status, "CONCLUIDA");
  await saveResource(
    "adjustments",
    {
      periodId: period.id,
      kind: "ABONO",
      days: 10,
      reason: "Histórico de abono conferido",
    },
    undefined,
    userId,
  );
  let p = await db.vacationPeriod.findUniqueOrThrow({
    where: { id: period.id },
    include: { bookings: true, adjustments: true },
  });
  assert.equal(balance(p).used, 20);
  assert.equal(balance(p).reserved, 0);
  assert.equal(balance(p).available, 0);
  await saveResource(
    "adjustments",
    {
      periodId: period.id,
      kind: "AJUSTE",
      days: 5,
      reason: "Saldo inicial documentado",
    },
    undefined,
    userId,
  );
  p = await db.vacationPeriod.findUniqueOrThrow({
    where: { id: period.id },
    include: { bookings: true, adjustments: true },
  });
  assert.equal(balance(p).available, 5);
  await assert.rejects(
    saveResource(
      "adjustments",
      { periodId: period.id, kind: "AJUSTE", days: -6, reason: "Inválido" },
      undefined,
      userId,
    ),
    /saldo/,
  );
});
test("sobreposição com afastamento bloqueia aprovação", async () => {
  const p = await db.vacationPeriod.findFirstOrThrow({
    where: {
      employmentId: employee.id,
      start: { gt: period.start },
      end: { lt: today() },
    },
    orderBy: { start: "asc" },
  });
  await saveResource(
    "leaves",
    {
      employmentId: employee.id,
      typeId: "leave-maternity",
      start: iso(p.concessionStart),
      expectedEnd: iso(addDays(p.concessionStart, 29)),
      review: true,
    },
    undefined,
    userId,
  );
  await assert.rejects(
    saveResource(
      "bookings",
      {
        periodId: p.id,
        start: iso(p.concessionStart),
        days: 30,
        status: "APROVADA",
        reviewConfirmed: true,
        consent: true,
      },
      undefined,
      userId,
    ),
    /afastamento/,
  );
});
test("encerramento impede vínculos concorrentes e readmissão preserva pessoa e histórico", async () => {
  await assert.rejects(
    saveResource(
      "employments",
      {
        ...employee,
        registration: prefix + "-duplicate",
        admission: iso(employee.admission),
        status: "ATIVO",
      },
      undefined,
      userId,
    ),
    /sobrepostos/,
  );
  const termination = addDays(today(), -1);
  await saveResource(
    "employments",
    {
      ...employee,
      admission: iso(employee.admission),
      termination: iso(termination),
      status: "DESLIGADO",
      reason: "Teste",
    },
    employee.id,
    userId,
  );
  const next = await saveResource(
    "employments",
    {
      ...employee,
      id: undefined,
      registration: prefix + "-return",
      admission: iso(today()),
      termination: null,
      status: "ATIVO",
    },
    undefined,
    userId,
  );
  assert.equal(next.personId, person.id);
  assert.notEqual(next.id, employee.id);
  assert.equal(
    await db.employment.count({ where: { personId: person.id } }),
    2,
  );
  const periods = await db.vacationPeriod.findMany({
    where: { employmentId: employee.id },
  });
  assert.ok(periods.every((p) => p.start <= termination));
});
test("consulta: autenticação, autorização API, projeção e CSRF", async () => {
  const username = prefix + "-read";
  await db.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash("ReadOnly!Pass2026", 12),
      role: "CONSULTA",
    },
  });
  const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5173";
  const anon = await fetch(base + "/api/professional");
  assert.equal(anon.status, 401);
  const login = await fetch(base + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ username, password: "ReadOnly!Pass2026" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const { csrf } = (await login.json()) as any;
  for (const resource of [
    "people",
    "dependents",
    "enrollments",
    "employments",
    "audit",
    "periods",
  ]) {
    assert.equal(
      (
        await fetch(base + "/api/data/" + resource, {
          headers: { Cookie: cookie },
        })
      ).status,
      403,
    );
  }
  const data = await (
    await fetch(base + "/api/professional", { headers: { Cookie: cookie } })
  ).json();
  const text = JSON.stringify(data);
  for (const key of [
    "cpf",
    "notes",
    "birthDate",
    "companyCost",
    "dependentId",
    "emergencyName",
  ])
    assert.ok(!text.includes('"' + key + '"'));
  const forbidden = await fetch(base + "/api/data/people", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf,
    },
    body: "{}",
  });
  assert.equal(forbidden.status, 403);
  const missingCsrf = await fetch(base + "/api/logout", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(missingCsrf.status, 403);
  const crossOrigin = await fetch(base + "/api/logout", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: "https://example.invalid",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf,
    },
    body: "{}",
  });
  assert.equal(crossOrigin.status, 403);
});
test("índice no PostgreSQL impede duas matrizes ativas e auditoria registra autor", async () => {
  const first = await saveResource(
    "units",
    { code: prefix + "hq", name: "Matriz teste", kind: "MATRIZ", active: true },
    undefined,
    userId,
  );
  await assert.rejects(
    saveResource(
      "units",
      {
        code: prefix + "hq2",
        name: "Outra matriz",
        kind: "MATRIZ",
        active: true,
      },
      undefined,
      userId,
    ),
  );
  await saveResource(
    "units",
    { code: first.code, name: first.name, kind: "MATRIZ", active: false },
    first.id,
    userId,
  );
  assert.ok(
    (await db.audit.count({ where: { userId, entity: "bookings" } })) > 0,
  );
});
test("indicações de seguro descartadas não permitem novos cadastros", async () => {
  await assert.rejects(
    saveResource("nominations", {}, undefined, userId),
    /Cadastro não encontrado/,
  );
});
test("cadastro familiar e cobertura são independentes e preservam vigências", async () => {
  const e = await db.employment.findFirstOrThrow({
    where: { personId: person.id, termination: null },
  });
  await assert.rejects(
    saveResource(
      "dependents",
      {
        personId: person.id,
        name: "Familiar fictício",
        birthDate: "2000-01-01",
        relationshipId: "rel-other",
        active: true,
      },
      undefined,
      userId,
    ),
    /Descreva/,
  );
  const dependent = await saveResource(
    "dependents",
    {
      personId: person.id,
      name: "Familiar fictício",
      birthDate: "2000-01-01",
      relationshipId: "rel-other",
      relationshipDescription: "Parentesco informado pelo RH",
      incomeTax: false,
      active: true,
    },
    undefined,
    userId,
  );
  assert.equal(
    await db.enrollment.count({ where: { dependentId: dependent.id } }),
    0,
  );
  const benefit = await saveResource(
    "benefits",
    {
      code: prefix + "health",
      name: "Plano fictício teste",
      kind: "SAUDE",
      active: true,
    },
    undefined,
    userId,
  );
  const body = {
    benefitId: benefit.id,
    employmentId: e.id,
    dependentId: dependent.id,
    start: iso(today()),
    active: true,
    companyCost: "123.45",
  };
  const enrollment = await saveResource("enrollments", body, undefined, userId);
  assert.equal(enrollment.companyCost.toString(), "123.45");
  await assert.rejects(
    saveResource("enrollments", body, undefined, userId),
    /sobreposta/,
  );
  await saveResource(
    "enrollments",
    { ...body, end: iso(today()), active: false },
    enrollment.id,
    userId,
  );
  await saveResource(
    "enrollments",
    { ...body, start: iso(addDays(today(), 1)) },
    undefined,
    userId,
  );
  assert.equal(
    await db.enrollment.count({ where: { dependentId: dependent.id } }),
    2,
  );
});
test("inativação de cadastros e arquivamento preservam vínculo e impedem exclusão de pessoa", async () => {
  const e = await db.employment.findFirstOrThrow({
    where: { personId: person.id, termination: null },
  });
  await saveResource(
    "lookups",
    { kind: "DEPARTAMENTO", name: dept.name, tag: null, active: false },
    dept.id,
    userId,
  );
  await saveResource(
    "cost-centers",
    { code: cc.code, name: cc.name, unitIds: [unit.id], active: false },
    cc.id,
    userId,
  );
  await saveResource(
    "units",
    { code: unit.code, name: unit.name, kind: "FILIAL", active: false },
    unit.id,
    userId,
  );
  await saveResource(
    "people",
    {
      ...optionalPerson,
      name: person.name,
      cpf: person.cpf,
      birthDate: iso(person.birthDate),
      archived: true,
    },
    person.id,
    userId,
  );
  const updated = await saveResource(
    "employments",
    {
      ...e,
      admission: iso(e.admission),
      status: "INATIVO",
      reason: "Inativação administrativa de teste",
    },
    e.id,
    userId,
  );
  assert.equal(updated.status, "INATIVO");
  await assert.rejects(db.person.delete({ where: { id: person.id } }));
  assert.equal(await db.assignment.count({ where: { employmentId: e.id } }), 1);
});
