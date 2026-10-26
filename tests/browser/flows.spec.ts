import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../../server/db.js";
import {
  saveContractResource,
  changeContractStatus,
} from "../../server/contracts/service.js";
const run = randomUUID().slice(0, 8);
const username = "ui-" + run;
const password = randomUUID() + "!Local";
const healthName = "Plano de Saúde " + run;
const lifeName = "Seguro de Vida " + run;
let healthId: string;
test.beforeAll(async () => {
  if (
    process.env.CONFIRM_TEST_DB !== "SIM" ||
    !new URL(process.env.DATABASE_URL || "http://invalid").pathname.endsWith(
      "_test",
    )
  )
    throw new Error("Banco exclusivo _test obrigatório.");
  await db.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(password, 12),
      role: "RH",
    },
  });
  const e = await db.employment.findFirstOrThrow({
    where: { termination: null },
  });
  const health = await db.benefit.create({
    data: { code: "health-ui-" + run, name: healthName, kind: "SAUDE" },
  });
  healthId = health.id;
  const life = await db.benefit.create({
    data: { code: "life-ui-" + run, name: lifeName, kind: "VIDA" },
  });
  const dependent = await db.dependent.create({
    data: {
      personId: e.personId,
      name: "Dependente UI " + run,
      birthDate: new Date("2015-01-10T00:00:00Z"),
      relationshipId: "rel-child",
    },
  });
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  await db.enrollment.createMany({
    data: [
      { employmentId: e.id, benefitId: health.id, plan: "Básico", start },
      {
        employmentId: e.id,
        benefitId: health.id,
        dependentId: dependent.id,
        plan: "Especial",
        start,
      },
      { employmentId: e.id, benefitId: life.id, start },
    ],
  });
  await db.user.create({
    data: {
      username: username + "-read",
      passwordHash: await bcrypt.hash(password, 12),
      role: "CONSULTA",
    },
  });
});
test.afterAll(async () => {
  await db.$disconnect();
});
test("login, CRUD de unidade, ficha, férias, calendário e responsividade", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill(username);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Selecione um módulo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Contratos e Medições", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Acessar Contratos e Medições →",
      exact: true,
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/screenshots/modulos-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "docs/screenshots/modulos-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Acessar Recursos Humanos →", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByText("Colaboradores ativos", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/visao-geral-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cadastros", exact: true }).click();
  await page.getByRole("button", { name: "+ Cadastrar", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Código *", { exact: true }).fill("UI-" + run);
  await page
    .getByLabel("Nome *", { exact: true })
    .fill("Filial fictícia de teste");
  await page.getByLabel("Tipo *", { exact: true }).selectOption("FILIAL");
  await page
    .getByRole("button", { name: "Salvar registro", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "UI-" + run }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Colaboradores", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Abrir ficha" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Abrir ficha" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Ficha do colaborador", exact: true }),
  ).toBeVisible();
  for (const tab of [
    "Dados profissionais",
    "Dependentes",
    "Benefícios",
    "Férias",
    "Afastamentos",
    "Histórico",
  ]) {
    await page.getByRole("button", { name: tab, exact: true }).last().click();
    await expect(
      page.getByRole("heading", { name: "Ficha do colaborador", exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Férias", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Férias", exact: true }),
  ).toBeVisible();
  const availableHelp = page.getByRole("button", {
    name: "Ajuda sobre Disponível",
    exact: true,
  });
  await availableHelp.scrollIntoViewIfNeeded();
  await availableHelp.focus();
  await expect(page.getByRole("tooltip")).toContainText(
    "30 de direito, 10 gozados e 5 reservados deixam 15 disponíveis",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  const notEnjoyedHelp = page.getByRole("button", {
    name: "Ajuda sobre Não usufruído",
    exact: true,
  });
  await notEnjoyedHelp.scrollIntoViewIfNeeded();
  await notEnjoyedHelp.hover();
  await expect(page.getByRole("tooltip")).toContainText(
    "incluindo os já reservados",
  );
  await page.getByRole("heading", { name: "Férias", exact: true }).click();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await availableHelp.scrollIntoViewIfNeeded();
  await availableHelp.click();
  await expect(page.getByRole("tooltip")).toBeVisible();
  const tooltipBounds = await page.getByRole("tooltip").boundingBox();
  expect(tooltipBounds).not.toBeNull();
  expect(tooltipBounds!.x).toBeGreaterThanOrEqual(0);
  expect(tooltipBounds!.x + tooltipBounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "docs/screenshots/ajuda-colunas-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "+ Cadastrar", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Programação e gozo", exact: true })
    .click();
  await page.getByRole("button", { name: "+ Cadastrar", exact: true }).click();
  await page
    .getByLabel("Período aquisitivo *", { exact: true })
    .selectOption({ index: 1 });
  await page.getByLabel("Início *", { exact: true }).fill("2027-01-10");
  const periodsResponse = await page.request.get("/api/data/periods");
  const selectablePeriods = await periodsResponse.json();
  const periodOptions = await page
    .getByLabel("Período aquisitivo *", { exact: true })
    .locator("option")
    .evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .filter(Boolean),
    );
  const settledIds = selectablePeriods
    .filter((p: any) => p.settled)
    .map((p: any) => p.id);
  expect(settledIds.length).toBeGreaterThan(0);
  expect(periodOptions.some((id) => settledIds.includes(id))).toBeFalsy();
  expect(periodOptions.length).toBe(
    selectablePeriods.filter((p: any) => !p.settled).length,
  );
  await page.getByLabel("Dias corridos *", { exact: true }).fill("14");
  await expect(page.getByRole("dialog")).toContainText("23/01/2027");
  await expect(page.getByRole("dialog")).toContainText("24/01/2027");
  await page.screenshot({
    path: "docs/screenshots/programacao-desktop.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Calendário", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Calendário de ausências", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Colaboradores", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Colaboradores", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Abrir ficha" }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/colaboradores-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Benefícios", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Catálogo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pessoas cobertas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Seguro de vida", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/data/nominations")).status()).toBe(404);
  await page.getByRole("button", { name: healthName, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: healthName, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: healthName, exact: true }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("cell", { name: lifeName, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "Dependente UI " + run, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "+ Cadastrar", exact: true }).click();
  await expect(page.getByLabel("Benefício *", { exact: true })).toHaveValue(
    healthId,
  );
  await expect(
    page.getByLabel("Tipo de plano de saúde", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByLabel("Tipo de plano de saúde", { exact: true })
      .locator("option"),
  ).toHaveText(["Selecione", "Básico", "Apartamento", "Especial"]);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  const dependentRow = page.getByRole("row").filter({
    has: page.getByRole("cell", {
      name: "Dependente UI " + run,
      exact: true,
    }),
  });
  await expect(
    dependentRow.getByRole("cell", { name: "Especial", exact: true }),
  ).toBeVisible();
  await dependentRow
    .getByRole("button", { name: "Editar", exact: true })
    .click();
  await expect(
    page.getByLabel("Tipo de plano de saúde", { exact: true }),
  ).toHaveValue("Especial");
  await page
    .getByLabel("Tipo de plano de saúde", { exact: true })
    .selectOption("Apartamento");
  await page
    .getByRole("button", { name: "Salvar registro", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    dependentRow.getByRole("cell", { name: "Apartamento", exact: true }),
  ).toBeVisible();
  expect(
    (
      await db.enrollment.findFirstOrThrow({
        where: { benefitId: healthId, dependentId: { not: null } },
      })
    ).plan,
  ).toBe("Apartamento");
  await expect(
    page.getByRole("cell", { name: "Básico", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: lifeName, exact: true }).click();
  await expect(
    page.getByRole("cell", { name: lifeName, exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("cell", { name: healthName, exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Pessoas cobertas", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pessoas cobertas", exact: true }),
  ).toHaveClass("active");
  await page
    .getByRole("button", { name: "Trocar módulo", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Selecione um módulo", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Selecione um módulo", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Entrar no sistema", exact: true }),
  ).toBeVisible();
});
test("consulta acessa programação e ficha profissional sem cadastros pessoais", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill(username + "-read");
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Selecione um módulo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Acessar Contratos e Medições →",
      exact: true,
    }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/contracts/bootstrap")).status()).toBe(
    403,
  );
  await page
    .getByRole("button", { name: "Acessar Recursos Humanos →", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cadastros", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Colaboradores", exact: true })
    .click();
  await page.getByRole("button", { name: "Abrir ficha" }).first().click();
  await expect(
    page.getByRole("button", { name: "Dados profissionais", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Dados pessoais", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Dependentes", exact: true }),
  ).toHaveCount(0);
  const response = await page.request.get("/api/data/people");
  expect(response.status()).toBe(403);
  expect(
    (await page.request.get("/api/contracts/measurements/any")).status(),
  ).toBe(403);
});

test("medição de benefício: base, conferência final, reabertura e complemento", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const author = (await db.user.findUniqueOrThrow({ where: { username } })).id;
  const site = await db.unit.findFirstOrThrow({ where: { active: true } });
  const center = await db.costCenter.create({
    data: {
      code: "CC-MUI-" + run,
      name: "Centro UI medições",
      units: { create: { unitId: site.id } },
    },
  });
  const term = await saveContractResource(
    "payment-terms",
    { name: "Pagamento medição " + run, mode: "FIXO", day: 31 },
    undefined,
    author,
  );
  const supplier = await saveContractResource(
      "suppliers",
      { name: "Fornecedor medição " + run },
      undefined,
      author,
    ),
    category = await saveContractResource(
      "categories",
      { name: "Categoria medição " + run },
      undefined,
      author,
    );
  const now = new Date();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  let contract = await saveContractResource(
    "contracts",
    {
      name: "Contrato medição " + run,
      supplierId: supplier.id,
      unitId: site.id,
      categoryId: category.id,
      paymentTermId: term.id,
      kind: "VARIAVEL",
      start: month,
    },
    undefined,
    author,
  );
  await saveContractResource(
    "items",
    {
      contractId: contract.id,
      version: contract.version,
      name: "Saúde por pessoa",
      billingUnit: "PESSOA",
      quantity: "2",
      unitPrice: "100.00",
      allocationMode: "PESSOAS",
      benefitId: healthId,
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
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill(username);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Acessar Contratos e Medições →",
      exact: true,
    })
    .click();
  await page
    .getByRole("navigation", { name: "Menu de contratos" })
    .getByRole("button", { name: "Medições", exact: true })
    .click();
  await page
    .getByRole("button", { name: "+ Nova medição", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Contrato", { exact: true }).selectOption(contract.id);
  await page
    .getByLabel("Referência da fatura / NF", { exact: true })
    .fill("NF-UI-" + run);
  await page
    .getByRole("button", { name: "Salvar e abrir distribuição", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Base e distribuição dos custos",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", {
      name: new RegExp("^Dependente UI " + run + " Dependente de "),
    }),
  ).toBeVisible();
  const lineSearch = page.getByRole("searchbox", {
    name: "Pesquisar funcionário ou dependente",
  });
  const invoiceAmount = page.getByLabel("Valor da fatura (R$)", {
    exact: true,
  });
  const originalInvoice = await invoiceAmount.inputValue();
  await invoiceAmount.fill("");
  await invoiceAmount.pressSequentially("19680");
  await invoiceAmount.press("Tab");
  await expect(invoiceAmount).toHaveValue("19.680,00");
  await invoiceAmount.fill("R$ 19.680,50");
  await invoiceAmount.press("Tab");
  await expect(invoiceAmount).toHaveValue("19.680,50");
  await invoiceAmount.fill(originalInvoice);
  await invoiceAmount.press("Tab");
  const amounts = page.locator('input[aria-label^="Valor da linha "]');
  const initialAmounts = await amounts.evaluateAll((nodes) =>
    nodes.map((node) => ({
      label: node.getAttribute("aria-label")!,
      value: (node as HTMLInputElement).value,
    })),
  );
  await lineSearch.fill("DEPENDENTE UI " + run);
  await expect(amounts).toHaveCount(1);
  const filteredLabel = (await amounts.first().getAttribute("aria-label"))!;
  const originalAmount = initialAmounts.find(
    (item) => item.label === filteredLabel,
  )!.value;
  await amounts.first().fill("120.37");
  await page
    .getByRole("button", { name: "Limpar pesquisa", exact: true })
    .click();
  await expect(amounts).toHaveCount(initialAmounts.length);
  await expect(page.getByLabel(filteredLabel, { exact: true })).toHaveValue(
    "120,37",
  );
  for (const item of initialAmounts.filter(
    (item) => item.label !== filteredLabel,
  ))
    await expect(page.getByLabel(item.label, { exact: true })).toHaveValue(
      item.value,
    );
  await page.getByLabel(filteredLabel, { exact: true }).fill(originalAmount);
  await lineSearch.fill("pessoa que não existe");
  await expect(
    page.getByText(
      "Nenhum funcionário ou dependente encontrado para esta pesquisa.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Limpar pesquisa", exact: true })
    .click();
  const review = page.getByRole("checkbox", {
    name: "RH conferiu os alertas, coberturas, valores e lotações desta competência.",
    exact: true,
  });
  await review.check();
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Conferir medição", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Conferir medição", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Reabrir medição",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Registrar envio ao Financeiro",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByText("Envio registrado", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Conferida", { exact: true })).toHaveClass(
    /confirmed/,
  );
  await expect(page.getByText("Conferida", { exact: true })).toHaveCSS(
    "background-color",
    "rgb(15, 107, 70)",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/screenshots/medicao-conferida-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/screenshots/medicao-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Reabrir medição", exact: true })
    .click();
  await page
    .getByLabel("Motivo obrigatório", { exact: true })
    .fill("Correção administrativa fictícia");
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByText("Em preenchimento", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Valor da fatura (R$)", { exact: true }).fill("190.00");
  await page.getByLabel("Valor da linha 1", { exact: true }).fill("90.00");
  await review.check();
  await page
    .getByRole("checkbox", { name: /RH confirmou a diferença entre previsão/ })
    .check();
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Conferir medição", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Conferir medição", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Reabrir medição",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "REABRIR", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Distribuição", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Complemento", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Referência da fatura / NF", { exact: true })
    .fill("COMP-UI-" + run);
  await page
    .getByRole("dialog")
    .getByLabel("Valor da fatura (R$) *", { exact: true })
    .fill("10.00");
  await page
    .getByRole("button", { name: "Salvar e abrir distribuição", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByText("Nenhuma linha nesta distribuição.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "+ Adicionar centro", exact: true })
    .click();
  await page
    .getByLabel("Unidade da linha 1", { exact: true })
    .selectOption(site.id);
  await page
    .getByLabel("Centro da linha 1", { exact: true })
    .selectOption(center.id);
  await page.getByLabel("Valor da linha 1", { exact: true }).fill("10.00");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Conferir medição", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Conferir medição", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Reabrir medição",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "← Voltar às medições", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "Enviada ao Financeiro", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("option", { name: "Conferida", exact: true }),
  ).toBeAttached();
  await page
    .getByRole("row")
    .filter({ hasText: "COMP-UI-" + run })
    .getByRole("button", { name: "Abrir medição", exact: true })
    .click();
  await expect(page.getByText("Conferida", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/medicao-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

test("contratos: cadastros, itens, previsões, ativação e cancelamento pela interface", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("Usuário", { exact: true }).fill(username);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Acessar Contratos e Medições →",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Menu de contratos" })
    .getByRole("button", { name: "Cadastros", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Condições de pagamento", exact: true })
    .click();
  await page.getByRole("button", { name: "+ Cadastrar", exact: true }).click();
  await page
    .getByLabel("Descrição *", { exact: true })
    .fill("Pagamento UI " + run);
  await page.getByLabel("Dia do mês (1 a 31) *", { exact: true }).fill("31");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Categorias", exact: true }).click();
  await page.getByRole("button", { name: "+ Cadastrar", exact: true }).click();
  await page
    .getByLabel("Descrição *", { exact: true })
    .fill("Categoria UI " + run);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Fornecedores", exact: true }).click();
  await page.getByRole("button", { name: "+ Cadastrar", exact: true }).click();
  await page
    .getByLabel("Razão social / nome *", { exact: true })
    .fill("Fornecedor UI " + run);
  const supplierCategories = await page
    .getByLabel("Categoria padrão", { exact: true })
    .locator("option")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        value: (n as HTMLOptionElement).value,
        label: n.textContent || "",
      })),
    );
  const supplierCategory = supplierCategories.find((c) =>
    c.label.includes("Categoria UI " + run),
  )!;
  await page
    .getByLabel("Categoria padrão", { exact: true })
    .selectOption(supplierCategory.value);
  const terms = await page
    .getByLabel("Condição de pagamento padrão", { exact: true })
    .locator("option")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        value: (n as HTMLOptionElement).value,
        label: n.textContent || "",
      })),
    );
  const term = terms.find((t) => t.label.includes("Pagamento UI " + run))!;
  await page
    .getByLabel("Condição de pagamento padrão", { exact: true })
    .selectOption(term.value);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("navigation", { name: "Menu de contratos" })
    .getByRole("button", { name: "Contratos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "+ Novo contrato", exact: true })
    .click();
  await page
    .getByLabel("Descrição do contrato *", { exact: true })
    .fill("Contrato UI " + run);
  const vendors = await page
    .getByLabel("Fornecedor *", { exact: true })
    .locator("option")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        value: (n as HTMLOptionElement).value,
        label: n.textContent || "",
      })),
    );
  await page
    .getByLabel("Fornecedor *", { exact: true })
    .selectOption(
      vendors.find((v) => v.label.includes("Fornecedor UI " + run))!.value,
    );
  await page
    .getByLabel("Unidade faturada *", { exact: true })
    .selectOption({ index: 1 });
  const categories = await page
    .getByLabel("Categoria *", { exact: true })
    .locator("option")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        value: (n as HTMLOptionElement).value,
        label: n.textContent || "",
      })),
    );
  await expect(page.getByLabel("Categoria *", { exact: true })).toHaveValue(
    supplierCategory.value,
  );
  await page
    .getByLabel("Categoria *", { exact: true })
    .selectOption(
      categories.find((v) => v.label.includes("Categoria UI " + run))!.value,
    );
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 0))
    .toISOString()
    .slice(0, 10);
  await page.getByLabel("Início da vigência *", { exact: true }).fill(start);
  await page.getByLabel("Fim da vigência", { exact: true }).fill(end);
  await expect(
    page.getByLabel("Condição de pagamento *", { exact: true }),
  ).toHaveValue(term.value);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ficha do contrato", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "+ Adicionar item", exact: true })
    .click();
  await page
    .getByLabel("Descrição do item *", { exact: true })
    .fill("Mensalidade UI " + run);
  await page
    .getByLabel("Quantidade de referência *", { exact: true })
    .fill("2.5");
  await page
    .getByLabel("Valor unitário (R$) *", { exact: true })
    .fill("100.10");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Mensalidade UI " + run, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Previsões", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("cell", { name: "R$ 250,25", exact: true }),
  ).toHaveCount(3);
  await page
    .getByRole("button", { name: "Alterar situação", exact: true })
    .click();
  await page
    .getByLabel("Nova situação *", { exact: true })
    .selectOption("VIGENTE");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByText("Termos e itens estão preservados após a ativação.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/contratos-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Cancelar previsão", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Motivo do cancelamento *", { exact: true })
    .fill("Teste de cancelamento");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page
      .getByRole("cell")
      .filter({ has: page.getByText("Cancelada", { exact: true }) }),
  ).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/contratos-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
  await page
    .getByRole("button", { name: "Trocar módulo", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Selecione um módulo", exact: true }),
  ).toBeVisible();
});
