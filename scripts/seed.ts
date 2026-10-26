import { db } from "../server/db.js";
// Optional, explicit fictitious data. Refuses to run against an existing workforce.
if (process.env.CONFIRM_DEMO !== "SIM")
  throw new Error(
    "Demonstração opcional: defina CONFIRM_DEMO=SIM e use um banco separado.",
  );
try {
  await db.$transaction(async (tx) => {
    if ((await tx.person.count()) || (await tx.employment.count()))
      throw new Error(
        "O banco já contém pessoas. Seed cancelado para preservar dados.",
      );
    const unit = await tx.unit.upsert({
      where: { code: "DEMO" },
      update: {},
      create: {
        code: "DEMO",
        name: "Unidade fictícia — demonstração",
        kind: "FILIAL",
      },
    });
    const cc = await tx.costCenter.upsert({
      where: { code: "DEMO" },
      update: {},
      create: {
        code: "DEMO",
        name: "Centro fictício — demonstração",
        units: { create: { unitId: unit.id } },
      },
    });
    const dept = await tx.lookup.upsert({
      where: { kind_name: { kind: "DEPARTAMENTO", name: "Equipe fictícia" } },
      update: {},
      create: { kind: "DEPARTAMENTO", name: "Equipe fictícia" },
    });
    const job = await tx.lookup.upsert({
      where: { kind_name: { kind: "CARGO", name: "Cargo demonstrativo" } },
      update: {},
      create: { kind: "CARGO", name: "Cargo demonstrativo" },
    });
    const person = await tx.person.create({
      data: {
        name: "Pessoa Fictícia — Demonstração",
        cpf: "52998224725",
        birthDate: new Date("1990-05-20T00:00:00Z"),
        notes: "DADOS SINTÉTICOS. Não representa pessoa real.",
      },
    });
    const e = await tx.employment.create({
      data: {
        personId: person.id,
        registration: "DEMO-001",
        unitId: unit.id,
        costCenterId: cc.id,
        departmentId: dept.id,
        jobId: job.id,
        admission: new Date("2025-03-10T00:00:00Z"),
      },
    });
    await tx.assignment.create({
      data: {
        employmentId: e.id,
        effective: e.admission,
        unitId: unit.id,
        costCenterId: cc.id,
        departmentId: dept.id,
        jobId: job.id,
        reason: "Demonstração fictícia",
      },
    });
  });
  console.log(
    "Demonstração criada. Inicie o servidor para reconciliar férias.",
  );
} finally {
  await db.$disconnect();
}
