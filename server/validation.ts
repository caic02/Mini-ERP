import { z } from "zod";
import { date, validCpf } from "./domain.js";
import { healthPlanOptions } from "../shared/benefits.js";
const text = z.string().trim().min(1).max(500);
const optional = z
  .string()
  .trim()
  .max(4000)
  .nullish()
  .transform((v) => v || null);
const civil = z.string().transform(date);
const optionalDate = z
  .string()
  .nullish()
  .transform((v) => (v ? date(v) : null));
const cpf = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine(validCpf, "CPF inválido.");
const email = z
  .union([z.string().email(), z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);
export const personSchema = z.object({
  name: text,
  socialName: optional,
  cpf,
  birthDate: civil,
  phone: optional,
  email,
  address: optional,
  emergencyName: optional,
  emergencyPhone: optional,
  emergencyRelation: optional,
  notes: optional,
  archived: z.boolean().default(false),
});
export const employmentSchema = z.object({
  personId: text,
  registration: text,
  unitId: text,
  costCenterId: text,
  departmentId: text,
  jobId: text,
  managerId: optional,
  kind: z.enum(["CLT", "ESTAGIO", "APRENDIZ", "TEMPORARIO", "OUTRO"]),
  admission: civil,
  termination: optionalDate,
  status: z.enum(["ATIVO", "INATIVO", "DESLIGADO"]),
  reason: optional,
  corporateEmail: email,
  weeklyHours: z.coerce.number().min(0).max(168).nullish(),
  effective: optionalDate,
  changeReason: optional,
});
export const unitSchema = z.object({
  code: text,
  name: text,
  kind: z.enum(["MATRIZ", "FILIAL"]),
  cnpj: optional,
  address: optional,
  city: optional,
  state: z
    .string()
    .length(2)
    .or(z.literal(""))
    .nullish()
    .transform((v) => v?.toUpperCase() || null),
  active: z.boolean().default(true),
});
export const costSchema = z.object({
  code: text,
  name: text,
  active: z.boolean().default(true),
  unitIds: z.array(text).min(1),
});
export const lookupSchema = z.object({
  kind: z.enum([
    "DEPARTAMENTO",
    "CARGO",
    "AFASTAMENTO",
    "BENEFICIO",
    "PARENTESCO",
  ]),
  name: text,
  tag: optional,
  active: z.boolean().default(true),
});
export const dependentSchema = z.object({
  personId: text,
  name: text,
  cpf: z
    .string()
    .nullish()
    .transform((v) => (v ? v.replace(/\D/g, "") : null))
    .refine((v) => !v || validCpf(v), "CPF inválido."),
  birthDate: civil,
  relationshipId: text,
  relationshipDescription: optional,
  phone: optional,
  notes: optional,
  incomeTax: z.boolean().default(false),
  active: z.boolean().default(true),
});
export const benefitSchema = z
  .object({
    code: text,
    name: text,
    kind: z.enum(["SAUDE", "ODONTO", "VIDA", "VR", "VA", "VT", "OUTRO"]),
    provider: optional,
    plan: optional,
    contract: optional,
    active: z.boolean().default(true),
    notes: optional,
  })
  .superRefine((data, context) => {
    if (
      data.kind === "SAUDE" &&
      data.plan &&
      !healthPlanOptions.includes(
        data.plan as (typeof healthPlanOptions)[number],
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["plan"],
        message: "Selecione Básico, Apartamento ou Especial.",
      });
    }
  });
const money = z
  .union([
    z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
    z.number().min(0).max(9999999999).multipleOf(0.01),
  ])
  .nullish();
export const enrollmentSchema = z.object({
  benefitId: text,
  employmentId: text,
  dependentId: optional,
  card: optional,
  plan: z
    .union([z.enum(healthPlanOptions), z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
  start: civil,
  end: optionalDate,
  companyCost: money,
  active: z.boolean().default(true),
  notes: optional,
});
export const leaveSchema = z.object({
  employmentId: text,
  typeId: text,
  start: civil,
  expectedEnd: optionalDate,
  actualEnd: optionalDate,
  notes: optional,
  review: z.boolean().default(true),
});
export const bookingSchema = z.object({
  periodId: text,
  start: civil,
  days: z.coerce.number().int().min(1).max(366),
  status: z.enum([
    "RASCUNHO",
    "PROGRAMADA",
    "APROVADA",
    "EM_ANDAMENTO",
    "CONCLUIDA",
    "CANCELADA",
  ]),
  reviewConfirmed: z.boolean().default(false),
  consent: z.boolean().default(false),
  notes: optional,
});
export const adjustmentSchema = z.object({
  periodId: text,
  kind: z.enum(["ABONO", "AJUSTE"]),
  days: z.coerce.number().int().min(-365).max(365),
  reason: text,
});
export const periodSchema = z.object({
  employmentId: text,
  start: civil,
  end: civil,
  concessionStart: civil,
  concessionEnd: civil,
  target: civil,
  entitlement: z.coerce.number().int().min(0).max(60),
  review: z.boolean().default(true),
  notes: text,
});
