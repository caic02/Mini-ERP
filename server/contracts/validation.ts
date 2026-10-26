import { z } from "zod";
import { date, ensure } from "../domain.js";
import { contractKinds, contractStatuses } from "./domain.js";
const text = z.string().trim().min(1).max(500);
const optional = z
  .string()
  .trim()
  .max(4000)
  .nullish()
  .transform((v) => v || null);
const civil = z.string().transform(date),
  optionalDate = z
    .string()
    .nullish()
    .transform((v) => (v ? date(v) : null));
const positiveQuantity = z
  .string()
  .regex(
    /^\d{1,9}(\.\d{1,3})?$/,
    "Use uma quantidade positiva, com até três casas decimais.",
  )
  .refine((v) => Number(v) > 0, "Quantidade deve ser positiva.");
const amount = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Use um valor com até duas casas decimais.");
export const supplierSchema = z.object({
  name: text,
  tradeName: optional,
  document: optional,
  contact: optional,
  phone: optional,
  email: z
    .union([z.string().email(), z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
  paymentTermId: optional,
  categoryId: optional,
  notes: optional,
  active: z.boolean().default(true),
});
export const categorySchema = z.object({
  name: text,
  active: z.boolean().default(true),
});
export const paymentTermSchema = z
  .object({
    name: text,
    mode: z.enum(["FIXO", "DIAS"]),
    day: z.coerce.number().int().min(1).max(31).nullish(),
    days: z.coerce.number().int().min(0).max(365).nullish(),
    active: z.boolean().default(true),
  })
  .superRefine((v, c) => {
    if (v.mode === "FIXO" && !v.day)
      c.addIssue({
        code: "custom",
        path: ["day"],
        message: "Informe o dia fixo entre 1 e 31.",
      });
    if (v.mode === "DIAS" && v.days == null)
      c.addIssue({
        code: "custom",
        path: ["days"],
        message: "Informe o prazo em dias.",
      });
  });
export const contractSchema = z
  .object({
    name: text,
    externalNumber: optional,
    supplierId: text,
    unitId: text,
    categoryId: text,
    paymentTermId: text,
    start: civil,
    end: optionalDate,
    adjustmentDate: optionalDate,
    alertDays: z.coerce.number().int().min(1).max(365).default(90),
    kind: z.enum(contractKinds),
    notes: optional,
    version: z.number().int().positive().optional(),
  })
  .superRefine((v, c) => {
    if (v.end && v.end < v.start)
      c.addIssue({
        code: "custom",
        path: ["end"],
        message: "Fim anterior ao início da vigência.",
      });
    if (v.end && +v.end - +v.start > 366 * 100 * 86400000)
      c.addIssue({
        code: "custom",
        path: ["end"],
        message: "A vigência não pode exceder 100 anos.",
      });
  });
export const itemSchema = z
  .object({
    contractId: text,
    name: text,
    billingUnit: z.enum(["MENSALIDADE", "PESSOA", "HORA", "SERVICO", "OUTRA"]),
    quantity: positiveQuantity,
    unitPrice: amount,
    allocationMode: z.enum(["VALOR", "PERCENTUAL", "PESSOAS"]),
    benefitId: optional,
    active: z.boolean().default(true),
    version: z.number().int().positive().optional(),
  })
  .superRefine((v, c) => {
    if (v.allocationMode === "PESSOAS" && !v.benefitId)
      c.addIssue({
        code: "custom",
        path: ["benefitId"],
        message: "Selecione o benefício para usar suas coberturas.",
      });
  });
export const statusSchema = z.object({
  status: z.enum(contractStatuses),
  version: z.number().int().positive(),
  closedOn: optionalDate,
  reason: optional,
});
