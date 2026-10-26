import { Prisma } from "@prisma/client";
import { db, serial } from "../db.js";
import { audit } from "../services.js";
import { ensure, today, RuleError, iso } from "../domain.js";
import {
  forecastMonths,
  paymentDue,
  monthStart,
  contractTotal,
  itemTotal,
} from "./domain.js";
import {
  supplierSchema,
  categorySchema,
  paymentTermSchema,
  contractSchema,
  itemSchema,
  statusSchema,
} from "./validation.js";
const detailInclude = {
  supplier: true,
  unit: true,
  category: true,
  paymentTerm: true,
  items: { include: { benefit: true }, orderBy: { code: "asc" as const } },
};
const finalStatuses = ["ENCERRADO", "CANCELADO"];
export async function code(
  tx: Prisma.TransactionClient,
  kind: string,
  prefix: string,
) {
  const n = await tx.contractSequence.upsert({
    where: { kind },
    create: { kind, value: 1 },
    update: { value: { increment: 1 } },
  });
  return prefix + String(n.value).padStart(5, "0");
}
async function parent(
  tx: Prisma.TransactionClient,
  id: string,
  version?: number,
) {
  const c = await tx.contract.findUniqueOrThrow({
    where: { id },
    include: detailInclude,
  });
  await tx.$queryRaw`SELECT id FROM "Contract" WHERE id=${id} FOR UPDATE`;
  if (version !== undefined)
    ensure(
      c.version === version,
      "Contrato alterado por outra operação. Atualize a tela antes de salvar.",
    );
  return c;
}
export async function reconcileContract(
  tx: Prisma.TransactionClient,
  id: string,
  asOf = today(),
) {
  const c = await tx.contract.findUniqueOrThrow({
    where: { id },
    include: detailInclude,
  });
  if (!["ELABORACAO", "VIGENTE"].includes(c.status)) return 0;
  await tx.$queryRaw`SELECT id FROM "Contract" WHERE id=${id} FOR UPDATE`;
  const months =
    c.kind === "EVENTUAL" ? [] : forecastMonths(c.start, c.end, asOf);
  const items = c.items.filter((i) => i.active);
  const amount = contractTotal(items);
  let changes = 0;
  const existing = await tx.contractForecast.findMany({
    where: { contractId: id },
  });
  const used = await tx.measurement.findMany({
    where: { contractId: id, status: { not: "CANCELADA" } },
    select: { forecastId: true, month: true },
  });
  const usedMonths = new Set(used.map((m) => iso(m.month)));
  const valid = new Set(months.map(iso));
  for (const old of existing) {
    if (
      old.status === "PREVISTA" &&
      !usedMonths.has(iso(old.month)) &&
      (!valid.has(iso(old.month)) || !items.length)
    ) {
      await tx.contractForecast.update({
        where: { id: old.id },
        data: {
          status: "CANCELADA",
          reason:
            "Previsão fora da vigência ou sem itens ativos após alteração em elaboração.",
        },
      });
      changes++;
    }
  }
  if (!items.length) return changes;
  const snapshot: Prisma.InputJsonValue = {
    contract: {
      code: c.code,
      name: c.name,
      externalNumber: c.externalNumber,
      supplierId: c.supplierId,
      supplierName: c.supplier.name,
      unitId: c.unitId,
      unitName: c.unit.name,
      categoryId: c.categoryId,
      categoryName: c.category.name,
      paymentMode: c.paymentMode,
      paymentDay: c.paymentDay,
      paymentDays: c.paymentDays,
    },
    items: items.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      quantity: i.quantity.toFixed(3),
      unitPrice: i.unitPrice.toFixed(2),
      total: itemTotal(i).toFixed(2),
      billingUnit: i.billingUnit,
      allocationMode: i.allocationMode,
      benefitId: i.benefitId,
      benefitName: i.benefit?.name || null,
    })),
    amount: amount.toFixed(2),
  };
  for (const month of months) {
    if (usedMonths.has(iso(month))) continue;
    const old = existing.find((f) => +f.month === +month);
    if (old?.status === "CANCELADA") continue;
    const due = paymentDue(month, c);
    if (old) {
      if (c.activatedAt) continue;
      if (
        !old.amount.equals(amount) ||
        +old.due !== +due ||
        JSON.stringify(old.snapshot) !== JSON.stringify(snapshot)
      ) {
        await tx.contractForecast.update({
          where: { id: old.id },
          data: { amount, due, snapshot },
        });
        changes++;
      }
    } else {
      await tx.contractForecast.create({
        data: {
          code: await code(tx, "forecast", "P"),
          contractId: id,
          month,
          due,
          amount,
          snapshot,
        },
      });
      changes++;
    }
  }
  return changes;
}
export async function reconcileContracts() {
  const ids = await db.contract.findMany({
    where: {
      status: { in: ["ELABORACAO", "VIGENTE"] },
      kind: { not: "EVENTUAL" },
    },
    select: { id: true },
  });
  for (const c of ids) await serial((tx) => reconcileContract(tx, c.id));
}
function dto(c: any) {
  return {
    ...c,
    monthlyReference: contractTotal(c.items).toFixed(2),
    items: c.items.map((i: any) => ({ ...i, total: itemTotal(i).toFixed(2) })),
  };
}
export async function bootstrap() {
  const [
    suppliers,
    categories,
    paymentTerms,
    units,
    benefits,
    contracts,
    forecasts,
    measurements,
    costCenters,
  ] = await Promise.all([
    db.supplier.findMany({
      include: { paymentTerm: true, category: true },
      orderBy: { name: "asc" },
    }),
    db.contractCategory.findMany({ orderBy: { name: "asc" } }),
    db.paymentTerm.findMany({ orderBy: { name: "asc" } }),
    db.unit.findMany({ orderBy: { name: "asc" } }),
    db.benefit.findMany({ orderBy: { name: "asc" } }),
    db.contract.findMany({ include: detailInclude, orderBy: { code: "desc" } }),
    db.contractForecast.findMany({
      include: {
        contract: { include: { supplier: true, unit: true, category: true } },
      },
      orderBy: [{ month: "asc" }, { code: "asc" }],
    }),
    db.measurement.findMany({
      include: {
        supplier: true,
        unit: true,
        category: true,
        contract: true,
        forecast: true,
      },
      orderBy: [{ month: "desc" }, { code: "desc" }],
    }),
    db.costCenter.findMany({
      include: { units: true },
      orderBy: { code: "asc" },
    }),
  ]);
  return {
    suppliers,
    categories,
    paymentTerms,
    units,
    benefits,
    contracts: contracts.map(dto),
    forecasts: forecasts.map((f) => {
      const m = measurements.find(
        (m) =>
          !m.originalId &&
          m.status !== "CANCELADA" &&
          (m.forecastId === f.id ||
            (m.contractId === f.contractId && +m.month === +f.month)),
      );
      return {
        ...f,
        measurementId: m?.id || null,
        measurementStatus: m?.status || null,
      };
    }),
    measurements,
    costCenters,
    businessDate: iso(today()),
  };
}
export async function saveContractResource(
  resource: string,
  body: unknown,
  id: string | undefined,
  userId: string,
) {
  const schemas = {
    suppliers: supplierSchema,
    categories: categorySchema,
    "payment-terms": paymentTermSchema,
    contracts: contractSchema,
    items: itemSchema,
  };
  const schema = schemas[resource as keyof typeof schemas];
  ensure(schema, "Cadastro de contratos não encontrado.");
  const data: any = schema.parse(body);
  return serial(async (tx) => {
    let row: any;
    const save = async (model: any, payload: any) =>
      id
        ? model.update({ where: { id }, data: payload })
        : model.create({ data: payload });
    if (resource === "suppliers") {
      const old = id
        ? await tx.supplier.findUniqueOrThrow({ where: { id } })
        : null;
      if (data.categoryId)
        ensure(
          (
            await tx.contractCategory.findUniqueOrThrow({
              where: { id: data.categoryId },
            })
          ).active || old?.categoryId === data.categoryId,
          "Categoria inativa.",
        );
      if (data.paymentTermId)
        ensure(
          (
            await tx.paymentTerm.findUniqueOrThrow({
              where: { id: data.paymentTermId },
            })
          ).active || old?.paymentTermId === data.paymentTermId,
          "Condição de pagamento inativa.",
        );
      row = await save(tx.supplier, {
        ...data,
        ...(!id ? { code: await code(tx, "supplier", "F") } : {}),
      });
    }
    if (resource === "categories")
      row = await save(tx.contractCategory, {
        ...data,
        ...(!id ? { code: await code(tx, "category", "CAT") } : {}),
      });
    if (resource === "payment-terms") {
      row = await save(tx.paymentTerm, {
        ...data,
        day: data.mode === "FIXO" ? data.day : null,
        days: data.mode === "DIAS" ? data.days : null,
        ...(!id ? { code: await code(tx, "payment", "CP") } : {}),
      });
      if (id) {
        const drafts = await tx.contract.findMany({
          where: { paymentTermId: id, activatedAt: null, status: "ELABORACAO" },
          select: { id: true },
        });
        for (const c of drafts) {
          await tx.contract.update({
            where: { id: c.id },
            data: {
              paymentMode: row.mode,
              paymentDay: row.day,
              paymentDays: row.days,
              version: { increment: 1 },
            },
          });
          await reconcileContract(tx, c.id);
          await audit(
            tx,
            userId,
            "ALTERAR_CONDICAO",
            "contracts.contracts",
            c.id,
            ["paymentMode", "paymentDay", "paymentDays"],
          );
        }
      }
    }
    if (resource === "contracts") {
      const { version, ...input } = data;
      const old = id ? await parent(tx, id, version) : null;
      if (old)
        ensure(version !== undefined, "Atualize o contrato antes de editar.");
      ensure(
        !old || !finalStatuses.includes(old.status),
        "Contrato finalizado não pode ser editado.",
      );
      if (old?.activatedAt) {
        for (const k of [
          "name",
          "externalNumber",
          "supplierId",
          "unitId",
          "categoryId",
          "paymentTermId",
          "start",
          "end",
          "kind",
          "adjustmentDate",
        ]) {
          const prior = (old as any)[k];
          const next = input[k];
          ensure(
            prior instanceof Date ? +prior === +(next || 0) : prior === next,
            "Após ativação, termos e vigência exigem revisão contratual, prevista para a próxima etapa.",
          );
        }
      }
      const [supplier, unit, category, term] = await Promise.all([
        tx.supplier.findUniqueOrThrow({ where: { id: input.supplierId } }),
        tx.unit.findUniqueOrThrow({ where: { id: input.unitId } }),
        tx.contractCategory.findUniqueOrThrow({
          where: { id: input.categoryId },
        }),
        tx.paymentTerm.findUniqueOrThrow({
          where: { id: input.paymentTermId },
        }),
      ]);
      for (const [name, row, key] of [
        ["Fornecedor", supplier, "supplierId"],
        ["Unidade", unit, "unitId"],
        ["Categoria", category, "categoryId"],
        ["Condição de pagamento", term, "paymentTermId"],
      ] as const)
        ensure(
          row.active || (old && (old as any)[key] === row.id),
          name + " inativo(a).",
        );
      const terms = old?.activatedAt
        ? {}
        : {
            paymentMode: term.mode,
            paymentDay: term.day,
            paymentDays: term.days,
          };
      row = await save(tx.contract, {
        ...input,
        ...terms,
        ...(!id
          ? { code: await code(tx, "contract", "C") }
          : { version: { increment: 1 } }),
      });
      await reconcileContract(tx, row.id);
    }
    if (resource === "items") {
      const { version, ...input } = data;
      const c = await parent(tx, input.contractId, version);
      ensure(
        version !== undefined,
        "Atualize o contrato antes de editar seus itens.",
      );
      ensure(
        !c.activatedAt && c.status === "ELABORACAO",
        "Itens só podem ser alterados enquanto o contrato estiver em elaboração.",
      );
      if (id) {
        const prior = await tx.contractItem.findUniqueOrThrow({
          where: { id },
        });
        ensure(
          prior.contractId === c.id,
          "O contrato do item não pode ser alterado.",
        );
      }
      if (input.benefitId)
        ensure(
          (
            await tx.benefit.findUniqueOrThrow({
              where: { id: input.benefitId },
            })
          ).active,
          "Benefício inativo.",
        );
      row = await save(tx.contractItem, {
        ...input,
        ...(!id ? { code: await code(tx, "item", "I") } : {}),
      });
      await tx.contract.update({
        where: { id: c.id },
        data: { version: { increment: 1 } },
      });
      await reconcileContract(tx, c.id);
    }
    ensure(row, "Recurso não encontrado.");
    await audit(
      tx,
      userId,
      id ? "ALTERAR" : "CRIAR",
      "contracts." + resource,
      row.id,
      Object.keys(data),
    );
    return row;
  });
}
export async function changeContractStatus(
  id: string,
  body: unknown,
  userId: string,
) {
  const data = statusSchema.parse(body);
  return serial(async (tx) => {
    const c = await parent(tx, id, data.version);
    ensure(!finalStatuses.includes(c.status), "Contrato já finalizado.");
    ensure(c.status !== data.status, "O contrato já está nessa situação.");
    const transitions: Record<string, string[]> = {
      ELABORACAO: ["VIGENTE", "CANCELADO"],
      VIGENTE: ["SUSPENSO", "ENCERRADO", "CANCELADO"],
      SUSPENSO: ["VIGENTE", "ENCERRADO", "CANCELADO"],
    };
    ensure(
      transitions[c.status]?.includes(data.status),
      "Transição de situação não permitida.",
    );
    if (data.status === "VIGENTE") {
      ensure(
        c.items.some((i) => i.active),
        "Inclua pelo menos um item ativo antes de ativar o contrato.",
      );
      ensure(
        c.supplier.active &&
          c.unit.active &&
          c.category.active &&
          c.paymentTerm.active,
        "Revise fornecedor, unidade, categoria e condição de pagamento antes de ativar.",
      );
      ensure(
        !c.end || c.end >= today(),
        "A vigência já terminou. Revise as datas antes de ativar.",
      );
    }
    const finishing = finalStatuses.includes(data.status);
    if (finishing) {
      ensure(data.reason, "Informe o motivo.");
      ensure(
        data.closedOn &&
          (data.status === "CANCELADO" || data.closedOn >= c.start) &&
          data.closedOn <= today(),
        "Informe uma data até hoje; no encerramento, ela não pode anteceder o início do contrato.",
      );
    }
    const row = await tx.contract.update({
      where: { id },
      data: {
        status: data.status,
        version: { increment: 1 },
        ...(data.status === "VIGENTE" && !c.activatedAt
          ? { activatedAt: new Date() }
          : {}),
        ...(finishing
          ? { closedOn: data.closedOn, closureReason: data.reason }
          : {}),
      },
    });
    if (finishing) {
      const changed = await tx.contractForecast.findMany({
        where: {
          contractId: id,
          status: "PREVISTA",
          ...(data.status === "ENCERRADO"
            ? { month: { gte: monthStart(data.closedOn!) } }
            : {}),
        },
        select: { id: true },
      });
      for (const f of changed) {
        if (
          await tx.measurement.count({
            where: {
              contractId: id,
              month: (
                await tx.contractForecast.findUniqueOrThrow({
                  where: { id: f.id },
                })
              ).month,
              status: { not: "CANCELADA" },
            },
          })
        )
          continue;
        await tx.contractForecast.update({
          where: { id: f.id },
          data: { status: "CANCELADA", reason: data.reason },
        });
        await audit(tx, userId, "CANCELAR", "contracts.forecasts", f.id, [
          "status",
          "reason",
        ]);
      }
    }
    await reconcileContract(tx, id);
    await audit(tx, userId, "SITUACAO", "contracts.contracts", id, [
      "status",
      "activatedAt",
      "closedOn",
      "closureReason",
    ]);
    return row;
  });
}
export async function cancelForecast(
  id: string,
  reason: string,
  version: number,
  userId: string,
) {
  ensure(reason?.trim(), "Informe o motivo do cancelamento.");
  return serial(async (tx) => {
    const f = await tx.contractForecast.findUniqueOrThrow({ where: { id } });
    const c = await parent(tx, f.contractId, version);
    ensure(!finalStatuses.includes(c.status), "Contrato finalizado.");
    ensure(f.status === "PREVISTA", "Previsão já cancelada.");
    ensure(
      !(await tx.measurement.count({
        where: {
          contractId: c.id,
          month: f.month,
          status: { not: "CANCELADA" },
        },
      })),
      "Previsão já utilizada por medição; trate a medição antes de cancelar.",
    );
    const result = await tx.contractForecast.update({
      where: { id },
      data: { status: "CANCELADA", reason },
    });
    await tx.contract.update({
      where: { id: c.id },
      data: { version: { increment: 1 } },
    });
    await audit(tx, userId, "CANCELAR", "contracts.forecasts", id, [
      "status",
      "reason",
    ]);
    return result;
  });
}
