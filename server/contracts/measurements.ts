import { Prisma } from "@prisma/client";
import { db, serial } from "../db.js";
import { ensure, today, iso, addDays, overlap } from "../domain.js";
import { audit } from "../services.js";
import { code as nextCode } from "./service.js";
import { monthStart, nextMonth, paymentDue, itemTotal } from "./domain.js";
import {
  allocationSummary,
  decimal,
  cents,
} from "../../shared/measurementMath.js";
import {
  newMeasurementSchema,
  editMeasurementSchema,
  measurementActionSchema,
} from "./measurementValidation.js";
const includes = {
  contract: true,
  forecast: true,
  original: { select: { id: true, code: true, status: true } },
  supplier: true,
  unit: true,
  category: true,
  lines: { orderBy: { id: "asc" as const } },
  history: {
    include: { author: { select: { username: true } } },
    orderBy: { at: "desc" as const },
  },
};
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
function snapshot(m: any) {
  return json({ ...m, history: undefined, complements: undefined });
}
function summary(m: any) {
  return allocationSummary(
    m.mode,
    m.amount.toFixed(2),
    m.lines.map((l: any) => ({
      ...l,
      amount: l.amount.toFixed(2),
      percent: l.percent.toFixed(2),
    })),
  );
}
export async function measurementDetail(id: string) {
  const m = await db.measurement.findUniqueOrThrow({
    where: { id },
    include: includes,
  });
  return {
    ...m,
    summary: summary(m),
    warnings: (m.sourceSnapshot as any).warnings || [],
  };
}
async function locked(
  tx: Prisma.TransactionClient,
  id: string,
  version: number,
) {
  await tx.$queryRaw`SELECT id FROM "Measurement" WHERE id=${id} FOR UPDATE`;
  const m = await tx.measurement.findUniqueOrThrow({
    where: { id },
    include: includes,
  });
  ensure(
    m.version === version,
    "Medição alterada por outra operação. Atualize a tela antes de continuar.",
  );
  return m;
}
export async function createMeasurement(body: unknown, userId: string) {
  const input = newMeasurementSchema.parse(body);
  return serial(async (tx) => {
    let contract = input.contractId
      ? await tx.contract.findUniqueOrThrow({
          where: { id: input.contractId },
          include: {
            supplier: true,
            unit: true,
            category: true,
            items: { where: { active: true }, include: { benefit: true } },
          },
        })
      : null;
    if (contract) {
      await tx.$queryRaw`SELECT id FROM "Contract" WHERE id=${contract.id} FOR UPDATE`;
      ensure(
        contract.status === "VIGENTE",
        "Novas medições exigem contrato vigente.",
      );
      ensure(
        input.month >= monthStart(contract.start) &&
          (!contract.end || input.month <= monthStart(contract.end)),
        "Competência fora da vigência do contrato.",
      );
    }
    const original = input.originalId
      ? await tx.measurement.findUniqueOrThrow({
          where: { id: input.originalId },
        })
      : null;
    if (original) {
      await tx.$queryRaw`SELECT id FROM "Measurement" WHERE id=${original.id} FOR UPDATE`;
      ensure(
        !original.originalId &&
          original.status !== "CANCELADA" &&
          original.contractId === (contract?.id || null) &&
          +original.month === +input.month,
        "Medição original incompatível com o complemento.",
      );
    }
    if (contract && !original)
      ensure(
        !(await tx.measurement.findFirst({
          where: {
            contractId: contract.id,
            month: input.month,
            originalId: null,
            status: { not: "CANCELADA" },
          },
        })),
        "Já existe medição principal nesta competência. Use um complemento.",
      );
    let forecast = input.forecastId
      ? await tx.contractForecast.findUniqueOrThrow({
          where: { id: input.forecastId },
        })
      : contract && !original
        ? await tx.contractForecast.findUnique({
            where: {
              contractId_month: { contractId: contract.id, month: input.month },
            },
          })
        : null;
    if (forecast)
      ensure(
        forecast.contractId === contract?.id &&
          +forecast.month === +input.month &&
          forecast.status !== "CANCELADA",
        "Previsão incompatível ou cancelada.",
      );
    const supplierId =
        contract?.supplierId || original?.supplierId || input.supplierId,
      unitId = contract?.unitId || original?.unitId || input.unitId,
      categoryId =
        contract?.categoryId || original?.categoryId || input.categoryId;
    ensure(
      supplierId && unitId && categoryId,
      "Informe fornecedor, unidade faturada e categoria.",
    );
    const [supplier, unit, category] = await Promise.all([
      tx.supplier.findUniqueOrThrow({ where: { id: supplierId } }),
      tx.unit.findUniqueOrThrow({ where: { id: unitId } }),
      tx.contractCategory.findUniqueOrThrow({ where: { id: categoryId } }),
    ]);
    ensure(
      supplier.active && unit.active && category.active,
      "Fornecedor, unidade faturada e categoria devem estar ativos.",
    );
    const warnings: string[] = [];
    const lines: any[] = [];
    const taken = new Set<string>();
    const end = addDays(nextMonth(input.month), -1);
    if (contract && !original) {
      if (input.month < monthStart(today()))
        warnings.push(
          "Competência histórica: confira documentos, plano e valores da época; o cadastro atual não reconstrói alterações anteriores à primeira medição.",
        );
      for (const item of contract.items.filter(
        (i) => i.allocationMode === "PESSOAS",
      )) {
        ensure(
          item.benefitId && item.benefit,
          "Item por pessoas sem benefício associado.",
        );
        const enrollments = await tx.enrollment.findMany({
          where: {
            benefitId: item.benefitId,
            start: { lte: end },
            OR: [{ end: null }, { end: { gte: input.month } }],
            employment: {
              admission: { lte: end },
              OR: [
                { termination: null },
                { termination: { gte: input.month } },
              ],
            },
          },
          include: {
            dependent: true,
            employment: {
              include: {
                person: true,
                unit: true,
                costCenter: true,
                assignments: {
                  include: { unit: true, costCenter: true },
                  orderBy: { effective: "desc" },
                },
                leaves: true,
              },
            },
          },
          orderBy: { start: "desc" },
        });
        if (!enrollments.length)
          warnings.push(`Sem coberturas no mês para o item ${item.name}.`);
        for (const enrollment of enrollments) {
          const e = enrollment.employment;
          const key =
            item.benefitId +
            "|" +
            e.personId +
            "|" +
            (enrollment.dependentId || "titular");
          if (taken.has(key)) {
            warnings.push(
              `Cobertura repetida de ${e.person.name} no mês; mantida uma linha, revise readmissão ou itens duplicados.`,
            );
            continue;
          }
          const from = new Date(
            Math.max(+input.month, +enrollment.start, +e.admission),
          );
          const until = new Date(
            Math.min(
              +end,
              enrollment.end ? +enrollment.end : Infinity,
              e.termination ? +e.termination : Infinity,
            ),
          );
          const leaves = e.leaves.filter((l) =>
            overlap(from, until, l.start, l.actualEnd || l.expectedEnd),
          );
          if (
            ["VR", "VA"].includes(item.benefit.kind) &&
            leaves.some(
              (l) =>
                l.start <= from &&
                (!(l.actualEnd || l.expectedEnd) ||
                  (l.actualEnd || l.expectedEnd)! >= until),
            )
          ) {
            warnings.push(
              `VR/VA de ${e.person.name} omitido: afastamento cobre todo o intervalo de cobertura no mês.`,
            );
            taken.add(key);
            continue;
          }
          if (leaves.length && ["VR", "VA"].includes(item.benefit.kind))
            warnings.push(
              `Afastamento parcial de ${e.person.name}: confira VR/VA sem proporcionalidade automática.`,
            );
          if (+from > +input.month || +until < +end)
            warnings.push(
              `Vínculo ou cobertura parcial de ${e.person.name}: valor mensal integral sugerido para revisão.`,
            );
          if (e.status === "INATIVO" || (!enrollment.active && !enrollment.end))
            warnings.push(
              `Cadastro inativo de ${e.person.name}: conferir a cobertura nesta competência.`,
            );
          const assignment = e.assignments.find((a) => a.effective <= from);
          const location = assignment || e;
          if (!assignment)
            warnings.push(
              `Sem lotação histórica inicial de ${e.person.name}; conferir a lotação sugerida.`,
            );
          if (
            e.assignments.some(
              (a) => a.effective > from && a.effective <= until,
            )
          )
            warnings.push(
              `Mudança de lotação de ${e.person.name} no mês: conferir a distribuição.`,
            );
          if (enrollment.companyCost === null)
            warnings.push(
              `Sem custo individual em ${item.benefit.name}: aplicado o valor unitário do item para conferência.`,
            );
          const reference = enrollment.companyCost ?? item.unitPrice;
          lines.push({
            kind: "PESSOA",
            unitId: location.unitId,
            costCenterId: location.costCenterId,
            unitName: location.unit.name,
            costCenterName: location.costCenter.name,
            costCenterCode: location.costCenter.code,
            employmentId: e.id,
            dependentId: enrollment.dependentId,
            enrollmentId: enrollment.id,
            itemId: item.id,
            employeeName: e.person.name,
            coveredName: enrollment.dependent?.name || e.person.name,
            plan: enrollment.plan,
            reference,
            amount: reference,
            percent: "0",
            reason: null,
          });
          taken.add(key);
        }
      }
    }
    const amount = new Prisma.Decimal(input.amount);
    const due =
      input.due ||
      forecast?.due ||
      (contract ? paymentDue(input.month, contract) : input.issue);
    ensure(due >= input.issue, "Vencimento anterior à emissão.");
    const mode = input.mode || (lines.length ? "PESSOAS" : "VALOR");
    const source: Prisma.InputJsonValue = {
      warnings: [...new Set(warnings)],
      supplierName: supplier.name,
      unitName: unit.name,
      categoryName: category.name,
      contractName: contract?.name || "Despesa avulsa",
      contractCode: contract?.code || null,
      contractVersion: contract?.version || null,
      forecastAmount: forecast?.amount.toFixed(2) || null,
      items:
        contract?.items.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity.toFixed(3),
          unitPrice: i.unitPrice.toFixed(2),
          total: itemTotal(i).toFixed(2),
          benefitId: i.benefitId,
        })) || [],
      coverageCount: lines.length,
    };
    const m = await tx.measurement.create({
      data: {
        code: await nextCode(tx, "measurement", "M"),
        contractId: contract?.id || null,
        forecastId: forecast?.id || null,
        originalId: original?.id || null,
        supplierId,
        unitId,
        categoryId,
        month: input.month,
        invoice: input.invoice,
        issue: input.issue,
        due,
        amount,
        mode,
        notes: input.notes,
        sourceSnapshot: source,
        changedBy: userId,
        lines: { create: lines },
      },
    });
    await audit(
      tx,
      userId,
      "CRIAR",
      "contracts.measurements",
      m.id,
      Object.keys(input),
    );
    return m;
  });
}
export async function editMeasurement(
  id: string,
  body: unknown,
  userId: string,
) {
  const input = editMeasurementSchema.parse(body);
  return serial(async (tx) => {
    const m = await locked(tx, id, input.version);
    ensure(m.status === "PREENCHIMENTO", "Reabra a medição antes de alterar.");
    ensure(input.due >= input.issue, "Vencimento anterior à emissão.");
    const retained = new Set<string>(),
      centerKeys = new Set<string>();
    for (const line of input.lines) {
      ensure(!line.id || !retained.has(line.id), "Linha duplicada.");
      if (line.id) retained.add(line.id);
      const old = line.id ? m.lines.find((l) => l.id === line.id) : null;
      ensure(!line.id || old, "Linha não pertence à medição.");
      if (line.kind !== "AJUSTE")
        ensure(
          cents(line.amount) >= 0n,
          "Valor da linha não pode ser negativo.",
        );
      else ensure(line.reason?.trim(), "Justifique o ajuste/desconto.");
      if (line.kind === "PESSOA")
        ensure(
          old?.kind === "PESSOA" &&
            old.unitId === line.unitId &&
            old.costCenterId === line.costCenterId,
          "Pessoa e lotação histórica não podem ser substituídas; ajuste a distribuição ou registre ajuste explícito.",
        );
      if (old)
        ensure(
          old.kind === line.kind,
          "O tipo de uma linha existente não pode mudar.",
        );
      if (line.kind === "CENTRO") {
        const key = line.unitId + "|" + line.costCenterId;
        ensure(
          !centerKeys.has(key),
          "Unidade/centro repetido na distribuição.",
        );
        centerKeys.add(key);
      }
      const same =
        old?.unitId === line.unitId && old?.costCenterId === line.costCenterId;
      let location = {
        unitName: old?.unitName || "",
        costCenterName: old?.costCenterName || "",
        costCenterCode: old?.costCenterCode || "",
      };
      if (!same) {
        const cc = await tx.costCenter.findUniqueOrThrow({
            where: { id: line.costCenterId },
          }),
          unit = await tx.unit.findUniqueOrThrow({
            where: { id: line.unitId },
          });
        ensure(cc.active && unit.active, "Selecione unidade e centro ativos.");
        ensure(
          await tx.costCenterUnit.findUnique({
            where: {
              costCenterId_unitId: { costCenterId: cc.id, unitId: unit.id },
            },
          }),
          "Centro não habilitado para a unidade.",
        );
        location = {
          unitName: unit.name,
          costCenterName: cc.name,
          costCenterCode: cc.code,
        };
      }
      const { id: lineId, ...values } = line;
      if (old)
        await tx.measurementLine.update({
          where: { id: old.id },
          data: { ...values, ...location },
        });
      else
        await tx.measurementLine.create({
          data: { ...values, ...location, reference: "0", measurementId: m.id },
        });
    }
    await tx.measurementLine.deleteMany({
      where: {
        measurementId: m.id,
        id: { in: m.lines.filter((l) => !retained.has(l.id)).map((l) => l.id) },
      },
    });
    const { version, lines, ...changes } = input;
    const result = await tx.measurement.update({
      where: { id },
      data: { ...changes, version: { increment: 1 }, changedBy: userId },
    });
    await audit(
      tx,
      userId,
      "ALTERAR",
      "contracts.measurements",
      id,
      Object.keys(changes).concat("lines"),
    );
    return result;
  });
}
export async function measurementAction(
  id: string,
  body: unknown,
  userId: string,
) {
  const input = measurementActionSchema.parse(body);
  return serial(async (tx) => {
    const m = await locked(tx, id, input.version);
    const data: any = { version: { increment: 1 }, changedBy: userId };
    if (input.action === "CONFERIR") {
      ensure(
        m.status === "PREENCHIMENTO",
        "A medição não está em preenchimento.",
      );
      ensure(
        m.invoice?.trim() && m.amount.greaterThan(0),
        "Informe referência da fatura e valor positivo.",
      );
      const s = summary(m);
      ensure(
        s.difference === "0.00",
        "A distribuição apresenta diferença de R$ " + s.difference + ".",
      );
      ensure(
        m.mode !== "PERCENTUAL" || s.percentTotal === "100.00",
        "Os percentuais devem somar 100%.",
      );
      ensure(
        !s.negativeBase && !s.hasNegative && s.rows.length,
        "O custo final dos centros não pode ser negativo e a distribuição não pode ficar vazia.",
      );
      const source = m.sourceSnapshot as any;
      ensure(
        !source.warnings?.length || m.reviewConfirmed,
        "Confirme a revisão dos alertas da base.",
      );
      if (m.forecast) {
        ensure(
          m.forecast.amount.equals(m.amount) || m.varianceConfirmed,
          "Confirme a diferença entre previsto e faturado.",
        );
      }
      const duplicate = m.invoice
        ? await tx.measurement.findFirst({
            where: {
              id: { not: id },
              supplierId: m.supplierId,
              unitId: m.unitId,
              invoice: { equals: m.invoice, mode: "insensitive" },
              status: { not: "CANCELADA" },
              originalId: null,
            },
          })
        : null;
      ensure(
        m.originalId || !duplicate,
        "Outra medição principal já usa essa referência de fatura para fornecedor/unidade.",
      );
      data.status = "CONFERIDA";
      data.confirmedAt = new Date();
      data.confirmedSnapshot = json({
        measurement: snapshot(m),
        summary: s,
        supplierName: source.supplierName,
        unitName: source.unitName,
        categoryName: source.categoryName,
        contractName: source.contractName,
      });
    } else if (input.action === "REABRIR") {
      ensure(
        m.status === "CONFERIDA" && input.reason,
        "Informe motivo para reabrir uma medição conferida.",
      );
      data.status = "PREENCHIMENTO";
      data.confirmedSnapshot = Prisma.DbNull;
      data.confirmedAt = null;
      data.reviewConfirmed = false;
      data.varianceConfirmed = false;
    } else {
      ensure(
        m.status === "PREENCHIMENTO" && input.reason,
        "Somente medição em preenchimento pode ser cancelada, com motivo.",
      );
      ensure(
        !(await tx.measurement.count({
          where: { originalId: m.id, status: { not: "CANCELADA" } },
        })),
        "Cancele os complementos antes de cancelar a principal.",
      );
      data.status = "CANCELADA";
    }
    await tx.measurementHistory.create({
      data: {
        measurementId: id,
        action: input.action,
        reason: input.reason || "Conferência administrativa da distribuição.",
        snapshot: snapshot(m),
        authorId: userId,
      },
    });
    const result = await tx.measurement.update({ where: { id }, data });
    await audit(tx, userId, input.action, "contracts.measurements", id, [
      "status",
      "version",
      "confirmedSnapshot",
    ]);
    return result;
  });
}
