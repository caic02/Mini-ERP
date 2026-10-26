import { test } from "node:test";
import assert from "node:assert/strict";
import { automaticVacationStatus } from "../server/domain.js";
import {
  date,
  iso,
  addMonths,
  expectedPeriods,
  balance,
  overlap,
  validCpf,
  currentCondition,
  periodIndicator,
  professionalProjection,
  validateSplit,
} from "../server/domain.js";
test("férias aprovadas avançam nas datas civis sem promover rascunhos e pendências", () => {
  const start = date("2026-07-10"),
    end = date("2026-07-23");
  assert.equal(
    automaticVacationStatus("APROVADA", start, end, date("2026-07-09")),
    "APROVADA",
  );
  assert.equal(
    automaticVacationStatus("APROVADA", start, end, start),
    "EM_ANDAMENTO",
  );
  assert.equal(
    automaticVacationStatus("EM_ANDAMENTO", start, end, end),
    "EM_ANDAMENTO",
  );
  assert.equal(
    automaticVacationStatus("EM_ANDAMENTO", start, end, date("2026-07-24")),
    "CONCLUIDA",
  );
  assert.equal(
    automaticVacationStatus("APROVADA", start, end, date("2027-01-01")),
    "CONCLUIDA",
  );
  for (const status of ["RASCUNHO", "PROGRAMADA", "CANCELADA", "CONCLUIDA"])
    assert.equal(
      automaticVacationStatus(status, start, end, date("2027-01-01")),
      status,
    );
});
test("datas civis e limites padrão preservam dias inclusivos", () => {
  const [a, b] = expectedPeriods(date("2025-03-10"), date("2026-10-24"));
  assert.deepEqual(
    [a.start, a.end, a.concessionStart, a.concessionEnd, a.target, b.start].map(
      iso,
    ),
    [
      "2025-03-10",
      "2026-03-09",
      "2026-03-10",
      "2027-03-09",
      "2027-02-10",
      "2026-03-10",
    ],
  );
  assert.throws(() => date("2025-02-29"));
  assert.throws(() => date("2026-04-31"));
});
test("29 de fevereiro mantém âncora e retorna ao dia 29 em ano bissexto", () => {
  const p = expectedPeriods(date("2020-02-29"), date("2024-03-01"));
  assert.equal(iso(p[1].start), "2021-02-28");
  assert.equal(iso(p[4].start), "2024-02-29");
  assert.equal(iso(p[3].end), "2024-02-28");
  assert.equal(iso(addMonths(date("2025-01-31"), 1)), "2025-02-28");
  assert.equal(iso(addMonths(date("2024-01-31"), 1)), "2024-02-29");
});
test("fim de vínculo interrompe geração e readmissão tem âncora independente", () => {
  assert.equal(
    expectedPeriods(date("2020-03-10"), date("2026-10-24"), date("2021-01-01"))
      .length,
    1,
  );
  assert.equal(
    iso(expectedPeriods(date("2022-07-20"), date("2023-08-01"))[0].start),
    "2022-07-20",
  );
});
test("saldo separa programação, reserva, gozo, abono e ajuste", () => {
  const p = {
    entitlement: 30,
    end: date("2025-03-09"),
    bookings: [
      { status: "PROGRAMADA", days: 10 },
      { status: "APROVADA", days: 5 },
      { status: "CONCLUIDA", days: 14 },
      { status: "CANCELADA", days: 8 },
    ],
    adjustments: [
      { kind: "ABONO", days: 10 },
      { kind: "AJUSTE", days: 4 },
    ],
  };
  assert.deepEqual(balance(p, date("2026-01-01")), {
    entitlement: 30,
    adjustment: 4,
    allowance: 10,
    used: 14,
    reserved: 5,
    available: 5,
    notEnjoyed: 10,
  });
  p.bookings[1].status = "CONCLUIDA";
  assert.equal(balance(p).available, 5);
  assert.equal(balance(p).reserved, 0);
  assert.equal(balance(p).used, 19);
  p.bookings[1].status = "CANCELADA";
  assert.equal(balance(p).available, 10);
});
test("direito apenas no dia seguinte ao fim e quitado não fica irregular", () => {
  const p = {
    entitlement: 30,
    end: date("2026-03-09"),
    bookings: [],
    adjustments: [],
  };
  assert.equal(balance(p, date("2026-03-09")).entitlement, 0);
  assert.equal(balance(p, date("2026-03-10")).entitlement, 30);
  const b = balance({ ...p, bookings: [{ status: "CONCLUIDA", days: 30 }] });
  assert.equal(
    periodIndicator(
      {
        ...p,
        concessionEnd: date("2025-03-09"),
        target: date("2025-02-10"),
        review: false,
      },
      b,
      date("2026-10-24"),
    ),
    "Período quitado",
  );
});
test("sobreposição é inclusiva e aceita intervalos abertos", () => {
  assert.ok(
    overlap(date("2026-01-01"), date("2026-01-05"), date("2026-01-05"), null),
  );
  assert.ok(
    !overlap(date("2026-01-01"), date("2026-01-05"), date("2026-01-06"), null),
  );
});
test("CPF valida dígitos e rejeita repetições", () => {
  assert.ok(validCpf("529.982.247-25"));
  assert.ok(!validCpf("11111111111"));
  assert.ok(!validCpf("52998224724"));
});
test("fracionamento preserva fração de 14 e rejeita restos inviáveis e abono excedente", () => {
  validateSplit([14, 6], 30, 10);
  validateSplit([5], 30, 0);
  assert.throws(() => validateSplit([10, 10, 10], 30, 0));
  assert.throws(() => validateSplit([14, 14], 30, 0));
  assert.throws(() => validateSplit([14], 30, 11));
  assert.throws(() => validateSplit([4], 30, 0));
});
test("condição usa data atual, prioridade e alerta de conflito", () => {
  const e = {
    status: "ATIVO",
    admission: date("2025-01-01"),
    termination: null,
    leaves: [
      {
        start: date("2026-01-01"),
        actualEnd: null,
        expectedEnd: null,
        type: { tag: "MATERNIDADE" },
      },
    ],
    periods: [
      {
        bookings: [
          {
            start: date("2026-01-01"),
            end: date("2026-01-30"),
            status: "APROVADA",
          },
        ],
      },
    ],
  };
  assert.deepEqual(currentCondition(e, date("2026-01-10")), {
    label: "Licença-maternidade",
    conflict: true,
  });
  assert.deepEqual(
    currentCondition(
      { ...e, termination: date("2026-01-05") },
      date("2026-01-10"),
    ),
    { label: "Desligado", conflict: false },
  );
  assert.equal(
    currentCondition({ ...e, leaves: [] }, date("2026-02-01")).label,
    "Em atividade",
  );
});
test("projeção de consulta não vaza dados pessoais ou administrativos", () => {
  const e = {
    id: "x",
    person: {
      name: "Fictício",
      cpf: "SEGREDO",
      notes: "SEGREDO",
      phone: "SEGREDO",
      birthDate: "SEGREDO",
      dependents: ["SEGREDO"],
    },
    status: "ATIVO",
    termination: null,
    unit: { name: "Unidade" },
    costCenter: { name: "Centro" },
    department: { name: "RH" },
    job: { name: "Cargo" },
    leaves: [],
    periods: [
      {
        id: "p",
        bookings: [
          {
            notes: "SEGREDO",
            companyCost: "SEGREDO",
            start: date("2026-02-01"),
            end: date("2026-02-15"),
            status: "APROVADA",
          },
        ],
      },
    ],
  };
  assert.ok(!JSON.stringify(professionalProjection(e)).includes("SEGREDO"));
});
