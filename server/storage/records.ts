import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

export type Dataset = {
  format: "middleby-records-v1";
  models: Record<string, any[]>;
};
const models = Prisma.dmmf.datamodel.models;
export const modelNames = models.map((m) => m.name);
const metadata = new Map(models.map((m) => [m.name, m]));
const methodName = (name: string) => name[0].toLowerCase() + name.slice(1);
export function storageError(
  code: string,
  message: string,
  meta: Record<string, unknown> = {},
) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: Prisma.prismaVersion.client,
    meta,
  });
}
function copy<T>(value: T): T {
  if (value instanceof Date) return new Date(value) as T;
  if (Prisma.Decimal.isDecimal(value))
    return new Prisma.Decimal(value as any) as T;
  if (value === Prisma.DbNull || value === Prisma.JsonNull) return null as T;
  if (Array.isArray(value)) return value.map(copy) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, copy(v)]),
    ) as T;
  return value;
}
export function emptyDataset(): Dataset {
  return {
    format: "middleby-records-v1",
    models: Object.fromEntries(modelNames.map((name) => [name, []])),
  };
}
export function decodeDataset(raw: string): Dataset {
  const data = JSON.parse(raw) as Dataset;
  if (
    data.format !== "middleby-records-v1" ||
    !data.models ||
    Object.keys(data.models).length !== models.length
  )
    throw new Error("Estrutura de dados incompatível.");
  for (const model of models) {
    if (!Array.isArray(data.models[model.name]))
      throw new Error("Tabela ausente na base: " + model.name);
    for (const row of data.models[model.name])
      for (const field of model.fields) {
        if (row[field.name] == null || field.isList || field.kind === "object")
          continue;
        if (field.type === "DateTime")
          row[field.name] = new Date(row[field.name]);
        if (field.type === "Decimal")
          row[field.name] = new Prisma.Decimal(row[field.name]);
      }
  }
  validateDataset(data);
  return data;
}
function compare(a: any, b: any) {
  if (a == null || b == null) return a == b ? 0 : a == null ? 1 : -1;
  if (Prisma.Decimal.isDecimal(a) || Prisma.Decimal.isDecimal(b))
    return new Prisma.Decimal(a).comparedTo(b);
  if (a instanceof Date || b instanceof Date)
    return Math.sign(+new Date(a) - +new Date(b));
  return a === b ? 0 : a < b ? -1 : 1;
}
function scalar(value: any, rule: any): boolean {
  if (rule === undefined) return true;
  if (
    rule === null ||
    typeof rule !== "object" ||
    rule instanceof Date ||
    Prisma.Decimal.isDecimal(rule) ||
    Array.isArray(rule)
  )
    return compare(value, rule) === 0;
  const insensitive = rule.mode === "insensitive";
  const text = (v: any) =>
    insensitive ? String(v).toLocaleLowerCase("pt-BR") : String(v);
  return Object.entries(rule).every(([key, operand]) => {
    switch (key) {
      case "mode":
        return true;
      case "equals":
        return insensitive && value != null && operand != null
          ? text(value) === text(operand)
          : compare(value, operand) === 0;
      case "not":
        return !scalar(value, operand);
      case "in":
        return (operand as any[]).some((v) => compare(value, v) === 0);
      case "notIn":
        return !(operand as any[]).some((v) => compare(value, v) === 0);
      case "lt":
        return value != null && compare(value, operand) < 0;
      case "lte":
        return value != null && compare(value, operand) <= 0;
      case "gt":
        return value != null && compare(value, operand) > 0;
      case "gte":
        return value != null && compare(value, operand) >= 0;
      case "contains":
        return value != null && text(value).includes(text(operand));
      case "startsWith":
        return value != null && text(value).startsWith(text(operand));
      case "endsWith":
        return value != null && text(value).endsWith(text(operand));
      case "has":
        return (
          Array.isArray(value) && value.some((v) => compare(v, operand) === 0)
        );
      case "isEmpty":
        return Array.isArray(value) && (value.length === 0) === operand;
      default:
        throw new Error("Filtro não suportado pelo modo arquivo: " + key);
    }
  });
}

export function recordSession(data: Dataset) {
  let dirty = false;
  function relation(model: string, row: any, field: any): any[] {
    const target = metadata.get(field.type)!;
    if (field.relationFromFields.length)
      return data.models[target.name].filter((candidate) =>
        field.relationFromFields.every(
          (fk: string, i: number) =>
            row[fk] != null &&
            compare(row[fk], candidate[field.relationToFields[i]]) === 0,
        ),
      );
    const inverse = target.fields.find(
      (f) =>
        f.kind === "object" &&
        f.type === model &&
        f.relationName === field.relationName &&
        f.relationFromFields!.length,
    )!;
    if (!inverse)
      throw new Error("Relação sem metadados: " + model + "." + field.name);
    return data.models[target.name].filter((candidate) =>
      inverse.relationFromFields!.every(
        (fk, i) =>
          compare(candidate[fk], row[inverse.relationToFields![i]]) === 0,
      ),
    );
  }
  function matches(model: string, row: any, where: any = {}): boolean {
    const info = metadata.get(model)!;
    return Object.entries(where).every(([key, rule]: [string, any]) => {
      if (rule === undefined) return true;
      if (key === "AND")
        return (Array.isArray(rule) ? rule : [rule]).every((w) =>
          matches(model, row, w),
        );
      if (key === "OR") return rule.some((w: any) => matches(model, row, w));
      if (key === "NOT")
        return (Array.isArray(rule) ? rule : [rule]).every(
          (w) => !matches(model, row, w),
        );
      const field = info.fields.find((f) => f.name === key);
      if (!field) {
        const compound = [
          ...info.uniqueFields,
          ...(info.primaryKey ? [info.primaryKey.fields] : []),
        ].find((fields) => fields.join("_") === key);
        if (compound) return matches(model, row, rule);
        throw new Error("Campo de filtro desconhecido: " + model + "." + key);
      }
      if (field.kind !== "object") return scalar(row[key], rule);
      const related = relation(model, row, field);
      if (rule === null) return !related.length;
      if ("some" in rule)
        return related.some((r) => matches(field.type, r, rule.some));
      if ("none" in rule)
        return !related.some((r) => matches(field.type, r, rule.none));
      if ("every" in rule)
        return related.every((r) => matches(field.type, r, rule.every));
      if ("is" in rule)
        return rule.is === null
          ? !related.length
          : related.some((r) => matches(field.type, r, rule.is));
      if ("isNot" in rule)
        return rule.isNot === null
          ? !!related.length
          : !related.some((r) => matches(field.type, r, rule.isNot));
      return related.some((r) => matches(field.type, r, rule));
    });
  }
  function ordered(rows: any[], args: any = {}) {
    const order = args.orderBy
      ? Array.isArray(args.orderBy)
        ? args.orderBy
        : [args.orderBy]
      : [];
    let result = [...rows].sort((a, b) => {
      for (const item of order)
        for (const [key, direction] of Object.entries(item)) {
          const c = compare(a[key], b[key]);
          if (c) return direction === "desc" ? -c : c;
        }
      return 0;
    });
    if (args.skip) result = result.slice(args.skip);
    if (args.take != null) result = result.slice(0, args.take);
    return result;
  }
  function project(model: string, row: any, args: any = {}): any {
    if (!row) return null;
    const info = metadata.get(model)!;
    const result: any = args.select ? {} : copy(row);
    for (const [key, selection] of Object.entries(
      args.select || args.include || {},
    )) {
      if (!selection) continue;
      const field = info.fields.find((f) => f.name === key);
      if (!field)
        throw new Error("Campo de projeção desconhecido: " + model + "." + key);
      if (field.kind !== "object") {
        result[key] = copy(row[key]);
        continue;
      }
      const options = selection === true ? {} : (selection as any);
      const rows = ordered(
        relation(model, row, field).filter((r) =>
          matches(field.type, r, options.where),
        ),
        options,
      ).map((r) => project(field.type, r, options));
      result[key] = field.isList ? rows : rows[0] || null;
    }
    return result;
  }
  function create(model: string, input: any): any {
    const info = metadata.get(model)!;
    const row: any = {};
    for (const field of info.fields.filter((f) => f.kind !== "object")) {
      let value = input[field.name];
      if (value === undefined) {
        const d = field.default as any;
        value =
          field.isUpdatedAt || d?.name === "now"
            ? new Date()
            : d?.name === "uuid"
              ? randomUUID()
              : d !== undefined
                ? copy(d)
                : field.isList
                  ? []
                  : null;
      }
      row[field.name] = copy(value);
      if (value != null && field.type === "Decimal" && !field.isList)
        row[field.name] = new Prisma.Decimal(value);
      if (value != null && field.type === "DateTime")
        row[field.name] = new Date(value);
    }
    // Conexoes proprietarias precisam preencher a FK antes da inclusao.
    for (const field of info.fields.filter(
      (f) => f.kind === "object" && f.relationFromFields!.length,
    )) {
      const nested = input[field.name];
      if (!nested) continue;
      const target = nested.connect
        ? data.models[field.type].find((r) =>
            matches(field.type, r, nested.connect),
          )
        : nested.create
          ? create(field.type, nested.create)
          : null;
      if (!target)
        throw storageError("P2025", "Registro vinculado não encontrado.");
      field.relationFromFields!.forEach(
        (fk, i) => (row[fk] = target[field.relationToFields![i]]),
      );
    }
    data.models[model].push(row);
    dirty = true;
    for (const field of info.fields.filter(
      (f) => f.kind === "object" && !f.relationFromFields!.length,
    )) {
      const nested = input[field.name];
      if (!nested) continue;
      const inverse = metadata
        .get(field.type)!
        .fields.find(
          (f) =>
            f.kind === "object" &&
            f.type === model &&
            f.relationName === field.relationName &&
            f.relationFromFields!.length,
        )!;
      const values = nested.create
        ? Array.isArray(nested.create)
          ? nested.create
          : [nested.create]
        : nested.createMany?.data || [];
      for (const item of values)
        create(field.type, {
          ...item,
          ...Object.fromEntries(
            inverse.relationFromFields!.map((fk, i) => [
              fk,
              row[inverse.relationToFields![i]],
            ]),
          ),
        });
    }
    return row;
  }
  function update(model: string, row: any, changes: any) {
    for (const field of metadata.get(model)!.fields.filter(f => f.kind === "object")) {
      const nested = changes[field.name];
      if (!nested) continue;
      if (field.relationFromFields!.length || Object.keys(nested).some(key => key !== "create")) throw new Error("Atualização de relacionamento não suportada pelo modo arquivo.");
      const inverse = metadata.get(field.type)!.fields.find(f => f.kind === "object" && f.type === model && f.relationName === field.relationName && f.relationFromFields!.length)!;
      for (const value of Array.isArray(nested.create) ? nested.create : [nested.create]) create(field.type, { ...value, ...Object.fromEntries(inverse.relationFromFields!.map((fk, i) => [fk, row[inverse.relationToFields![i]]])) });
    }
    for (const field of metadata
      .get(model)!
      .fields.filter((f) => f.kind !== "object")) {
      const value = changes[field.name];
      if (value === undefined) {
        if (field.isUpdatedAt) row[field.name] = new Date();
        continue;
      }
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        !(value instanceof Date) &&
        !Prisma.Decimal.isDecimal(value) &&
        field.type !== "Json"
      ) {
        if ("increment" in value)
          row[field.name] =
            field.type === "Decimal"
              ? new Prisma.Decimal(row[field.name]).plus(value.increment)
              : row[field.name] + value.increment;
        else if ("decrement" in value)
          row[field.name] =
            field.type === "Decimal"
              ? new Prisma.Decimal(row[field.name]).minus(value.decrement)
              : row[field.name] - value.decrement;
        else if ("set" in value) row[field.name] = copy(value.set);
        else throw new Error("Atualização não suportada no modo arquivo.");
      } else row[field.name] = copy(value);
      if (row[field.name] != null && field.type === "Decimal" && !field.isList)
        row[field.name] = new Prisma.Decimal(row[field.name]);
      if (row[field.name] != null && field.type === "DateTime")
        row[field.name] = new Date(row[field.name]);
    }
    dirty = true;
  }
  const client: any = {};
  for (const model of models)
    client[methodName(model.name)] = new Proxy(
      {},
      {
        get:
          (_, method: string) =>
          async (args: any = {}) => {
            const rows = data.models[model.name];
            const found = () =>
              rows.find((r) => matches(model.name, r, args.where));
            const mustFind = () => {
              const row = found();
              if (!row) throw storageError("P2025", "Registro não encontrado.");
              return row;
            };
            switch (method) {
              case "findMany":
                return ordered(
                  rows.filter((r) => matches(model.name, r, args.where)),
                  args,
                ).map((r) => project(model.name, r, args));
              case "findFirst":
                return project(
                  model.name,
                  ordered(
                    rows.filter((r) => matches(model.name, r, args.where)),
                    args,
                  )[0],
                  args,
                );
              case "findUnique":
                return project(model.name, found(), args);
              case "findFirstOrThrow": {
                const r = ordered(
                  rows.filter((r) => matches(model.name, r, args.where)),
                  args,
                )[0];
                if (!r) throw storageError("P2025", "Registro não encontrado.");
                return project(model.name, r, args);
              }
              case "findUniqueOrThrow":
                return project(model.name, mustFind(), args);
              case "count":
                return rows.filter((r) => matches(model.name, r, args.where))
                  .length;
              case "create":
                return project(model.name, create(model.name, args.data), args);
              case "createMany": {
                const values = Array.isArray(args.data)
                  ? args.data
                  : [args.data];
                for (const v of values) create(model.name, v);
                return { count: values.length };
              }
              case "update": {
                const r = mustFind();
                update(model.name, r, args.data);
                return project(model.name, r, args);
              }
              case "updateMany": {
                const rs = rows.filter((r) =>
                  matches(model.name, r, args.where),
                );
                for (const r of rs) update(model.name, r, args.data);
                return { count: rs.length };
              }
              case "upsert": {
                let r = found();
                if (r) update(model.name, r, args.update);
                else r = create(model.name, args.create);
                return project(model.name, r, args);
              }
              case "delete": {
                const r = mustFind();
                data.models[model.name] = rows.filter((item) => item !== r);
                dirty = true;
                return project(model.name, r, args);
              }
              case "deleteMany": {
                const keep = rows.filter(
                  (r) => !matches(model.name, r, args.where),
                );
                data.models[model.name] = keep;
                if (keep.length !== rows.length) dirty = true;
                return { count: rows.length - keep.length };
              }
              case "groupBy": {
                const groups = new Map<string, any>();
                for (const row of rows.filter((r) =>
                  matches(model.name, r, args.where),
                )) {
                  const values = Object.fromEntries(
                    args.by.map((key: string) => [key, copy(row[key])]),
                  );
                  const key = JSON.stringify(values);
                  const current = groups.get(key) || {
                    ...values,
                    _count: { _all: 0 },
                  };
                  current._count._all++;
                  groups.set(key, current);
                }
                return ordered([...groups.values()], args);
              }
              default:
                throw new Error(
                  "Operação não suportada pelo modo arquivo: " + method,
                );
            }
          },
      },
    );
  client.$queryRaw = async (
    strings: TemplateStringsArray,
    ...values: any[]
  ) => {
    const sql = strings.join("?").trim();
    const match =
      /^SELECT id FROM "([A-Za-z]+)" WHERE id\s*=\s*\? FOR UPDATE$/i.exec(sql);
    if (!match || !metadata.has(match[1]))
      throw new Error("Consulta SQL não suportada pelo modo arquivo.");
    // A comparacao de revisao da base serializa a transacao inteira no commit.
    return data.models[match[1]]
      .filter((r) => r.id === values[0])
      .map((r) => ({ id: r.id }));
  };
  client.$executeRaw = async () => {
    throw storageError(
      "P2010",
      "SQL direto não é suportado pelo modo arquivo.",
      { code: "0A000" },
    );
  };
  return {
    client,
    data,
    get dirty() {
      return dirty;
    },
  };
}

export function validateDataset(data: Dataset) {
  const fail = (condition: any, message: string) => {
    if (!condition) throw storageError("P2004", message);
  };
  const unique = (rows: any[], keys: readonly string[]) => {
    const seen = new Set<string>();
    for (const row of rows) {
      if (keys.some((key) => row[key] == null)) continue;
      const key = JSON.stringify(keys.map((k) => row[k]));
      if (seen.has(key))
        throw storageError("P2002", "Registro duplicado.", { target: keys });
      seen.add(key);
    }
  };
  for (const model of models) {
    const rows = data.models[model.name];
    fail(Array.isArray(rows), "Tabela incompatível: " + model.name);
    const scalarFields = model.fields.filter((f) => f.kind !== "object");
    for (const row of rows) {
      fail(
        row && typeof row === "object" && !Array.isArray(row),
        "Registro inválido.",
      );
      fail(
        Object.keys(row).every((key) =>
          scalarFields.some((f) => f.name === key),
        ),
        "Campo desconhecido em " + model.name,
      );
      for (const f of scalarFields) {
        const v = row[f.name];
        fail(
          !f.isRequired || v != null,
          "Campo obrigatório: " + model.name + "." + f.name,
        );
        if (v == null) continue;
        if (f.isList) {
          fail(Array.isArray(v), "Lista inválida.");
          continue;
        }
        if (f.type === "DateTime")
          fail(v instanceof Date && Number.isFinite(+v), "Data inválida.");
        if (f.type === "Decimal")
          fail(
            Prisma.Decimal.isDecimal(v) && v.isFinite(),
            "Valor decimal inválido.",
          );
        if (f.type === "Int")
          fail(
            Number.isInteger(v) && v >= -2147483648 && v <= 2147483647,
            "Inteiro inválido.",
          );
        if (f.type === "Boolean")
          fail(typeof v === "boolean", "Indicador inválido.");
        if (f.type === "String") fail(typeof v === "string", "Texto inválido.");
      }
      for (const relation of model.fields.filter(
        (f) => f.kind === "object" && f.relationFromFields!.length,
      )) {
        if (relation.relationFromFields!.some((k) => row[k] == null)) continue;
        if (
          !data.models[relation.type]?.some((r) =>
            relation.relationFromFields!.every(
              (k, i) => compare(row[k], r[relation.relationToFields![i]]) === 0,
            ),
          )
        )
          throw storageError(
            "P2003",
            "Vínculo inválido ou exclusão de registro referenciado.",
          );
      }
    }
    for (const field of scalarFields.filter((f) => f.isId || f.isUnique))
      unique(rows, [field.name]);
    for (const fields of model.uniqueFields) unique(rows, fields);
    if (model.primaryKey) unique(rows, model.primaryKey.fields);
  }
  unique(
    data.models.Unit.filter((r) => r.active && r.kind === "MATRIZ"),
    ["companyId"],
  );
  unique(
    data.models.Employment.filter((r) => !r.termination),
    ["personId"],
  );
  unique(
    data.models.Measurement.filter(
      (r) => !r.originalId && r.status !== "CANCELADA",
    ),
    ["contractId", "month"],
  );
  unique(
    data.models.MeasurementLine.filter((r) => r.kind === "PESSOA"),
    ["measurementId", "enrollmentId"],
  );
  unique(
    data.models.MeasurementLine.filter((r) => r.kind === "CENTRO"),
    ["measurementId", "unitId", "costCenterId"],
  );
  const oneOf = (v: string, values: string[]) => values.includes(v);
  const nonNegative = (v: any) => v == null || new Prisma.Decimal(v).gte(0);
  const firstDay = (v: Date) => v.getUTCDate() === 1 && v.getUTCHours() === 0;
  const payment = (mode: string, day: number | null, days: number | null) =>
    (mode === "FIXO" && day != null && day >= 1 && day <= 31 && days == null) ||
    (mode === "DIAS" &&
      days != null &&
      days >= 0 &&
      days <= 365 &&
      day == null);
  for (const r of data.models.Company)
    fail(
      r.id === "middleby" && r.targetMonths >= 1 && r.targetMonths <= 12,
      "Configuração da empresa inválida.",
    );
  for (const r of data.models.User)
    fail(oneOf(r.role, ["RH", "CONSULTA"]), "Perfil inválido.");
  for (const r of data.models.Unit)
    fail(oneOf(r.kind, ["MATRIZ", "FILIAL"]), "Tipo de unidade inválido.");
  for (const r of data.models.Employment)
    fail(
      oneOf(r.status, ["ATIVO", "INATIVO", "DESLIGADO"]) &&
        (!r.termination || r.termination >= r.admission) &&
        (r.status === "DESLIGADO") === !!r.termination,
      "Vínculo inválido.",
    );
  for (const r of data.models.VacationPeriod)
    fail(
      r.end >= r.start &&
        r.concessionStart > r.end &&
        r.concessionEnd >= r.concessionStart &&
        r.entitlement >= 0,
      "Período de férias inválido.",
    );
  for (const r of data.models.VacationBooking)
    fail(
      r.days > 0 &&
        +r.end === +r.start + (r.days - 1) * 86400000 &&
        +r.returnDate === +r.end + 86400000 &&
        oneOf(r.status, [
          "RASCUNHO",
          "PROGRAMADA",
          "APROVADA",
          "EM_ANDAMENTO",
          "CONCLUIDA",
          "CANCELADA",
        ]),
      "Programação de férias inválida.",
    );
  for (const r of data.models.VacationAdjustment)
    fail(
      oneOf(r.kind, ["ABONO", "AJUSTE"]) && (r.kind !== "ABONO" || r.days > 0),
      "Ajuste de férias inválido.",
    );
  for (const r of data.models.Leave)
    fail(
      (!r.expectedEnd || r.expectedEnd >= r.start) &&
        (!r.actualEnd || r.actualEnd >= r.start),
      "Afastamento inválido.",
    );
  for (const r of data.models.Enrollment)
    fail(
      (!r.end || r.end >= r.start) &&
        nonNegative(r.companyCost) &&
        nonNegative(r.employeeCost) &&
        (r.active || r.end) &&
        (r.plan == null ||
          oneOf(r.plan, ["Básico", "Apartamento", "Especial"])),
      "Cobertura de benefício inválida.",
    );
  for (const r of data.models.Nomination)
    fail(!r.end || r.end >= r.start, "Vigência inválida.");
  for (const r of data.models.ContractSequence)
    fail(r.value >= 0, "Sequência inválida.");
  for (const r of data.models.PaymentTerm)
    fail(payment(r.mode, r.day, r.days), "Condição de pagamento inválida.");
  for (const r of data.models.Contract) {
    const final = ["ENCERRADO", "CANCELADO"].includes(r.status);
    fail(
      (!r.end || r.end >= r.start) &&
        oneOf(r.kind, ["FIXO", "VARIAVEL", "EVENTUAL"]) &&
        oneOf(r.status, [
          "ELABORACAO",
          "VIGENTE",
          "SUSPENSO",
          "ENCERRADO",
          "CANCELADO",
        ]) &&
        payment(r.paymentMode, r.paymentDay, r.paymentDays) &&
        r.version > 0 &&
        r.alertDays >= 1 &&
        r.alertDays <= 365 &&
        (final
          ? r.closedOn &&
            r.closureReason?.trim() &&
            (r.status === "CANCELADO" || r.closedOn >= r.start)
          : !r.closedOn && !r.closureReason),
      "Contrato inválido.",
    );
  }
  for (const r of data.models.ContractItem)
    fail(
      r.quantity.gt(0) &&
        nonNegative(r.unitPrice) &&
        oneOf(r.allocationMode, ["VALOR", "PERCENTUAL", "PESSOAS"]) &&
        (r.allocationMode !== "PESSOAS" || r.benefitId) &&
        oneOf(r.billingUnit, [
          "MENSALIDADE",
          "PESSOA",
          "HORA",
          "SERVICO",
          "OUTRA",
        ]),
      "Item contratual inválido.",
    );
  for (const r of data.models.ContractForecast)
    fail(
      nonNegative(r.amount) &&
        firstDay(r.month) &&
        oneOf(r.status, ["PREVISTA", "CANCELADA"]),
      "Previsão inválida.",
    );
  for (const r of data.models.Measurement)
    fail(
      oneOf(r.status, ["PREENCHIMENTO", "CONFERIDA", "CANCELADA"]) &&
        oneOf(r.mode, ["PESSOAS", "VALOR", "PERCENTUAL"]) &&
        nonNegative(r.amount) &&
        r.version > 0 &&
        firstDay(r.month) &&
        r.due >= r.issue &&
        r.originalId !== r.id &&
        (r.status !== "CONFERIDA" ||
          (r.confirmedAt &&
            r.confirmedSnapshot &&
            typeof r.confirmedSnapshot === "object" &&
            !Array.isArray(r.confirmedSnapshot) &&
            r.amount.gt(0) &&
            r.invoice?.trim())),
      "Medição inválida.",
    );
  for (const r of data.models.MeasurementLine)
    fail(
      oneOf(r.kind, ["PESSOA", "CENTRO", "AJUSTE"]) &&
        nonNegative(r.reference) &&
        r.percent.gte(0) &&
        r.percent.lte(100) &&
        (r.kind === "AJUSTE" || nonNegative(r.amount)) &&
        (r.kind !== "AJUSTE" || r.reason?.trim()) &&
        (r.kind !== "PESSOA" || (r.employmentId && r.enrollmentId && r.itemId)),
      "Linha de medição inválida.",
    );
}
