import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCurrencyInput, parseCurrencyInput } from "../src/currency.js";
test("moeda brasileira preserva centavos e valores grandes como strings", () => {
  assert.equal(formatCurrencyInput("19680"), "19.680,00");
  assert.equal(formatCurrencyInput("19680.5"), "19.680,50");
  assert.equal(
    formatCurrencyInput("9999999999999999.99"),
    "9.999.999.999.999.999,99",
  );
  assert.equal(parseCurrencyInput("R$ 19.680,50")?.value, "19680.50");
  assert.equal(parseCurrencyInput("19680.50")?.value, "19680.50");
  assert.equal(parseCurrencyInput("19.680")?.value, "19680.00");
  assert.equal(parseCurrencyInput("0,05")?.value, "0.05");
  assert.equal(parseCurrencyInput("-10,50", true)?.value, "-10.50");
  assert.equal(parseCurrencyInput("-10,50"), null);
  assert.equal(parseCurrencyInput("10,001"), null);
  assert.equal(parseCurrencyInput("1e3"), null);
  assert.equal(parseCurrencyInput("")?.value, "");
  assert.equal(formatCurrencyInput(null), "");
});
