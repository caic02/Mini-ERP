import type { Prisma } from "@prisma/client";
import { db, serial, employeeInclude } from "./db.js";
import {
  ensure,
  today,
  expectedPeriods,
  overlap,
  addDays,
  balance,
  validateSplit,
  reservedStatuses,
  RuleError,
  automaticVacationStatus,
} from "./domain.js";
import * as v from "./validation.js";
export async function audit(
  tx: Prisma.TransactionClient,
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  fields: string[],
) {
  await tx.audit.create({ data: { userId, action, entity, entityId, fields } });
}
export async function reconcile(tx: Prisma.TransactionClient, id: string) {
  const e = await tx.employment.findUniqueOrThrow({ where: { id } });
  if (e.kind !== "CLT") return;
  const company = await tx.company.findUniqueOrThrow({
    where: { id: "middleby" },
  });
  for (const p of expectedPeriods(
    e.admission,
    today(),
    e.termination,
    company.targetMonths,
  )) {
    const existing = await tx.vacationPeriod.findMany({
      where: { employmentId: id, start: { lte: p.end }, end: { gte: p.start } },
    });
    if (existing.some((x) => +x.start === +p.start)) continue;
    if (existing.length) {
      await tx.vacationPeriod.updateMany({
        where: { id: { in: existing.map((x) => x.id) } },
        data: { review: true },
      });
      continue;
    }
    await tx.vacationPeriod.create({ data: { employmentId: id, ...p } });
  }
}
export async function reconcileAll() {
  await serial((tx) => advanceVacationStatuses(tx));
  const ids = await db.employment.findMany({
    select: { id: true },
    where: { kind: "CLT" },
  });
  for (const e of ids) await serial((tx) => reconcile(tx, e.id));
}
export async function advanceVacationStatuses(
  tx: Prisma.TransactionClient,
  asOf = today(),
  bookingId?: string,
) {
  const candidates = await tx.vacationBooking.findMany({
    where: {
      status: { in: reservedStatuses },
      start: { lte: asOf },
      ...(bookingId ? { id: bookingId } : {}),
    },
    orderBy: [{ periodId: "asc" }, { id: "asc" }],
  });
  let changes = 0;
  for (const booking of candidates) {
    const status = automaticVacationStatus(
      booking.status,
      booking.start,
      booking.end,
      asOf,
    );
    if (status === booking.status) continue;
    await tx.$queryRaw`SELECT id FROM "VacationPeriod" WHERE id = ${booking.periodId} FOR UPDATE`;
    const system = await tx.user.upsert({
      where: { id: "system-vacation-automation" },
      update: {},
      create: {
        id: "system-vacation-automation",
        username: "sistema.ferias",
        passwordHash: "!",
        role: "CONSULTA",
        active: false,
      },
    });
    ensure(
      !system.active && system.username === "sistema.ferias",
      "Conta técnica de férias inválida.",
    );
    const updated = await tx.vacationBooking.updateMany({
      where: { id: booking.id, status: booking.status },
      data: { status, changedBy: system.id },
    });
    if (updated.count) {
      await audit(
        tx,
        system.id,
        status === "CONCLUIDA"
          ? "CONCLUIR_AUTOMATICAMENTE"
          : "INICIAR_AUTOMATICAMENTE",
        "bookings",
        booking.id,
        ["status", "changedBy"],
      );
      changes++;
    }
  }
  return changes;
}
async function lookup(
  tx: Prisma.TransactionClient,
  id: string,
  kind: string,
  active = true,
) {
  const row = await tx.lookup.findUniqueOrThrow({ where: { id } });
  ensure(
    row.kind === kind && (!active || row.active),
    "Cadastro incompatível ou inativo.",
  );
  return row;
}
async function employment(tx: Prisma.TransactionClient, id: string) {
  return tx.employment.findUniqueOrThrow({ where: { id } });
}
export const resources = {
  company: { schema: null },
  units: { schema: v.unitSchema },
  "cost-centers": { schema: v.costSchema },
  lookups: { schema: v.lookupSchema },
  people: { schema: v.personSchema },
  employments: { schema: v.employmentSchema },
  dependents: { schema: v.dependentSchema },
  benefits: { schema: v.benefitSchema },
  enrollments: { schema: v.enrollmentSchema },
  leaves: { schema: v.leaveSchema },
  periods: { schema: v.periodSchema },
  bookings: { schema: v.bookingSchema },
  adjustments: { schema: v.adjustmentSchema },
};
export async function saveResource(
  resource: string,
  body: unknown,
  id: string | undefined,
  userId: string,
) {
  const config = resources[resource as keyof typeof resources];
  ensure(config?.schema, "Cadastro não encontrado.");
  const data: any = config.schema.parse(body);
  return serial(async (tx) => {
    let result: any;
    const save = async (model: any, d: any) =>
      id ? model.update({ where: { id }, data: d }) : model.create({ data: d });
    if (resource === "units") result = await save(tx.unit, data);
    if (resource === "cost-centers") {
      const { unitIds, ...rest } = data;
      ensure(
        (await tx.unit.count({
          where: { id: { in: unitIds }, active: true },
        })) === unitIds.length,
        "Selecione unidades ativas e distintas.",
      );
      if (id) {
        const assigned = await tx.employment.findMany({
          where: { costCenterId: id, status: { in: ["ATIVO", "INATIVO"] } },
        });
        ensure(
          assigned.every((e) => unitIds.includes(e.unitId)),
          "A unidade ainda é utilizada por vínculos deste centro.",
        );
        await tx.costCenterUnit.deleteMany({ where: { costCenterId: id } });
      }
      result = await save(tx.costCenter, {
        ...rest,
        units: { create: unitIds.map((unitId: string) => ({ unitId })) },
      });
    }
    if (resource === "lookups") {
      if (id) {
        const old = await tx.lookup.findUniqueOrThrow({ where: { id } });
        ensure(
          old.kind === data.kind && old.tag === data.tag,
          "Categoria e identificador não podem ser alterados.",
        );
      }
      result = await save(tx.lookup, data);
    }
    if (resource === "people") {
      ensure(data.birthDate <= today(), "Nascimento não pode ser futuro.");
      result = await save(tx.person, data);
    }
    if (resource === "employments") {
      const { effective, changeReason, ...rest } = data;
      const old = id ? await employment(tx, id) : null;
      ensure(
        !rest.termination || rest.termination >= rest.admission,
        "Desligamento anterior à admissão.",
      );
      ensure(
        rest.status !== "DESLIGADO" || rest.termination,
        "Informe a data de desligamento.",
      );
      ensure(
        rest.status === "DESLIGADO" || !rest.termination,
        "Data de desligamento exige situação desligado.",
      );
      ensure(
        rest.status !== "DESLIGADO" || rest.termination <= today(),
        "Registre desligamentos efetivos; data futura não aceita nesta versão.",
      );
      await lookup(
        tx,
        rest.departmentId,
        "DEPARTAMENTO",
        !old || old.departmentId !== rest.departmentId,
      );
      await lookup(tx, rest.jobId, "CARGO", !old || old.jobId !== rest.jobId);
      ensure(
        (old && old.unitId === rest.unitId) ||
          (await tx.unit.findUniqueOrThrow({ where: { id: rest.unitId } }))
            .active,
        "Unidade inativa.",
      );
      ensure(
        (old && old.costCenterId === rest.costCenterId) ||
          (
            await tx.costCenter.findUniqueOrThrow({
              where: { id: rest.costCenterId },
            })
          ).active,
        "Centro inativo.",
      );
      ensure(
        await tx.costCenterUnit.findUnique({
          where: {
            costCenterId_unitId: {
              costCenterId: rest.costCenterId,
              unitId: rest.unitId,
            },
          },
        }),
        "Centro de custos não habilitado para a unidade.",
      );
      const person = await tx.person.findUniqueOrThrow({
        where: { id: rest.personId },
      });
      ensure(
        old || !person.archived,
        "Pessoa arquivada. Reative antes de vincular.",
      );
      const siblings = await tx.employment.findMany({
        where: { personId: rest.personId, ...(id ? { id: { not: id } } : {}) },
      });
      ensure(
        !siblings.some((e) =>
          overlap(rest.admission, rest.termination, e.admission, e.termination),
        ),
        "Vínculos da mesma pessoa não podem ter intervalos sobrepostos.",
      );
      if (rest.managerId) {
        ensure(
          rest.managerId !== id,
          "O vínculo não pode ser seu próprio gestor.",
        );
        await employment(tx, rest.managerId);
      }
      if (old) {
        ensure(
          old.personId === rest.personId &&
            +old.admission === +rest.admission &&
            old.kind === rest.kind,
          "Pessoa, admissão e tipo são imutáveis. Cadastre readmissão como novo vínculo.",
        );
        if (rest.termination) {
          const booked = await tx.vacationBooking.count({
            where: {
              period: { employmentId: id },
              status: { in: ["APROVADA", "EM_ANDAMENTO", "CONCLUIDA"] },
              end: { gt: rest.termination },
            },
          });
          ensure(
            !booked,
            "Revise férias posteriores ao desligamento antes de encerrar.",
          );
        }
      }
      const changed =
        !old ||
        ["unitId", "costCenterId", "departmentId", "jobId"].some(
          (k) => (old as any)[k] !== rest[k],
        );
      if (old && changed) {
        ensure(
          effective && effective >= rest.admission && effective <= today(),
          "Informe vigência entre admissão e hoje.",
        );
        ensure(changeReason, "Justifique a mudança profissional.");
        const latest = await tx.assignment.findFirst({
          where: { employmentId: id },
          orderBy: { effective: "desc" },
        });
        ensure(
          !latest || effective > latest.effective,
          "A vigência deve ser posterior ao último histórico.",
        );
      }
      result = await save(tx.employment, rest);
      if (changed)
        await tx.assignment.create({
          data: {
            employmentId: result.id,
            effective: old ? effective : rest.admission,
            unitId: rest.unitId,
            costCenterId: rest.costCenterId,
            departmentId: rest.departmentId,
            jobId: rest.jobId,
            reason: changeReason || "Admissão",
          },
        });
      if (rest.termination) {
        const future = await tx.vacationPeriod.findMany({
          where: { employmentId: result.id, start: { gt: rest.termination } },
          include: { bookings: true, adjustments: true },
        });
        for (const p of future) {
          ensure(
            !p.bookings.length && !p.adjustments.length,
            "Há histórico em período posterior ao desligamento. Revise com o RH.",
          );
          await tx.vacationPeriod.delete({ where: { id: p.id } });
        }
      }
      await reconcile(tx, result.id);
    }
    if (resource === "dependents") {
      const rel = await lookup(tx, data.relationshipId, "PARENTESCO");
      ensure(
        rel.tag !== "OUTRO" || data.relationshipDescription,
        "Descreva o parentesco Outro.",
      );
      ensure(data.birthDate <= today(), "Nascimento não pode ser futuro.");
      if (id)
        ensure(
          (await tx.dependent.findUniqueOrThrow({ where: { id } })).personId ===
            data.personId,
          "O titular do dependente não pode ser alterado.",
        );
      result = await save(tx.dependent, data);
    }
    if (resource === "benefits") result = await save(tx.benefit, data);
    if (resource === "enrollments") {
      ensure(
        !data.end || data.end >= data.start,
        "Exclusão anterior à inclusão.",
      );
      ensure(
        data.active || data.end,
        "Ao encerrar a inscrição, informe a data de exclusão.",
      );
      const e = await employment(tx, data.employmentId);
      ensure(
        data.start >= e.admission &&
          (!e.termination || data.start <= e.termination),
        "Inclusão fora do vínculo.",
      );
      const benefit = await tx.benefit.findUniqueOrThrow({
        where: { id: data.benefitId },
      });
      ensure(benefit.active, "Benefício inativo.");
      ensure(
        !data.plan || benefit.kind === "SAUDE",
        "Tipo de plano individual é exclusivo do plano de saúde.",
      );
      if (data.dependentId) {
        const dep = await tx.dependent.findUniqueOrThrow({
          where: { id: data.dependentId },
        });
        ensure(
          dep.personId === e.personId && dep.active,
          "Dependente não pertence ao titular ou está inativo.",
        );
      }
      const others = await tx.enrollment.findMany({
        where: {
          benefitId: data.benefitId,
          employment: { personId: e.personId },
          dependentId: data.dependentId,
          ...(id ? { id: { not: id } } : {}),
        },
      });
      ensure(
        !others.some((x) => overlap(data.start, data.end, x.start, x.end)),
        "Inscrição sobreposta no mesmo plano para a pessoa.",
      );
      result = await save(tx.enrollment, data);
    }
    if (resource === "leaves") {
      await lookup(tx, data.typeId, "AFASTAMENTO");
      const e = await employment(tx, data.employmentId);
      ensure(
        data.start >= e.admission &&
          (!e.termination || data.start <= e.termination),
        "Afastamento fora do vínculo.",
      );
      ensure(
        (!data.expectedEnd || data.expectedEnd >= data.start) &&
          (!data.actualEnd || data.actualEnd >= data.start),
        "Fim anterior ao início.",
      );
      result = await save(tx.leave, data);
      await tx.vacationPeriod.updateMany({
        where: { employmentId: data.employmentId, end: { gte: data.start } },
        data: { review: true },
      });
    }
    if (resource === "periods") {
      const e = await employment(tx, data.employmentId);
      ensure(
        e.kind === "CLT",
        "Controle de recesso não disponível para este vínculo.",
      );
      ensure(
        data.start >= e.admission &&
          (!e.termination || data.start <= e.termination),
        "Período fora do vínculo.",
      );
      ensure(
        data.end >= data.start &&
          data.concessionStart > data.end &&
          data.concessionEnd >= data.concessionStart,
        "Limites de período inválidos.",
      );
      const others = await tx.vacationPeriod.findMany({
        where: {
          employmentId: data.employmentId,
          ...(id ? { id: { not: id } } : {}),
        },
      });
      ensure(
        !others.some((p) => overlap(data.start, data.end, p.start, p.end)),
        "Histórico sobreposto a período existente. Edite o período já reconciliado.",
      );
      if (id) {
        const old = await tx.vacationPeriod.findUniqueOrThrow({
          where: { id },
          include: { bookings: true, adjustments: true },
        });
        ensure(
          old.employmentId === data.employmentId && +old.start === +data.start,
          "Vínculo e início do período são imutáveis.",
        );
        const proposed = { ...old, ...data };
        ensure(
          balance(proposed).available >= 0,
          "Alteração reduziria o saldo abaixo de zero.",
        );
      }
      result = await save(tx.vacationPeriod, { ...data, source: "MANUAL" });
    }
    if (resource === "bookings") {
      const p = await tx.vacationPeriod.findUniqueOrThrow({
        where: { id: data.periodId },
        include: { bookings: true, adjustments: true, employment: true },
      });
      // Row lock makes reservation explicitly serialized, also across different application processes.
      await tx.$queryRaw`SELECT id FROM "VacationPeriod" WHERE id = ${p.id} FOR UPDATE`;
      const old = id ? p.bookings.find((b) => b.id === id) : null;
      ensure(!id || old, "Lançamento não pertence ao período.");
      if (old && ["CONCLUIDA", "CANCELADA"].includes(old.status))
        throw new RuleError(
          "Registro finalizado é imutável. Registre ajuste justificado.",
        );
      if (old && reservedStatuses.includes(old.status))
        ensure(
          [...reservedStatuses, "CONCLUIDA", "CANCELADA"].includes(data.status),
          "Reserva só pode continuar, concluir ou cancelar.",
        );
      const end = addDays(data.start, data.days - 1),
        returnDate = addDays(end, 1);
      ensure(
        data.start >= p.employment.admission &&
          (!p.employment.termination || end <= p.employment.termination),
        "Férias fora do vínculo.",
      );
      const consuming = [...reservedStatuses, "CONCLUIDA"].includes(
        data.status,
      );
      if (consuming) {
        ensure(
          data.start >= p.concessionStart,
          "Direito ainda não adquirido na data de início.",
        );
        ensure(
          end <= p.concessionEnd || data.reviewConfirmed,
          "Gozo fora do concessivo exige revisão explícita do RH.",
        );
        ensure(
          data.reviewConfirmed,
          "Aprovação exige revisão de feriados, repousos e exceções pelo RH.",
        );
        ensure(data.consent, "Registre a concordância do colaborador.");
        ensure(
          data.status !== "CONCLUIDA" || end < today(),
          "Gozo só pode ser concluído após a data final.",
        );
        ensure(
          data.status !== "EM_ANDAMENTO" ||
            (data.start <= today() && end >= today()),
          "Em andamento exige intervalo atual.",
        );
        const others = p.bookings.filter(
          (b) =>
            b.id !== id &&
            [...reservedStatuses, "CONCLUIDA"].includes(b.status),
        );
        const proposed = [...others, { status: data.status, days: data.days }];
        const b = balance({ ...p, bookings: proposed });
        ensure(b.available >= 0, "Saldo insuficiente.");
        validateSplit(
          proposed.map((x) => x.days),
          b.entitlement + b.adjustment,
          b.allowance,
        );
        const conflicts = await tx.vacationBooking.count({
          where: {
            id: { not: id || "" },
            period: { employmentId: p.employmentId },
            status: { in: [...reservedStatuses, "CONCLUIDA"] },
            start: { lte: end },
            end: { gte: data.start },
          },
        });
        ensure(!conflicts, "Há férias sobrepostas para este vínculo.");
        const leaves = await tx.leave.findMany({
          where: { employmentId: p.employmentId },
        });
        ensure(
          !leaves.some((l) =>
            overlap(data.start, end, l.start, l.actualEnd || l.expectedEnd),
          ),
          "Há afastamento ou licença sobreposto. Revise os registros.",
        );
      }
      result = await save(tx.vacationBooking, {
        ...data,
        end,
        returnDate,
        changedBy: userId,
      });
      if (
        automaticVacationStatus(result.status, result.start, result.end) !==
        result.status
      ) {
        await advanceVacationStatuses(tx, today(), result.id);
        result = await tx.vacationBooking.findUniqueOrThrow({
          where: { id: result.id },
        });
      }
    }
    if (resource === "adjustments") {
      ensure(
        !id,
        "Ajustes são imutáveis; registre um lançamento compensatório.",
      );
      const p = await tx.vacationPeriod.findUniqueOrThrow({
        where: { id: data.periodId },
        include: { bookings: true, adjustments: true },
      });
      await tx.$queryRaw`SELECT id FROM "VacationPeriod" WHERE id = ${p.id} FOR UPDATE`;
      if (data.kind === "ABONO")
        ensure(data.days > 0, "Abono deve ser positivo.");
      const b = balance({ ...p, adjustments: [...p.adjustments, data] });
      ensure(b.available >= 0, "Ajuste excede saldo.");
      ensure(
        b.allowance <= Math.floor((b.entitlement + b.adjustment) / 3),
        "Abono excede um terço.",
      );
      const consuming = p.bookings.filter((x) =>
        [...reservedStatuses, "CONCLUIDA"].includes(x.status),
      );
      if (consuming.length)
        validateSplit(
          consuming.map((x) => x.days),
          b.entitlement + b.adjustment,
          b.allowance,
        );
      result = await tx.vacationAdjustment.create({
        data: { ...data, authorId: userId },
      });
    }
    ensure(result, "Recurso não encontrado.");
    await audit(
      tx,
      userId,
      id ? "ALTERAR" : "CRIAR",
      resource,
      result.id,
      Object.keys(data),
    );
    return result;
  });
}
export async function listResource(resource: string) {
  switch (resource) {
    case "company":
      return db.company.findUniqueOrThrow({ where: { id: "middleby" } });
    case "units":
      return db.unit.findMany({ orderBy: { name: "asc" } });
    case "cost-centers":
      return db.costCenter.findMany({
        include: { units: true },
        orderBy: { code: "asc" },
      });
    case "lookups":
      return db.lookup.findMany({ orderBy: { name: "asc" } });
    case "people":
      return db.person.findMany({ orderBy: { name: "asc" } });
    case "employments":
      return db.employment.findMany({
        include: employeeInclude,
        orderBy: { registration: "asc" },
      });
    case "dependents":
      return db.dependent.findMany({
        include: { person: true, relationship: true },
        orderBy: { name: "asc" },
      });
    case "benefits":
      return db.benefit.findMany({ orderBy: { name: "asc" } });
    case "enrollments":
      return db.enrollment.findMany({
        include: {
          benefit: true,
          employment: { include: { person: true } },
          dependent: true,
        },
        orderBy: { start: "desc" },
      });
    case "leaves":
      return db.leave.findMany({
        include: { type: true, employment: { include: { person: true } } },
        orderBy: { start: "desc" },
      });
    case "periods":
      return db.vacationPeriod.findMany({
        include: {
          bookings: true,
          adjustments: true,
          employment: {
            include: {
              person: true,
              unit: true,
              costCenter: true,
              department: true,
              manager: { include: { person: true } },
            },
          },
        },
        orderBy: { start: "desc" },
      });
    case "bookings":
      return db.vacationBooking.findMany({
        include: {
          period: { include: { employment: { include: { person: true } } } },
        },
        orderBy: { start: "desc" },
      });
    case "adjustments":
      return db.vacationAdjustment.findMany({ orderBy: { createdAt: "desc" } });
    case "audit":
      return db.audit.findMany({
        include: { user: { select: { username: true } } },
        orderBy: { at: "desc" },
        take: 500,
      });
    default:
      throw new RuleError("Recurso não encontrado.", 404);
  }
}
