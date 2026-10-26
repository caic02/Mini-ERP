import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { rateLimit } from "express-rate-limit";
import { db } from "./db.js";
import { RuleError } from "./domain.js";
declare global {
  namespace Express {
    interface Request {
      user: { id: string; username: string; role: string };
      sessionCsrf: string;
    }
  }
}
export const hashToken = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const loginLimiter = rateLimit({
  windowMs: 15 * 60000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde 15 minutos." },
});
export async function login(req: Request, res: Response) {
  const { username, password } = req.body || {};
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    Buffer.byteLength(password) > 72
  )
    throw new RuleError("Credenciais inválidas.", 401);
  const user = await db.user.findUnique({ where: { username } });
  const fallback =
    "$2b$12$KIXx8sL6YBCSeNeR.HuYqOVlmQZwq07POwST9D.tY5nGZ6ZGGgPKe";
  const valid = await bcrypt.compare(password, user?.passwordHash || fallback);
  if (!user?.active || !valid)
    throw new RuleError("Usuário ou senha inválidos.", 401);
  const token = randomBytes(32).toString("hex"),
    csrf = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      id: hashToken(token),
      userId: user.id,
      csrf,
      expiresAt: new Date(Date.now() + 8 * 3600000),
    },
  });
  res
    .cookie("rh_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 8 * 3600000,
      path: "/",
    })
    .json({
      user: { id: user.id, username: user.username, role: user.role },
      csrf,
    });
}
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const token = req.cookies?.rh_session;
  if (!token) throw new RuleError("Entre para continuar.", 401);
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active)
    throw new RuleError("Sessão expirada.", 401);
  req.user = {
    id: session.user.id,
    username: session.user.username,
    role: session.user.role,
  };
  req.sessionCsrf = session.csrf;
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers["x-csrf-token"] !== session.csrf
  )
    throw new RuleError("Sessão inválida. Atualize a página.", 403);
  next();
}
export function rhOnly(req: Request, _res: Response, next: NextFunction) {
  if (req.user.role !== "RH")
    throw new RuleError("Acesso restrito ao RH administrador.", 403);
  next();
}
