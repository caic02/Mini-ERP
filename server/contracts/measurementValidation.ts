import { z } from "zod";
import { date } from "../domain.js";
import { monthDate } from "./domain.js";
const id = z.string().min(1);
const optionalId = z
  .string()
  .nullish()
  .transform((v) => v || null);
const money = z
  .string()
  .regex(
    /^\d{1,12}(\.\d{1,2})?$/,
    "Informe valor positivo com até duas casas decimais.",
  );
const signed = z
  .string()
  .regex(
    /^-?\d{1,12}(\.\d{1,2})?$/,
    "Informe um valor com até duas casas decimais.",
  );
const note = z
  .string()
  .trim()
  .max(4000)
  .nullish()
  .transform((v) => v || null);
export const newMeasurementSchema = z.object({
  contractId: optionalId,
  forecastId: optionalId,
  originalId: optionalId,
  supplierId: optionalId,
  unitId: optionalId,
  categoryId: optionalId,
  month: z.string().transform(monthDate),
  invoice: note,
  issue: z.string().transform(date),
  due: z
    .string()
    .nullish()
    .transform((v) => (v ? date(v) : null)),
  amount: money,
  notes: note,
  mode: z.enum(["PESSOAS", "VALOR", "PERCENTUAL"]).optional(),
});
export const lineSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(["PESSOA", "CENTRO", "AJUSTE"]),
  unitId: id,
  costCenterId: id,
  amount: signed,
  percent: z
    .string()
    .regex(/^\d{1,3}(\.\d{1,2})?$/)
    .refine((v) => Number(v) <= 100, "Percentual máximo de 100%.")
    .default("0"),
  reason: note,
});
export const editMeasurementSchema = z.object({
  version: z.number().int().positive(),
  invoice: note,
  issue: z.string().transform(date),
  due: z.string().transform(date),
  amount: money,
  mode: z.enum(["PESSOAS", "VALOR", "PERCENTUAL"]),
  notes: note,
  reviewConfirmed: z.boolean().default(false),
  varianceConfirmed: z.boolean().default(false),
  lines: z.array(lineSchema).max(2000),
});
export const measurementActionSchema = z.object({
  version: z.number().int().positive(),
  action: z.enum(["CONFERIR", "REABRIR", "CANCELAR"]),
  reason: note,
});
