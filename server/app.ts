import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { z, ZodError } from "zod";
import { Prisma } from "@prisma/client";
import path from "node:path";
import { db, serial, employeeInclude, isSerializationError } from "./db.js";
import {
  authenticate,
  rhOnly,
  login,
  loginLimiter,
  hashToken,
} from "./auth.js";
import {
  RuleError,
  ensure,
  currentCondition,
  professionalProjection,
  balance,
  periodIndicator,
  today,
  addDays,
} from "./domain.js";
import { saveResource, listResource, reconcileAll, audit } from "./services.js";
import { contractsRouter } from "./contracts/router.js";
import { storageRouter } from "./storage/router.js";
import { beginRequest } from "./storage/runtime.js";
import { FileStorageError } from "./storage/native.js";
export const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
  }),
);
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());
app.use("/api", (req, _res, next) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    const expected = process.env.APP_ORIGIN || "http://127.0.0.1:5173";
    if (req.headers.origin !== expected)
      throw new RuleError("Origem não autorizada.", 403);
  }
  next();
});
app.use("/api/storage", storageRouter);
app.use("/api", async (_req, res, next) => {
  await beginRequest(next, done => { res.once("finish", done); res.once("close", done); });
});
app.post("/api/login", loginLimiter, login);
app.use("/api", authenticate);
app.use("/api/contracts", contractsRouter);
app.get("/api/me", (req, res) =>
  res.json({ user: req.user, csrf: req.sessionCsrf }),
);
app.post("/api/logout", async (req, res) => {
  await db.session.deleteMany({
    where: { id: hashToken(req.cookies.rh_session) },
  });
  res.clearCookie("rh_session", { path: "/" }).json({ ok: true });
});
app.get("/api/professional", async (req, res) => {
  const employees = await db.employment.findMany({
    include: employeeInclude,
    orderBy: { registration: "asc" },
  });
  res.json(employees.map(professionalProjection));
});
app.get("/api/dashboard", async (req, res) => {
  const employees = await db.employment.findMany({ include: employeeInclude });
  const now = today();
  const from = req.query.from
      ? new Date(String(req.query.from) + "T00:00:00Z")
      : addDays(now, -30),
    to = req.query.to ? new Date(String(req.query.to) + "T00:00:00Z") : now;
  const conditions = employees.map((e) => currentCondition(e));
  const upcoming = employees.flatMap((e) =>
    e.periods.flatMap((p) =>
      p.bookings
        .filter(
          (b) =>
            ["APROVADA", "EM_ANDAMENTO"].includes(b.status) &&
            b.end >= now &&
            b.start <= addDays(now, 90),
        )
        .map((b) => ({
          name: e.person.name,
          registration: e.registration,
          unit: e.unit.name,
          start: b.start,
          end: b.end,
          days: b.days,
        })),
    ),
  );
  const base = {
    active: employees.filter((e) => e.status === "ATIVO" && e.admission <= now)
      .length,
    working: conditions.filter((c) => c.label === "Em atividade").length,
    vacation: conditions.filter((c) => c.label === "Em férias").length,
    away: conditions.filter((c) =>
      ["Afastado", "Licença-maternidade", "Outra licença"].includes(c.label),
    ).length,
    terminated: employees.filter(
      (e) => e.termination && e.termination >= from && e.termination <= to,
    ).length,
    upcoming,
  };
  if (req.user.role !== "RH") {
    res.json(base);
    return;
  }
  const company = await db.company.findUniqueOrThrow({
    where: { id: "middleby" },
  });
  const periods = employees.flatMap((e) =>
    e.periods.map((p) => ({
      ...p,
      employeeName: e.person.name,
      registration: e.registration,
      balance: balance(p),
      indicator: periodIndicator(p, balance(p), now, company.alertDays),
    })),
  );
  res.json({
    ...base,
    deadlines: periods.filter(
      (p) =>
        p.balance.notEnjoyed > 0 &&
        p.concessionEnd <= addDays(now, Math.max(...company.alertDays)),
    ),
    reviews:
      periods.filter((p) => p.review).length +
      conditions.filter((c) => c.conflict).length,
  });
});
app.use("/api/data", rhOnly);
app.get("/api/data/:resource", async (req, res) => {
  const result = await listResource(String(req.params.resource));
  if (req.params.resource === "periods") {
    const company = await db.company.findUniqueOrThrow({
      where: { id: "middleby" },
    });
    res.json(
      (result as any[]).map((p) => ({
        ...p,
        balance: balance(p),
        settled: p.end < today() && balance(p).notEnjoyed <= 0,
        indicator: periodIndicator(p, balance(p), today(), company.alertDays),
      })),
    );
  } else res.json(result);
});
app.post("/api/data/:resource", async (req, res) =>
  res
    .status(201)
    .json(
      await saveResource(
        String(req.params.resource),
        req.body,
        undefined,
        req.user.id,
      ),
    ),
);
app.put("/api/data/:resource/:id", async (req, res) =>
  res.json(
    await saveResource(
      String(req.params.resource),
      req.body,
      String(req.params.id),
      req.user.id,
    ),
  ),
);
app.put("/api/settings", rhOnly, async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(1),
      legalName: z.string().nullish(),
      code: z.string().trim().min(1),
      notes: z.string().nullish(),
      targetMonths: z.coerce.number().int().min(1).max(12),
      alertDays: z.array(z.number().int().min(1).max(365)).min(1).max(10),
    })
    .parse(req.body);
  res.json(
    await serial(async (tx) => {
      const result = await tx.company.update({
        where: { id: "middleby" },
        data,
      });
      await audit(
        tx,
        req.user.id,
        "ALTERAR",
        "company",
        "middleby",
        Object.keys(data),
      );
      return result;
    }),
  );
});
app.post("/api/reconcile", rhOnly, async (_req, res) => {
  await reconcileAll();
  res.json({ ok: true });
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Rota não encontrada." }),
);
app.use(express.static(path.resolve("dist")));
app.get("/{*splat}", (_req, res) =>
  res.sendFile(path.resolve("dist/index.html")),
);
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof FileStorageError) {
      res.status(["TOKEN", "LOCAL"].includes(error.code) ? 403 : ["PATH", "SYNC", "EXISTS", "PROVIDER", "SIZE", "INVALID", "SCHEMA"].includes(error.code) ? 422 : 503).json({ error: error.message, code: error.code, storageUnavailable: ["UNAVAILABLE", "BASE_CHANGED"].includes(error.code) });
      return;
    }
    if (error instanceof ZodError) {
      res.status(422).json({
        error: "Revise os campos informados.",
        fields: Object.fromEntries(
          error.issues.map((i) => [i.path.join("."), i.message]),
        ),
      });
      return;
    }
    if (error instanceof RuleError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (isSerializationError(error)) {
      res
        .status(409)
        .json({ error: "Conflito simultâneo. Atualize e tente novamente." });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (["P2002", "P2003", "P2025", "P2034"].includes(error.code)) {
        res.status(409).json({
          error:
            error.code === "P2002"
              ? "Registro duplicado ou regra de unicidade violada."
              : error.code === "P2025"
                ? "Registro não encontrado."
                : error.code === "P2034"
                  ? "Conflito simultâneo. Atualize e tente novamente."
                  : "Registro possui vínculo inválido ou histórico relacionado.",
        });
        return;
      }
    }
    console.error(
      "Falha de operação",
      error instanceof Prisma.PrismaClientKnownRequestError
        ? error.code
        : "INTERNAL",
    );
    res.status(500).json({
      error: "Operação indisponível. Verifique o banco e a configuração local.",
    });
  },
);
