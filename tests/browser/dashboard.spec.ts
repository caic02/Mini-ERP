import { test, expect } from "@playwright/test";

test("dashboard: totais, filtros cruzados, gráfico, detalhes, período inválido e responsividade", async ({
  page,
}) => {
  const unit = {
    id: "billing-a",
    code: "A",
    name: "Unidade faturada A",
    active: true,
  };
  const supplier = { id: "s", name: "Fornecedor atual", active: true };
  const category = { id: "cat", name: "Saúde", active: true };
  const c = {
    id: "c",
    code: "C1",
    name: "Saúde corporativa",
    status: "VIGENTE",
    unitId: unit.id,
    supplierId: supplier.id,
    categoryId: category.id,
    start: "2026-01-01",
    end: "2026-12-31",
    activatedAt: "2026-01-01",
    adjustmentDate: null,
    alertDays: 90,
    supplier,
    unit,
    category,
    items: [],
    monthlyReference: "100.00",
    paymentMode: "FIXO",
    paymentDay: 15,
    paymentDays: null,
  };
  const missing = {
    ...c,
    id: "c2",
    code: "C2",
    name: "Serviço com medição pendente",
    monthlyReference: "50.00",
  };
  const f = {
    id: "f1",
    code: "P1",
    contractId: c.id,
    contract: c,
    month: "2026-09-01",
    due: "2026-09-15",
    status: "PREVISTA",
    amount: "100.00",
  };
  const m = {
    id: "m1",
    code: "M1",
    contractId: c.id,
    contract: c,
    forecastId: "f1",
    originalId: null,
    month: "2026-09-01",
    due: "2026-09-15",
    status: "CONFERIDA",
    amount: "90.00",
    unitId: unit.id,
    supplierId: supplier.id,
    categoryId: category.id,
    supplier,
    unit,
    category,
    sourceSnapshot: {
      supplierName: "Fornecedor histórico",
      contractName: c.name,
    },
    confirmedSnapshot: {
      supplierName: "Fornecedor histórico",
      categoryName: "Saúde histórica",
      summary: {
        rows: [
          {
            unitId: "beneficiary-a",
            costCenterId: "cc",
            unitName: "Unidade A da época",
            costCenterName: "Centro antigo",
            amount: "30.00",
          },
          {
            unitId: "beneficiary-b",
            costCenterId: "cc",
            unitName: "Unidade B da época",
            costCenterName: "Centro antigo",
            amount: "60.00",
          },
        ],
      },
    },
  };
  const data = {
    businessDate: "2026-10-24",
    contracts: [c, missing],
    units: [unit, { ...unit, id: "billing-b", name: "Unidade faturada B" }],
    suppliers: [supplier, { ...supplier, id: "other", name: "Uniformes" }],
    categories: [category, { ...category, id: "other", name: "Uniformes" }],
    paymentTerms: [],
    benefits: [],
    costCenters: [],
    forecasts: [
      f,
      { ...f, id: "f2", code: "P2", month: "2026-10-01", due: "2026-10-15" },
      {
        ...f,
        id: "f3",
        code: "P3",
        contractId: missing.id,
        contract: missing,
        month: "2026-10-01",
        due: "2026-10-15",
        amount: "50.00",
      },
    ],
    measurements: [
      m,
      {
        ...m,
        id: "comp",
        code: "M2",
        originalId: m.id,
        amount: "10.00",
        confirmedSnapshot: {
          ...m.confirmedSnapshot,
          summary: {
            rows: [
              {
                unitId: "beneficiary-b",
                costCenterId: "cc",
                unitName: "Unidade B da época",
                costCenterName: "Centro antigo",
                amount: "10.00",
              },
            ],
          },
        },
      },
      {
        ...m,
        id: "avulsa",
        code: "M3",
        contractId: null,
        forecastId: null,
        supplierId: "other",
        categoryId: "other",
        unitId: "billing-b",
        amount: "30.00",
        confirmedSnapshot: {
          supplierName: "Uniformes",
          categoryName: "Uniformes",
          summary: {
            rows: [
              {
                unitId: "beneficiary-b",
                costCenterId: "cc",
                unitName: "Unidade B da época",
                costCenterName: "Centro antigo",
                amount: "30.00",
              },
            ],
          },
        },
      },
      {
        ...m,
        id: "draft",
        code: "M4",
        month: "2026-10-01",
        due: "2026-10-15",
        forecastId: "f2",
        status: "PREENCHIMENTO",
        amount: "200.00",
        confirmedSnapshot: null,
      },
    ],
  };
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const unexpected: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/storage/status") return route.fulfill({ json: { ready: true, needsChoice: false, mode: "postgres" } });
    if (path === "/api/me")
      return route.fulfill({
        json: {
          user: { id: "preview", username: "RH teste", role: "RH" },
          csrf: "test",
        },
      });
    if (path === "/api/contracts/bootstrap")
      return route.fulfill({ json: data });
    unexpected.push(path);
    return route.fulfill({
      status: 404,
      json: { error: "Rota não prevista no teste" },
    });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "Acessar Contratos e Medições →",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("article", { name: "Valor conferido", exact: true }),
  ).toContainText("R$ 130,00");
  await expect(
    page.getByRole("article", { name: "Previsto no período", exact: true }),
  ).toContainText("R$ 250,00");
  await expect(
    page.getByRole("article", { name: "Sem lançamento", exact: true }),
  ).toContainText("R$ 50,00");
  await page
    .getByRole("button", { name: "Ajuda sobre Valor conferido", exact: true })
    .focus();
  await expect(page.getByRole("tooltip")).toContainText(
    "Reabertura retira o valor",
  );
  await page.keyboard.press("Escape");
  const supplierPanel = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Maiores fornecedores",
      exact: true,
    }),
  });
  await supplierPanel
    .getByRole("button", { name: /Fornecedor histórico/ })
    .click();
  await expect(page.getByLabel("Fornecedor", { exact: true })).toHaveValue("s");
  await expect(
    page.getByRole("article", { name: "Valor conferido", exact: true }),
  ).toContainText("R$ 100,00");
  await page
    .getByRole("button", { name: "Remover filtro de fornecedor", exact: true })
    .click();
  await page
    .getByLabel("Unidade faturada", { exact: true })
    .selectOption("billing-a");
  await expect(
    page.getByRole("article", { name: "Valor conferido", exact: true }),
  ).toContainText("R$ 100,00");
  await page
    .getByRole("button", { name: "Centros de custo", exact: true })
    .click();
  await expect(
    page.getByText("Centro antigo · Unidade B da época", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restaurar filtros", exact: true })
    .click();
  await page.getByRole("button", { name: "Mês atual", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Valor conferido", exact: true }),
  ).toContainText("R$ 0,00");
  await expect(
    page.getByRole("article", { name: "Em preenchimento", exact: true }),
  ).toContainText("R$ 200,00");
  await page
    .getByRole("button", { name: "Restaurar filtros", exact: true })
    .click();
  await page
    .getByRole("button", { name: /setembro de 2026: previsto/ })
    .click();
  await page
    .getByRole("button", { name: "Analisar este mês →", exact: true })
    .click();
  await expect(
    page.getByLabel("Competência inicial", { exact: true }),
  ).toHaveValue("2026-09");
  await expect(
    page.getByLabel("Competência final", { exact: true }),
  ).toHaveValue("2026-09");
  await page.getByLabel("Competência inicial", { exact: true }).fill("");
  await expect(page.getByRole("alert")).toContainText("período válido");
  await page
    .getByRole("button", { name: "Restaurar filtros", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ver previsões pendentes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Lançar medição", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Contrato", { exact: true })).toHaveValue(
    "c2",
  );
  await expect(dialog.getByLabel("Competência *", { exact: true })).toHaveValue(
    "2026-10",
  );
  await expect(
    dialog.getByLabel("Valor da fatura (R$) *", { exact: true }),
  ).toHaveValue("50.00");
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Menu de contratos" })
    .getByRole("button", { name: "Visão geral", exact: true })
    .click();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await expect(
      page.getByRole("heading", { name: "Previsto × conferido", exact: true }),
    ).toBeVisible();
  }
  await page.getByLabel("Competência inicial", { exact: true }).fill("2030-01");
  await page.getByLabel("Competência final", { exact: true }).fill("2030-02");
  await expect(
    page.getByText("Nenhum registro encontrado", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});
