import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import bcrypt from "bcryptjs";
import { db } from "../server/db.js";
// Password is read from the terminal with echo disabled, never from command-line arguments.
async function secret(prompt: string): Promise<string> {
  if (!stdin.isTTY) throw new Error("Execute em um terminal interativo.");
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    function read(chunk: Buffer) {
      for (const ch of chunk.toString()) {
        if (ch === "\u0003") {
          cleanup();
          reject(new Error("Cancelado."));
          return;
        }
        if (ch === "\r" || ch === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    }
    function cleanup() {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", read);
      stdout.write("\n");
    }
    stdin.on("data", read);
  });
}
try {
  const rl = createInterface({ input: stdin, output: stdout });
  const username = (await rl.question("Nome do usuário: ")).trim();
  const role =
    (await rl.question("Perfil RH ou CONSULTA [RH]: ")).trim().toUpperCase() ||
    "RH";
  rl.close();
  if (username === "sistema.ferias")
    throw new Error(
      "Nome reservado para auditoria automática. Escolha outro usuário.",
    );
  if (!/^[\w.-]{3,80}$/.test(username) || !["RH", "CONSULTA"].includes(role))
    throw new Error("Usuário ou perfil inválido.");
  const password = await secret(
    "Senha (mínimo 12 caracteres, entrada oculta): ",
  );
  const confirm = await secret("Confirme a senha: ");
  if (
    password.length < 12 ||
    Buffer.byteLength(password) > 72 ||
    password !== confirm
  )
    throw new Error(
      "Senhas diferentes ou comprimento inválido (12 caracteres a 72 bytes).",
    );
  const existing = await db.user.findUnique({ where: { username } });
  if (existing) {
    const check = createInterface({ input: stdin, output: stdout });
    const answer = await check.question(
      "Usuário existente: redefinir senha e perfil e revogar sessões? Digite SIM: ",
    );
    check.close();
    if (answer !== "SIM") throw new Error("Cancelado.");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await db.$transaction(async (tx) => {
    if (existing) {
      if (
        existing.role === "RH" &&
        role !== "RH" &&
        (await tx.user.count({ where: { role: "RH", active: true } })) <= 1
      )
        throw new Error("Não é possível remover o último administrador.");
      await tx.user.update({
        where: { id: existing.id },
        data: { passwordHash, role, active: true },
      });
      await tx.session.deleteMany({ where: { userId: existing.id } });
    } else {
      await tx.user.create({ data: { username, passwordHash, role } });
    }
  });
  console.log("Usuário salvo.");
} catch (e) {
  console.error(
    e instanceof Error ? e.message : "Não foi possível criar usuário.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
