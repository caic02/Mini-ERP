import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocationSummary,
  cents,
  decimal,
} from "../shared/measurementMath.js";
const center = (
  unitId: string,
  costCenterId: string,
  amount = "0.00",
  percent = "0.00",
  kind = "CENTRO",
) => ({ unitId, costCenterId, amount, percent, kind });
test("rateio percentual fecha centavos e desempata por unidade/centro", () => {
  const s = allocationSummary("PERCENTUAL", "100.00", [
    center("a", "x", "0", "33.34"),
    center("a", "y", "0", "33.33"),
    center("a", "z", "0", "33.33"),
  ]);
  assert.equal(s.total, "100.00");
  assert.equal(s.difference, "0.00");
  assert.deepEqual(
    s.rows.map((r) => r.amount),
    ["33.34", "33.33", "33.33"],
  );
  const tie = allocationSummary("PERCENTUAL", "0.01", [
    center("b", "same", "0", "50"),
    center("a", "same", "0", "50"),
  ]);
  assert.deepEqual(
    tie.rows.map((r) => r.amount),
    ["0.00", "0.01"],
  );
});
test("mesmo centro em duas unidades não é agrupado como uma única lotação", () => {
  const s = allocationSummary("VALOR", "30.00", [
    center("a", "same", "10"),
    center("b", "same", "20"),
  ]);
  assert.equal(s.rows.length, 2);
  assert.equal(s.total, "30.00");
});
test("ajustes são explícitos, negativos são preservados e rascunho inválido continua calculável", () => {
  const s = allocationSummary("PERCENTUAL", "100.01", [
    center("a", "x", "0", "50"),
    center("b", "x", "0", "50"),
    center("a", "x", "-0.01", "0", "AJUSTE"),
  ]);
  assert.equal(s.total, "100.01");
  assert.deepEqual(
    s.rows.map((r) => r.amount),
    ["50.00", "50.01"],
  );
  const invalid = allocationSummary("PERCENTUAL", "100", [
    center("a", "x", "0", "99"),
  ]);
  assert.notEqual(invalid.difference, "0.00");
  assert.equal(
    allocationSummary("VALOR", "0", [center("a", "x", "-1", "0", "AJUSTE")])
      .hasNegative,
    true,
  );
  assert.equal(
    allocationSummary("PERCENTUAL", "10", [
      center("a", "x", "0", "100"),
      center("a", "x", "20", "0", "AJUSTE"),
    ]).negativeBase,
    true,
  );
});
test("trocar método não soma simultaneamente pessoas e centros; moeda exata", () => {
  const rows = [center("a", "x", "10", "0", "PESSOA"), center("b", "y", "20")];
  assert.equal(allocationSummary("VALOR", "20", rows).total, "20.00");
  assert.equal(allocationSummary("PESSOAS", "10", rows).total, "10.00");
  assert.equal(decimal(cents("-123.45")), "-123.45");
  assert.throws(() => cents("1.234"));
});
