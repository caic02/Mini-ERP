import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, serial } from "../../server/db.js";
import { today, iso, addDays, date } from "../../server/domain.js";
import {
  createMeasurement,
  editMeasurement,
  measurementAction,
  measurementDetail,
} from "../../server/contracts/measurements.js";
import {
  saveContractResource,
  changeContractStatus,
  cancelForecast,
  reconcileContract,
  bootstrap,
} from "../../server/contracts/service.js";
if (
  process.env.CONFIRM_TEST_DB !== "SIM" ||
  !new URL(process.env.DATABASE_URL || "http://invalid").pathname.endsWith(
    "_test",
  )
)
  throw new Error("Use banco isolado _test.");
const prefix = "ME-" + randomUUID();
let author: string;
let unit: any,
  otherUnit: any,
  cc: any,
  term: any,
  supplier: any,
  category: any,
  contract: any,
  forecast: any,
  employee: any,
  dependent: any,
  benefit: any,
  enrollment: any;
let m: any;
const month = new Date(
    Date.UTC(today().getUTCFullYear(), today().getUTCMonth(), 1),
  ),
  monthText = iso(month).slice(0, 7);
function cpf() {
  let s = String(Math.floor(100000000 + Math.random() * 800000000));
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(s[i]) * (n + 1 - i);
    const d = (sum * 10) % 11;
    s += d === 10 ? "0" : String(d);
  }
  return s;
}
before(async () => {
  author = (
    await db.user.create({
      data: { username: prefix, passwordHash: "!", role: "RH" },
    })
  ).id;
  unit = await db.unit.create({
    data: { code: prefix + "a", name: "Unidade histórica A", kind: "FILIAL" },
  });
  otherUnit = await db.unit.create({
    data: { code: prefix + "b", name: "Unidade histórica B", kind: "FILIAL" },
  });
  cc = await db.costCenter.create({
    data: {
      code: prefix,
      name: "Centro histórico",
      units: { create: [{ unitId: unit.id }, { unitId: otherUnit.id }] },
    },
  });
  const dept = await db.lookup.create({
      data: { kind: "DEPARTAMENTO", name: prefix },
    }),
    job = await db.lookup.create({ data: { kind: "CARGO", name: prefix } });
  const person = await db.person.create({
    data: {
      name: "Titular fictício " + prefix,
      cpf: cpf(),
      birthDate: date("1990-01-01"),
    },
  });
  employee = await db.employment.create({
    data: {
      personId: person.id,
      registration: prefix,
      unitId: otherUnit.id,
      costCenterId: cc.id,
      departmentId: dept.id,
      jobId: job.id,
      admission: addDays(month, -400),
    },
  });
  await db.assignment.create({
    data: {
      employmentId: employee.id,
      effective: employee.admission,
      unitId: unit.id,
      costCenterId: cc.id,
      departmentId: dept.id,
      jobId: job.id,
      reason: "Inicial",
    },
  });
  await db.assignment.create({
    data: {
      employmentId: employee.id,
      effective: addDays(month, 14),
      unitId: otherUnit.id,
      costCenterId: cc.id,
      departmentId: dept.id,
      jobId: job.id,
      reason: "Transferência fictícia",
    },
  });
  dependent = await db.dependent.create({
    data: {
      personId: person.id,
      name: "Dependente fictício " + prefix,
      birthDate: date("2015-01-01"),
      relationshipId: "rel-child",
    },
  });
  benefit = await db.benefit.create({
    data: { code: prefix, name: "Saúde fictícia", kind: "SAUDE" },
  });
  enrollment = await db.enrollment.create({
    data: {
      benefitId: benefit.id,
      employmentId: employee.id,
      start: month,
      plan: "Básico",
    },
  });
  await db.enrollment.create({
    data: {
      benefitId: benefit.id,
      employmentId: employee.id,
      dependentId: dependent.id,
      start: month,
      plan: "Especial",
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
    { name: prefix },
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
      start: iso(month),
      end: iso(addDays(month, 300)),
      kind: "VARIAVEL",
    },
    undefined,
    author,
  );
  await saveContractResource(
    "items",
    {
      contractId: contract.id,
      version: contract.version,
      name: "Saúde mensal",
      quantity: "2",
      unitPrice: "100.00",
      billingUnit: "PESSOA",
      allocationMode: "PESSOAS",
      benefitId: benefit.id,
    },
    undefined,
    author,
  );
  contract = await changeContractStatus(
    contract.id,
    {
      status: "VIGENTE",
      version: (
        await db.contract.findUniqueOrThrow({ where: { id: contract.id } })
      ).version,
    },
    author,
  );
  forecast = await db.contractForecast.findUniqueOrThrow({
    where: { contractId_month: { contractId: contract.id, month } },
  });
});
after(async () => {
  await db.$disconnect();
});
const input = () => ({
  contractId: contract.id,
  forecastId: forecast.id,
  month: monthText,
  invoice: "NF-" + prefix,
  issue: iso(month),
  due: iso(addDays(month, 25)),
  amount: "200.00",
  supplierId: "ignored",
  unitId: "ignored",
  categoryId: "ignored",
});
function editBody(row: any, changes: any = {}) {
  return {
    version: row.version,
    invoice: row.invoice,
    issue: iso(row.issue instanceof Date ? row.issue : new Date(row.issue)),
    due: iso(row.due instanceof Date ? row.due : new Date(row.due)),
    amount: row.amount.toString(),
    mode: row.mode,
    notes: row.notes,
    reviewConfirmed: true,
    varianceConfirmed: true,
    lines: row.lines.map((l: any) => ({
      id: l.id,
      kind: l.kind,
      unitId: l.unitId,
      costCenterId: l.costCenterId,
      amount: l.amount.toString(),
      percent: l.percent.toString(),
      reason: l.reason,
    })),
    ...changes,
  };
}
test("principal concorrente é única e herda faturamento; pessoas usam plano e lotação histórica", async () => {
  const outcomes = await Promise.allSettled([
    createMeasurement(input(), author),
    createMeasurement(input(), author),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  m = await measurementDetail(
    (
      outcomes.find(
        (r) => r.status === "fulfilled",
      ) as PromiseFulfilledResult<any>
    ).value.id,
  );
  assert.equal(m.lines.length, 2);
  assert.equal(m.unitId, unit.id);
  assert.equal(m.supplierId, supplier.id);
  assert.equal(m.categoryId, category.id);
  assert.ok(m.lines.every((l: any) => l.unitId === unit.id));
  assert.deepEqual(m.lines.map((l: any) => l.plan).sort(), [
    "Básico",
    "Especial",
  ]);
  assert.equal(m.summary.difference, "0.00");
  assert.ok(m.warnings.some((w: string) => w.includes("Mudança de lotação")));
  await db.enrollment.update({
    where: { id: enrollment.id },
    data: { plan: "Apartamento" },
  });
  assert.equal(
    (await measurementDetail(m.id)).lines.find(
      (l) => l.enrollmentId === enrollment.id,
    )!.plan,
    "Básico",
  );
});
test("base com alertas exige revisão, usados não são cancelados ou recalculados como previsões livres", async () => {
  await assert.rejects(
    measurementAction(m.id, { version: m.version, action: "CONFERIR" }, author),
    /revisão dos alertas/,
  );
  const c = await db.contract.findUniqueOrThrow({ where: { id: contract.id } });
  await assert.rejects(
    cancelForecast(forecast.id, "Não deve cancelar", c.version, author),
    /utilizada/,
  );
  await serial((tx) => reconcileContract(tx, c.id));
  assert.equal(
    (
      await db.contractForecast.findUniqueOrThrow({
        where: { id: forecast.id },
      })
    ).amount.toFixed(2),
    "200.00",
  );
});
test("distribuição exata separa unidades, valida percentuais e exige confirmação da diferença", async () => {
  const centers = [
    {
      kind: "CENTRO",
      unitId: unit.id,
      costCenterId: cc.id,
      amount: "0.00",
      percent: "50.00",
    },
    {
      kind: "CENTRO",
      unitId: otherUnit.id,
      costCenterId: cc.id,
      amount: "0.00",
      percent: "49.99",
    },
  ];
  await editMeasurement(
    m.id,
    editBody(m, {
      mode: "PERCENTUAL",
      amount: "100.01",
      varianceConfirmed: false,
      lines: centers,
    }),
    author,
  );
  m = await measurementDetail(m.id);
  await assert.rejects(
    measurementAction(m.id, { version: m.version, action: "CONFERIR" }, author),
    /diferença|percentuais/,
  );
  const corrected = editBody(m).lines.map((l: any) => ({
    ...l,
    percent: "50.00",
  }));
  await editMeasurement(
    m.id,
    editBody(m, { varianceConfirmed: false, lines: corrected }),
    author,
  );
  m = await measurementDetail(m.id);
  assert.equal(m.summary.rows.length, 2);
  assert.equal(m.summary.total, "100.01");
  await assert.rejects(
    measurementAction(m.id, { version: m.version, action: "CONFERIR" }, author),
    /diferença entre previsto/,
  );
  await editMeasurement(m.id, editBody(m), author);
  m = await measurementDetail(m.id);
  const old = m.version;
  await measurementAction(
    m.id,
    { version: m.version, action: "CONFERIR" },
    author,
  );
  m = await measurementDetail(m.id);
  assert.equal(m.status, "CONFERIDA");
  await assert.rejects(editMeasurement(m.id, editBody(m), author), /Reabra/);
  await assert.rejects(
    measurementAction(
      m.id,
      { version: old, action: "REABRIR", reason: "Teste" },
      author,
    ),
    /outra operação/,
  );
});
test("Conferida é a situação final; envio é rejeitado pela validação e pelo banco", async () => {
  assert.equal(m.status, "CONFERIDA");
  const before = await measurementDetail(m.id);
  await assert.rejects(
    measurementAction(
      m.id,
      { version: m.version, action: "ENVIAR", reason: "Comando antigo" },
      author,
    ),
    (error: any) => error.issues?.some((i: any) => i.path[0] === "action"),
  );
  await assert.rejects(
    db.$executeRaw`UPDATE "Measurement" SET "status"='ENVIADA' WHERE "id"=${m.id}`,
    (error: any) => error.code === "P2010" && error.meta?.code === (process.env.MINIERP_FILE_DATABASE ? "0A000" : "23514"),
  );
  const after = await measurementDetail(m.id);
  assert.equal(after.status, "CONFERIDA");
  assert.equal(after.version, before.version);
  assert.deepEqual(after.confirmedSnapshot, before.confirmedSnapshot);
  assert.equal(after.history.length, before.history.length);
  const data = await bootstrap();
  assert.equal(
    data.forecasts.find((f: any) => f.id === forecast.id)?.measurementStatus,
    "CONFERIDA",
  );
});
test("reabertura de conferida exige motivo e mantém snapshot com valores e lotação", async () => {
  await db.costCenter.update({
    where: { id: cc.id },
    data: { name: "Nome posterior" },
  });
  const snap = m.confirmedSnapshot as any;
  assert.ok(
    snap.summary.rows.every(
      (r: any) => r.costCenterName === "Centro histórico",
    ),
  );
  await assert.rejects(
    measurementAction(
      m.id,
      { version: m.version, action: "REABRIR", reason: "" },
      author,
    ),
    /motivo/,
  );
  await measurementAction(
    m.id,
    { version: m.version, action: "REABRIR", reason: "Corrigir distribuição" },
    author,
  );
  m = await measurementDetail(m.id);
  assert.equal(m.status, "PREENCHIMENTO");
  assert.equal(m.confirmedSnapshot, null);
  assert.equal(m.reviewConfirmed, false);
  assert.equal(m.varianceConfirmed, false);
  assert.ok(
    m.history.some(
      (h: any) =>
        h.action === "REABRIR" && (h.snapshot as any).status === "CONFERIDA",
    ),
  );
});
test("complemento não repete pessoas e principal só cancela depois dos complementos", async () => {
  const comp = await createMeasurement(
    {
      ...input(),
      forecastId: null,
      originalId: m.id,
      amount: "20.00",
      invoice: "COMP-" + prefix,
    },
    author,
  );
  assert.equal((await measurementDetail(comp.id)).lines.length, 0);
  await assert.rejects(
    measurementAction(
      m.id,
      { version: m.version, action: "CANCELAR", reason: "Teste" },
      author,
    ),
    /complementos/,
  );
  await measurementAction(
    comp.id,
    {
      version: comp.version,
      action: "CANCELAR",
      reason: "Cancelar complemento de teste",
    },
    author,
  );
  await measurementAction(
    m.id,
    {
      version: m.version,
      action: "CANCELAR",
      reason: "Cancelar principal de teste",
    },
    author,
  );
  m = await measurementDetail(m.id);
  assert.equal(m.status, "CANCELADA");
  const replacement = await createMeasurement(
    { ...input(), invoice: "REPLACEMENT-" + prefix },
    author,
  );
  assert.notEqual(replacement.id, m.id);
});
test("VR/VA integralmente afastado é omitido e saúde mantém cobertura", async () => {
  const meal = await db.benefit.create({
    data: { code: prefix + "vr", name: "VR fictício", kind: "VR" },
  });
  await db.enrollment.create({
    data: { benefitId: meal.id, employmentId: employee.id, start: month },
  });
  await db.leave.create({
    data: {
      employmentId: employee.id,
      typeId: "leave-away",
      start: month,
      expectedEnd: addDays(
        new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)),
        -1,
      ),
    },
  });
  let c = await saveContractResource(
    "contracts",
    {
      name: prefix + "-VR",
      supplierId: supplier.id,
      unitId: unit.id,
      categoryId: category.id,
      paymentTermId: term.id,
      start: iso(month),
      kind: "VARIAVEL",
    },
    undefined,
    author,
  );
  await saveContractResource(
    "items",
    {
      contractId: c.id,
      version: c.version,
      name: "VR",
      quantity: "1",
      unitPrice: "100",
      billingUnit: "PESSOA",
      allocationMode: "PESSOAS",
      benefitId: meal.id,
    },
    undefined,
    author,
  );
  c = await changeContractStatus(
    c.id,
    {
      version: (await db.contract.findUniqueOrThrow({ where: { id: c.id } }))
        .version,
      status: "VIGENTE",
    },
    author,
  );
  const vr = await createMeasurement(
    { ...input(), contractId: c.id, forecastId: null },
    author,
  );
  assert.equal((await measurementDetail(vr.id)).lines.length, 0);
  assert.ok(
    (await measurementDetail(vr.id)).warnings.some((w: string) =>
      w.includes("omitido"),
    ),
  );
});
test("avulsa aceita distribuição por valor e rejeita centro incompatível; cancelada é imutável", async () => {
  const row = await createMeasurement(
    {
      ...input(),
      contractId: null,
      forecastId: null,
      unitId: unit.id,
      supplierId: supplier.id,
      categoryId: category.id,
      amount: "10",
    },
    author,
  );
  let avulsa = await measurementDetail(row.id);
  await assert.rejects(
    editMeasurement(
      row.id,
      editBody(avulsa, {
        lines: [
          {
            kind: "CENTRO",
            unitId: "invalid",
            costCenterId: cc.id,
            amount: "10",
            percent: "0",
          },
        ],
      }),
      author,
    ),
  );
  await editMeasurement(
    row.id,
    editBody(avulsa, {
      lines: [
        {
          kind: "CENTRO",
          unitId: unit.id,
          costCenterId: cc.id,
          amount: "10",
          percent: "0",
        },
      ],
    }),
    author,
  );
  avulsa = await measurementDetail(row.id);
  assert.equal(avulsa.summary.difference, "0.00");
  await measurementAction(
    row.id,
    { action: "CANCELAR", version: avulsa.version, reason: "Teste avulsa" },
    author,
  );
  avulsa = await measurementDetail(row.id);
  await assert.rejects(
    editMeasurement(row.id, editBody(avulsa), author),
    /Reabra/,
  );
  assert.ok((await bootstrap()).measurements.some((r) => r.id === row.id));
});
