import { test } from "node:test";
import assert from "node:assert/strict";
import { date, iso } from "../server/domain.js";
import {
  forecastMonths,
  paymentDue,
  contractTotal,
  itemTotal,
  monthDate,
} from "../server/contracts/domain.js";
import {
  contractSchema,
  paymentTermSchema,
  itemSchema,
} from "../server/contracts/validation.js";
test("previsões incluem competências parciais e não inventam fim em contrato aberto", () => {
  assert.deepEqual(
    forecastMonths(
      date("2025-11-20"),
      date("2026-02-03"),
      date("2026-10-24"),
    ).map((d) => iso(d).slice(0, 7)),
    ["2025-11", "2025-12", "2026-01", "2026-02"],
  );
  assert.deepEqual(
    forecastMonths(date("2026-09-10"), null, date("2026-10-24")).map((d) =>
      iso(d).slice(0, 7),
    ),
    ["2026-09", "2026-10"],
  );
  assert.equal(
    forecastMonths(date("2027-03-10"), null, date("2026-10-24")).length,
    1,
  );
  assert.throws(() => monthDate("2026-13"));
});
test("vencimento fixo respeita fevereiro e prazo corrido parte do início da competência", () => {
  assert.equal(
    iso(
      paymentDue(date("2024-02-01"), {
        paymentMode: "FIXO",
        paymentDay: 31,
        paymentDays: null,
      }),
    ),
    "2024-02-29",
  );
  assert.equal(
    iso(
      paymentDue(date("2025-02-01"), {
        paymentMode: "FIXO",
        paymentDay: 31,
        paymentDays: null,
      }),
    ),
    "2025-02-28",
  );
  assert.equal(
    iso(
      paymentDue(date("2026-01-01"), {
        paymentMode: "DIAS",
        paymentDay: null,
        paymentDays: 40,
      }),
    ),
    "2026-02-10",
  );
});
test("quantidade vezes preço arredonda por item sem erros de ponto flutuante", () => {
  assert.equal(
    itemTotal({ quantity: "1.005", unitPrice: "1.00" }).toFixed(2),
    "1.01",
  );
  assert.equal(
    contractTotal([
      { quantity: "3", unitPrice: "0.10", active: true },
      { quantity: "2", unitPrice: "0.20", active: true },
      { quantity: "999", unitPrice: "999", active: false },
    ]).toFixed(2),
    "0.70",
  );
  assert.throws(() =>
    itemTotal({ quantity: "999999999", unitPrice: "9999999999" }),
  );
});
test("cadastros validam datas, condição de pagamento e associação para pessoas cobertas", () => {
  assert.ok(
    !paymentTermSchema.safeParse({ name: "Teste", mode: "FIXO", day: null })
      .success,
  );
  assert.ok(
    paymentTermSchema.safeParse({ name: "Teste", mode: "DIAS", days: 0 })
      .success,
  );
  assert.ok(
    !contractSchema.safeParse({
      name: "Teste",
      supplierId: "x",
      unitId: "x",
      categoryId: "x",
      paymentTermId: "x",
      start: "2026-02-01",
      end: "2026-01-01",
      kind: "FIXO",
    }).success,
  );
  assert.ok(
    !itemSchema.safeParse({
      contractId: "x",
      name: "Teste",
      billingUnit: "PESSOA",
      quantity: "1.0001",
      unitPrice: "10.00",
      allocationMode: "VALOR",
    }).success,
  );
  assert.ok(
    !itemSchema.safeParse({
      contractId: "x",
      name: "Teste",
      billingUnit: "PESSOA",
      quantity: "1",
      unitPrice: "10.00",
      allocationMode: "PESSOAS",
    }).success,
  );
});
