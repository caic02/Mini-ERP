import { test, expect } from "@playwright/test";

test("primeira abertura: caminho manual, teste de acesso, seleção e login; layout móvel", async ({
  page,
}) => {
  let selected = false;
  const file = String.raw`\\servidor\RH\MiniERP\base.mdb`;
  const status = () => ({
    ready: selected,
    needsChoice: !selected,
    mode: selected ? "file" : null,
    path: selected ? file : "",
    identity: "base-teste",
    error: "",
    token: "local-test",
    canPostgres: false,
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()).pathname;
    if (url === "/api/storage/status") return route.fulfill({ json: status() });
    if (url === "/api/me")
      return route.fulfill({
        status: 401,
        json: { error: "Entre no sistema." },
      });
    expect(route.request().headers()["x-storage-token"]).toBe("local-test");
    if (url === "/api/storage/browse") {
      const requested = route.request().postDataJSON().path;
      if (requested === "inexistente")
        return route.fulfill({
          status: 422,
          json: { error: "Não foi possível listar essa pasta." },
        });
      expect([file, String.raw`\\servidor\RH\MiniERP\subpasta`]).toContain(
        requested,
      );
      return route.fulfill({
        json: {
          path: String.raw`\\servidor\RH\MiniERP`,
          parent: String.raw`\\servidor\RH`,
          shortcuts: [],
          truncated: false,
          entries: [
            {
              name: "subpasta",
              path: String.raw`\\servidor\RH\MiniERP\subpasta`,
              directory: true,
            },
            { name: "base.mdb", path: file, directory: false },
          ],
        },
      });
    }
    if (url === "/api/storage/check") {
      expect(route.request().postDataJSON()).toEqual({ path: file });
      return route.fulfill({
        json: {
          message: "Base reconhecida e leitura concluída.",
          people: 30,
          identity: "base-teste",
        },
      });
    }
    if (url === "/api/storage/select") {
      expect(route.request().postDataJSON()).toEqual({
        mode: "file",
        path: file,
      });
      selected = true;
      return route.fulfill({ json: { ok: true } });
    }
    throw new Error("Rota não prevista: " + url);
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Conectar à base de dados" }),
  ).toBeVisible();
  const heading = await page
    .getByRole("heading", { name: "Conectar à base de dados" })
    .boundingBox();
  const header = await page.locator(".storage-card > header").boundingBox();
  expect(heading!.y + heading!.height).toBeLessThanOrEqual(
    header!.y + header!.height,
  );
  await page
    .getByRole("textbox", { name: "Caminho completo do arquivo" })
    .fill(file);
  await page.getByRole("button", { name: "Procurar…" }).click();
  await expect(
    page.getByRole("dialog", { name: "Selecionar base de dados" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Selecionar base base.mdb" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/procurar-base-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const picker = await page.getByRole("dialog").boundingBox();
  expect(picker!.x).toBeGreaterThanOrEqual(0);
  expect(picker!.x + picker!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "docs/screenshots/procurar-base-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Procurar…" }).click();
  await page
    .getByRole("button", { name: "Abrir pasta subpasta", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Pasta ou caminho do arquivo" })
    .fill("inexistente");
  await page.getByRole("button", { name: "Abrir pasta", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível listar",
  );
  await page
    .getByRole("textbox", { name: "Pasta ou caminho do arquivo" })
    .fill(file);
  await page.getByRole("button", { name: "Abrir pasta", exact: true }).click();
  await page.getByRole("button", { name: "Selecionar base base.mdb" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Caminho completo do arquivo" }),
  ).toHaveValue(file);
  await page.getByRole("button", { name: "Testar acesso" }).click();
  await expect(page.getByRole("status")).toContainText("30 pessoa(s)");
  await page.screenshot({
    path: "docs/screenshots/configuracao-base-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/configuracao-base-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "Entrar no sistema" }),
  ).toBeVisible();
  await expect(
    page.getByText("Conectado à base em arquivo selecionada."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Alterar base de dados" }).click();
  await expect(
    page.getByText("Base configurada", { exact: true }),
  ).toBeVisible();
});

test("base indisponível mantém caminho e mostra erro; criar vazia exige confirmação da senha", async ({
  page,
}) => {
  let creates = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()).pathname;
    if (url === "/api/storage/status")
      return route.fulfill({
        json: {
          ready: false,
          needsChoice: false,
          mode: "file",
          path: String.raw`\\servidor\RH\base.mdb`,
          identity: "original",
          token: "test",
          error: "A base está indisponível.",
          canPostgres: false,
        },
      });
    if (url === "/api/storage/check")
      return route.fulfill({
        status: 503,
        json: { error: "Confira a conexão com a pasta." },
      });
    if (url === "/api/storage/create") {
      creates++;
      return route.fulfill({
        status: 422,
        json: { error: "Este arquivo já existe." },
      });
    }
    throw new Error("Rota não prevista: " + url);
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toHaveText("A base está indisponível.");
  await page.getByRole("button", { name: "Testar acesso" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Confira a conexão com a pasta.",
  );
  await page.getByRole("button", { name: "Criar base vazia" }).click();
  await page
    .getByRole("textbox", { name: "Usuário administrador" })
    .fill("admin");
  await page.getByLabel("Senha", { exact: true }).fill("senha-exemplo-123");
  await page
    .getByLabel("Confirmar senha", { exact: true })
    .fill("senha-diferente-123");
  await page.getByRole("button", { name: "Criar base e continuar" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "As senhas precisam ser iguais.",
  );
  expect(creates).toBe(0);
  await page
    .getByLabel("Confirmar senha", { exact: true })
    .fill("senha-exemplo-123");
  await page.getByRole("button", { name: "Criar base e continuar" }).click();
  await expect(page.getByRole("alert")).toHaveText("Este arquivo já existe.");
  expect(creates).toBe(1);
});
