import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
export { database as db } from "./storage/runtime.js";
import { database as db } from "./storage/runtime.js";
export function isSerializationError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" ||
      (error.code === "P2010" &&
        ["40001", "40P01"].includes(String(error.meta?.code))))
  );
}
export async function serial<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        timeout: 20000,
      });
    } catch (e) {
      if (isSerializationError(e) && attempt < 4) {
        await new Promise((resolve) =>
          setTimeout(resolve, 40 + Math.random() * 100 * (attempt + 1)),
        );
        continue;
      }
      throw e;
    }
  }
}
export const employeeInclude = {
  person: true,
  unit: true,
  costCenter: true,
  department: true,
  job: true,
  manager: { include: { person: true } },
  assignments: {
    include: { unit: true, costCenter: true, department: true, job: true },
    orderBy: { effective: "desc" as const },
  },
  leaves: { include: { type: true } },
  periods: {
    include: { bookings: true, adjustments: true },
    orderBy: { start: "desc" as const },
  },
};
