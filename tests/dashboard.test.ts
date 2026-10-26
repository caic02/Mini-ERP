import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDashboard,
  dashboardDefaults,
  dashboardMoney,
  dashboardMonths,
  DashboardSource,
  DashboardContract,
  DashboardForecast,
  DashboardMeasurement,
} from "../src/contracts/dashboardData.js";

const filters = {
  from: "2026-09",
  to: "2026-10",
  unitId: "",
  supplierId: "",
  categoryId: "",
};
const contract = (
  changes: Partial<DashboardContract> = {},
): DashboardContract => ({
  id: "c",
  code: "C1",
  name: "Saúde",
  status: "VIGENTE",
  unitId: "billing-a",
  supplierId: "s",
  categoryId: "cat",
  start: "2026-01-01",
  end: "2026-12-31",
  activatedAt: "2026-01-01T00:00:00Z",
  adjustmentDate: null,
  alertDays: 90,
  supplier: { id: "s", name: "Nome atual" },
  ...changes,
});
const forecast = (
  changes: Partial<DashboardForecast> = {},
): DashboardForecast => ({
  id: "f-sep",
  code: "P1",
  contractId: "c",
  month: "2026-09-01",
  due: "2026-09-10",
  amount: "100.00",
  status: "PREVISTA",
  ...changes,
});
const measurement = (
  changes: Partial<DashboardMeasurement> = {},
): DashboardMeasurement => ({
  id: "m",
  code: "M1",
  unitId: "billing-a",
  supplierId: "s",
  categoryId: "cat",
  contractId: "c",
  forecastId: "f-sep",
  originalId: null,
  month: "2026-09-01",
  due: "2026-09-10",
  amount: "90.00",
  status: "CONFERIDA",
  sourceSnapshot: {
    supplierName: "Fornecedor histórico",
    categoryName: "Categoria histórica",
  },
  confirmedSnapshot: {
    supplierName: "Fornecedor histórico",
    categoryName: "Categoria histórica",
    summary: {
      rows: [
        {
          unitId: "beneficiary-a",
          costCenterId: "same-center",
          unitName: "Unidade A da época",
          costCenterName: "Centro antigo",
          amount: "30.00",
        },
        {
          unitId: "beneficiary-b",
          costCenterId: "same-center",
          unitName: "Unidade B da época",
          costCenterName: "Centro antigo",
          amount: "60.00",
        },
      ],
    },
  },
  ...changes,
});
function source(changes: Partial<DashboardSource> = {}): DashboardSource {
  return {
    businessDate: "2026-10-24",
    contracts: [contract()],
    forecasts: [forecast()],
    measurements: [measurement()],
    units: [],
    suppliers: [],
    categories: [],
    ...changes,
  };
}
test("dashboard compara competências equivalentes, inclui complementos uma vez e separa avulsas, rascunhos e provisórias", () => {
  const data = source({
    contracts: [
      contract(),
      contract({ id: "provisional", status: "ELABORACAO", activatedAt: null }),
    ],
    forecasts: [
      forecast(),
      forecast({ id: "f-oct", month: "2026-10-01" }),
      forecast({ id: "cancelled", amount: "9999.00", status: "CANCELADA" }),
      forecast({
        id: "provisional",
        contractId: "provisional",
        amount: "15.00",
      }),
    ],
    measurements: [
      measurement(),
      measurement({
        id: "comp",
        originalId: "m",
        amount: "10.00",
        confirmedSnapshot: null,
      }),
      measurement({
        id: "draft-oct",
        month: "2026-10-01",
        forecastId: "f-oct",
        status: "PREENCHIMENTO",
        amount: "200.00",
      }),
      measurement({
        id: "draft-comp",
        originalId: "m",
        status: "PREENCHIMENTO",
        amount: "5.00",
      }),
      measurement({
        id: "avulsa",
        contractId: null,
        forecastId: null,
        amount: "30.00",
        confirmedSnapshot: null,
      }),
      measurement({
        id: "cancelled",
        contractId: null,
        forecastId: null,
        status: "CANCELADA",
        amount: "9999.00",
      }),
    ],
  });
  const before = structuredClone(data);
  const result = buildDashboard(data, filters);
  assert.equal(result.planned, "200.00");
  assert.equal(result.actual, "130.00");
  assert.equal(result.draftAmount, "205.00");
  assert.equal(result.provisionalAmount, "15.00");
  assert.equal(result.avulsaAmount, "30.00");
  assert.equal(result.complementAmount, "10.00");
  assert.deepEqual(result.closing, {
    reviewed: 1,
    drafts: 1,
    missing: 0,
    total: 2,
    percent: 50,
  });
  assert.deepEqual(result.comparison, {
    count: 1,
    planned: "100.00",
    actual: "100.00",
    variance: "0.00",
    percent: 0,
    outside: "30.00",
  });
  assert.equal(result.cancelled, 1);
  assert.deepEqual(data, before);
});
test("filtro de unidade faturada mantém a distribuição histórica em outras unidades e o mesmo centro separado por unidade", () => {
  const data = source();
  const result = buildDashboard(data, { ...filters, unitId: "billing-a" });
  assert.equal(result.actual, "90.00");
  assert.equal(result.beneficiaryUnits.length, 2);
  assert.equal(result.costCenters.length, 2);
  assert.equal(result.beneficiaryUnits[0].name, "Unidade B da época");
  assert.equal(result.suppliers[0].name, "Fornecedor histórico");
  assert.equal(result.categories[0].name, "Categoria histórica");
  const empty = buildDashboard(data, { ...filters, unitId: "beneficiary-b" });
  assert.equal(empty.actual, "0.00");
  assert.equal(empty.contracts.length, 0);
  assert.equal(
    buildDashboard(data, { ...filters, supplierId: "other" }).planned,
    "0.00",
  );
  assert.equal(
    buildDashboard(data, { ...filters, categoryId: "other" }).actual,
    "0.00",
  );
});
test("meses sem conferência permanecem ausentes; canceladas não escondem previsões sem medição e complementos não fecham principal reaberta", () => {
  const data = source({
    forecasts: [forecast(), forecast({ id: "f-oct", month: "2026-10-01" })],
    measurements: [measurement({ status: "CANCELADA" })],
  });
  const result = buildDashboard(data, filters);
  assert.equal(result.missing.length, 2);
  assert.equal(result.missingAmount, "200.00");
  assert(result.timeline.every((row) => row.actual === null));
  assert.equal(result.comparison.percent, null);
  const reopened = buildDashboard(
    source({
      measurements: [
        measurement({ status: "PREENCHIMENTO" }),
        measurement({
          id: "comp",
          originalId: "m",
          amount: "10.00",
          confirmedSnapshot: null,
        }),
      ],
    }),
    filters,
  );
  assert.equal(reopened.actual, "10.00");
  assert.equal(reopened.closing.reviewed, 0);
  assert.equal(reopened.comparison.outside, "10.00");
});
test("centavos exatos, previsão zero e distribuição ausente não inventam percentuais ou lotações", () => {
  const data = source({
    forecasts: [forecast({ amount: "0.00" })],
    measurements: [
      measurement({ amount: "0.10", confirmedSnapshot: null }),
      measurement({
        id: "comp",
        originalId: "m",
        amount: "0.20",
        confirmedSnapshot: null,
      }),
    ],
  });
  const result = buildDashboard(data, filters);
  assert.equal(result.actual, "0.30");
  assert.equal(result.comparison.variance, "0.30");
  assert.equal(result.comparison.percent, null);
  assert.equal(result.beneficiaryUnits.length, 1);
  assert.equal(result.beneficiaryUnits[0].id, "unavailable");
  assert.equal(result.beneficiaryUnits[0].amount, "0.30");
  assert.equal(result.missingDistribution, 2);
  assert.equal(
    dashboardMoney("9999999999999999.99"),
    "R$ 9.999.999.999.999.999,99",
  );
});
test("alertas respeitam data civil, limite inclusivo e situação atual; encerrados não alertam", () => {
  const data = source({
    contracts: [
      contract({ end: "2026-10-23", adjustmentDate: "2026-10-24" }),
      contract({ id: "at-limit", end: "2026-11-23", alertDays: 30 }),
      contract({ id: "after-limit", end: "2026-11-24", alertDays: 30 }),
      contract({ id: "closed", status: "ENCERRADO", end: "2026-10-24" }),
    ],
  });
  const result = buildDashboard(data, filters);
  assert.deepEqual(
    result.alerts.map((row) => row.days),
    [-1, 0, 30],
  );
  assert(!result.alerts.some((row) => row.contract.id === "closed"));
  assert.equal(
    result.contractStatuses.find((row) => row.status === "ENCERRADO")?.count,
    1,
  );
  const endedBefore = source({
    contracts: [
      contract({
        status: "ENCERRADO",
        closedOn: "2026-09-30",
        end: "2026-12-31",
      }),
    ],
    forecasts: [],
    measurements: [],
  });
  assert.equal(
    buildDashboard(endedBefore, { ...filters, from: "2026-10" }).contracts
      .length,
    0,
  );
});
test("períodos cruzam o ano sem lacunas e entradas inválidas recebem orientação", () => {
  assert.deepEqual(dashboardMonths("2025-12", "2026-02"), [
    "2025-12",
    "2026-01",
    "2026-02",
  ]);
  assert.deepEqual(dashboardDefaults("2026-01-03"), {
    ...filters,
    from: "2025-08",
    to: "2026-01",
  });
  assert.throws(() => dashboardMonths("", "2026-10"), /período válido/);
  assert.throws(() => dashboardMonths("2026-11", "2026-10"), /período válido/);
  assert.throws(() => dashboardMonths("2023-01", "2026-10"), /24 competências/);
});
