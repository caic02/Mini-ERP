import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { initialDataset } from "./initialize.js";
import { z } from "zod";
import { createFile, fileClient, openFile } from "./file.js";
import { FileStorageError } from "./native.js";
import { browseFiles } from "./browse.js";
import {
  canPostgres,
  retryStorage,
  selectStorage,
  storageStatus,
} from "./runtime.js";

export const storageRouter = Router();
const token = randomBytes(32).toString("hex");
storageRouter.use((req, _res, next) => {
  if (
    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
      req.socket.remoteAddress || "",
    )
  )
    throw new FileStorageError(
      "LOCAL",
      "A configuração deve ser feita no próprio computador.",
    );
  if (!["GET", "HEAD"].includes(req.method)) {
    const provided = String(req.headers["x-storage-token"] || "");
    if (
      provided.length !== token.length ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(token))
    )
      throw new FileStorageError(
        "TOKEN",
        "Reabra a configuração e tente novamente.",
      );
  }
  next();
});
storageRouter.get("/status", async (_req, res) =>
  res.json({ ...(await storageStatus()), token }),
);
storageRouter.post("/retry", async (_req, res) =>
  res.json({ ...(await retryStorage()), token }),
);
storageRouter.post("/browse", async (req, res) => {
  const data = z
    .object({ path: z.string().max(1024).default("") })
    .parse(req.body);
  res.json(await browseFiles(data.path));
});
storageRouter.post("/check", async (req, res) => {
  const { path } = z
    .object({ path: z.string().min(1).max(1024) })
    .parse(req.body);
  const opened = await openFile(path);
  res.json({
    identity: opened.store.profile.identity,
    people: opened.snapshot.data.models.Person.length,
    users: opened.snapshot.data.models.User.length,
    message: "Base reconhecida e leitura concluída.",
  });
});
storageRouter.post("/select", async (req, res) => {
  const data = z
    .object({
      mode: z.enum(["file", "postgres"]),
      path: z.string().max(1024).optional(),
    })
    .parse(req.body);
  if (data.mode === "file") {
    const opened = await openFile(data.path || "");
    await selectStorage(opened.store.profile, fileClient(opened.store));
  } else {
    if (!canPostgres)
      throw new FileStorageError(
        "CONFIG",
        "O banco atual não está configurado neste computador.",
      );
    const candidate = new PrismaClient({ log: [] });
    try {
      await selectStorage({ mode: "postgres" }, candidate);
    } catch (error) {
      await candidate.$disconnect();
      throw error;
    }
  }
  res.clearCookie("rh_session", { path: "/" }).json({ ok: true });
});
storageRouter.post("/create", async (req, res) => {
  const data = z
    .object({
      path: z.string().min(1).max(1024),
      username: z
        .string()
        .trim()
        .regex(/^[\w.-]{3,80}$/)
        .refine(
          (v) => v !== "sistema.ferias",
          "Nome reservado. Escolha outro usuário.",
        ),
      password: z
        .string()
        .min(12)
        .max(72)
        .refine(
          (v) => Buffer.byteLength(v) <= 72,
          "Use no máximo 72 bytes na senha.",
        ),
    })
    .parse(req.body);
  const store = await createFile(
    data.path,
    await initialDataset(data.username, data.password),
  );
  await selectStorage(store.profile, fileClient(store));
  res.clearCookie("rh_session", { path: "/" }).status(201).json({ ok: true });
});
