import { cents, decimal } from "../../shared/measurementMath";

export type DashboardFilters = {
  from: string;
  to: string;
  unitId: string;
  supplierId: string;
  categoryId: string;
};
type Named = { id: string; name: string };
type Billing = { unitId: string; supplierId: string; categoryId: string };
export type DashboardContract = Billing & {
  id: string;
  code: string;
  name: string;
  status: string;
  start: string;
  end: string | null;
  activatedAt: string | null;
  closedOn?: string | null;
  adjustmentDate: string | null;
  alertDays: number;
  supplier?: Named;
};
export type DashboardForecast = {
  id: string;
  code: string;
  contractId: string;
  month: string;
  due: string;
  amount: string;
  status: string;
};
type Distribution = {
  unitId: string;
  costCenterId: string;
  unitName?: string;
  costCenterName?: string;
  amount: string;
};
export type DashboardMeasurement = Billing & {
  id: string;
  code: string;
  contractId: string | null;
  forecastId: string | null;
  originalId: string | null;
  month: string;
  due: string;
  amount: string;
  status: string;
  invoice?: string | null;
  sourceSnapshot?: {
    supplierName?: string;
    categoryName?: string;
    contractName?: string;
  };
  confirmedSnapshot?: {
    supplierName?: string;
    categoryName?: string;
    summary?: { rows?: Distribution[] };
  } | null;
  supplier?: Named;
  category?: Named;
};
export type DashboardSource = {
  businessDate: string;
  contracts: DashboardContract[];
  forecasts: DashboardForecast[];
  measurements: DashboardMeasurement[];
  units: Named[];
  suppliers: Named[];
  categories: Named[];
};
export type RankingRow = {
  id: string;
  name: string;
  amount: string;
  count: number;
  share: number;
};
export const monthKey = (date: string) => date.slice(0, 7);
export function shiftMonth(month: string, offset: number) {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1 + offset, 1)).toISOString().slice(0, 7);
}
export function dashboardDefaults(today: string): DashboardFilters {
  const to = monthKey(today);
  return {
    from: shiftMonth(to, -5),
    to,
    unitId: "",
    supplierId: "",
    categoryId: "",
  };
}
export function percent(n: bigint | number, d: bigint | number) {
  // Conversão somente para proporções e gráficos; somas e diferenças usam centavos.
  return BigInt(d) > 0n ? (Number(n) / Number(d)) * 100 : 0;
}
export function dashboardMoney(value: string) {
  const n = cents(value),
    positive = n < 0n ? -n : n;
  return `${n < 0n ? "−" : ""}R$ ${new Intl.NumberFormat("pt-BR").format(positive / 100n)},${String(positive % 100n).padStart(2, "0")}`;
}
export function dashboardMonths(from: string, to: string) {
  if (![from, to].every((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) || from > to)
    throw new Error(
      "Informe um período válido, com a competência inicial anterior ou igual à final.",
    );
  const count =
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    Number(to.slice(5)) -
    Number(from.slice(5)) +
    1;
  if (count > 24) throw new Error("Selecione até 24 competências por análise.");
  return Array.from({ length: count }, (_, index) => shiftMonth(from, index));
}
function rank(
  rows: { id: string; name: string; amount: string }[],
): RankingRow[] {
  const groups = new Map<
    string,
    { id: string; name: string; total: bigint; count: number }
  >();
  for (const row of rows) {
    const current = groups.get(row.id) || {
      id: row.id,
      name: row.name,
      total: 0n,
      count: 0,
    };
    current.total += cents(row.amount);
    current.count++;
    groups.set(row.id, current);
  }
  const total = [...groups.values()].reduce((s, row) => s + row.total, 0n);
  return [...groups.values()]
    .sort((a, b) =>
      a.total === b.total
        ? a.name.localeCompare(b.name, "pt-BR")
        : a.total > b.total
          ? -1
          : 1,
    )
    .map((row) => ({
      id: row.id,
      name: row.name,
      amount: decimal(row.total),
      count: row.count,
      share: percent(row.total, total),
    }));
}
export function buildDashboard(
  data: DashboardSource,
  filters: DashboardFilters,
) {
  const months = dashboardMonths(filters.from, filters.to);
  const matches = (row: Billing) =>
    (!filters.unitId || row.unitId === filters.unitId) &&
    (!filters.supplierId || row.supplierId === filters.supplierId) &&
    (!filters.categoryId || row.categoryId === filters.categoryId);
  const inPeriod = (month: string) =>
    monthKey(month) >= filters.from && monthKey(month) <= filters.to;
  const sum = (rows: { amount: string }[]) =>
    rows.reduce((s, row) => s + cents(row.amount), 0n);
  const contractsById = new Map(data.contracts.map((c) => [c.id, c]));
  const contracts = data.contracts.filter((c) => {
    const effectiveEnd =
      c.closedOn && ["ENCERRADO", "CANCELADO"].includes(c.status)
        ? c.end && c.end < c.closedOn
          ? c.end
          : c.closedOn
        : c.end;
    return (
      matches(c) &&
      monthKey(c.start) <= filters.to &&
      (!effectiveEnd || monthKey(effectiveEnd) >= filters.from)
    );
  });
  const allForecasts = data.forecasts.filter(
    (f) =>
      f.status !== "CANCELADA" &&
      inPeriod(f.month) &&
      contractsById.has(f.contractId) &&
      matches(contractsById.get(f.contractId)!),
  );
  // Uma previsão em elaboração ainda não representa um contrato ativado.
  const forecasts = allForecasts.filter(
    (f) => !!contractsById.get(f.contractId)!.activatedAt,
  );
  const provisional = allForecasts.filter(
    (f) => !contractsById.get(f.contractId)!.activatedAt,
  );
  const measurements = data.measurements.filter(
    (m) => inPeriod(m.month) && matches(m),
  );
  const confirmed = measurements.filter((m) => m.status === "CONFERIDA");
  const drafts = measurements.filter((m) => m.status === "PREENCHIMENTO");
  const principals = new Map(
    data.measurements
      .filter(
        (m) =>
          !m.originalId &&
          ["PREENCHIMENTO", "CONFERIDA"].includes(m.status) &&
          m.contractId,
      )
      .map((m) => [`${m.contractId}|${monthKey(m.month)}`, m]),
  );
  const pairs = forecasts.map((f) => ({
    forecast: f,
    principal: principals.get(`${f.contractId}|${monthKey(f.month)}`),
  }));
  const missing = pairs.filter((p) => !p.principal).map((p) => p.forecast);
  const reviewed = pairs.filter((p) => p.principal?.status === "CONFERIDA");
  const reviewedIds = new Set(reviewed.map((p) => p.principal!.id));
  const pairedActual = confirmed.filter(
    (m) =>
      reviewedIds.has(m.id) ||
      (!!m.originalId && reviewedIds.has(m.originalId)),
  );
  const comparablePlan = sum(reviewed.map((p) => p.forecast));
  const comparableActual = sum(pairedActual);
  const variance = comparableActual - comparablePlan;
  const actual = sum(confirmed);
  const linkedDrafts = pairs.filter(
    (p) => p.principal?.status === "PREENCHIMENTO",
  ).length;
  const planned = sum(forecasts);
  const rankName = (m: DashboardMeasurement, kind: "supplier" | "category") => {
    const nameKey = kind === "supplier" ? "supplierName" : "categoryName";
    return (
      m.confirmedSnapshot?.[nameKey] ||
      m.sourceSnapshot?.[nameKey] ||
      m[kind]?.name ||
      "Não informado"
    );
  };
  let missingDistribution = 0;
  const distributions = confirmed.flatMap((m) => {
    const rows = m.confirmedSnapshot?.summary?.rows;
    if (
      !rows?.length ||
      sum(rows) !== cents(m.amount) ||
      rows.some((r) => cents(r.amount) < 0n)
    ) {
      missingDistribution++;
      return [
        {
          unitId: "unavailable",
          costCenterId: "unavailable",
          unitName: "Sem distribuição histórica",
          costCenterName: "Sem distribuição histórica",
          amount: m.amount,
        },
      ];
    }
    return rows;
  });
  const suppliers = rank(
    confirmed.map((m) => ({
      id: m.supplierId,
      name: rankName(m, "supplier"),
      amount: m.amount,
    })),
  );
  const categories = rank(
    confirmed.map((m) => ({
      id: m.categoryId,
      name: rankName(m, "category"),
      amount: m.amount,
    })),
  );
  const beneficiaryUnits = rank(
    distributions.map((r) => ({
      id: r.unitId,
      name: r.unitName || "Unidade não informada",
      amount: r.amount,
    })),
  );
  const costCenters = rank(
    distributions.map((r) => ({
      id: `${r.unitId}|${r.costCenterId}`,
      name:
        r.unitId === "unavailable"
          ? r.unitName!
          : `${r.costCenterName || "Centro não informado"} · ${r.unitName || "Unidade não informada"}`,
      amount: r.amount,
    })),
  );
  const dateDiff = (date: string) =>
    Math.round(
      (Date.parse(date.slice(0, 10) + "T00:00:00Z") -
        Date.parse(data.businessDate.slice(0, 10) + "T00:00:00Z")) /
        86400000,
    );
  const alerts = contracts
    .filter((c) => ["VIGENTE", "SUSPENSO"].includes(c.status))
    .flatMap((c) =>
      [
        { date: c.end, kind: "Vigência" },
        { date: c.adjustmentDate, kind: "Reajuste" },
      ]
        .filter((event) => event.date && dateDiff(event.date) <= c.alertDays)
        .map((event) => ({
          id: `${c.id}|${event.kind}`,
          contract: c,
          kind: event.kind,
          date: event.date!,
          days: dateDiff(event.date!),
        })),
    )
    .sort(
      (a, b) =>
        a.days - b.days || a.contract.code.localeCompare(b.contract.code),
    );
  const timeline = months.map((month) => {
    const p = forecasts.filter((f) => monthKey(f.month) === month);
    const a = confirmed.filter((m) => monthKey(m.month) === month);
    const d = drafts.filter((m) => monthKey(m.month) === month);
    return {
      month,
      planned: decimal(sum(p)),
      actual: a.length ? decimal(sum(a)) : null,
      confirmed: a.length,
      drafts: d.length,
      forecasts: p.length,
    };
  });
  const queue = [
    ...drafts.map((m) => ({
      id: m.id,
      code: m.code,
      kind: "draft" as const,
      supplier:
        m.sourceSnapshot?.supplierName ||
        m.supplier?.name ||
        "Fornecedor não informado",
      name: m.sourceSnapshot?.contractName || "Despesa avulsa",
      amount: m.amount,
      month: m.month,
      due: m.due,
      measurement: m,
      contract: m.contractId ? contractsById.get(m.contractId) : undefined,
      forecast: undefined as DashboardForecast | undefined,
    })),
    ...missing.map((f) => {
      const c = contractsById.get(f.contractId)!;
      return {
        id: f.id,
        code: f.code,
        kind: "missing" as const,
        supplier: c.supplier?.name || "Fornecedor não informado",
        name: c.name,
        amount: f.amount,
        month: f.month,
        due: f.due,
        measurement: undefined as DashboardMeasurement | undefined,
        contract: c,
        forecast: f,
      };
    }),
  ].sort(
    (a, b) =>
      a.due.localeCompare(b.due) ||
      a.kind.localeCompare(b.kind) ||
      a.code.localeCompare(b.code),
  );
  return {
    months,
    contracts,
    forecasts,
    confirmed,
    drafts,
    missing,
    provisional,
    alerts,
    timeline,
    queue,
    planned: decimal(planned),
    actual: decimal(actual),
    draftAmount: decimal(sum(drafts)),
    missingAmount: decimal(sum(missing)),
    provisionalAmount: decimal(sum(provisional)),
    closing: {
      reviewed: reviewed.length,
      drafts: linkedDrafts,
      missing: missing.length,
      total: forecasts.length,
      percent: percent(reviewed.length, forecasts.length),
    },
    comparison: {
      count: reviewed.length,
      planned: decimal(comparablePlan),
      actual: decimal(comparableActual),
      variance: decimal(variance),
      percent:
        comparablePlan > 0n
          ? (variance < 0n ? -1 : 1) *
            percent(variance < 0n ? -variance : variance, comparablePlan)
          : null,
      outside: decimal(actual - comparableActual),
    },
    suppliers,
    categories,
    beneficiaryUnits,
    costCenters,
    missingDistribution,
    cancelled: measurements.filter((m) => m.status === "CANCELADA").length,
    avulsaAmount: decimal(sum(confirmed.filter((m) => !m.contractId))),
    complementAmount: decimal(sum(confirmed.filter((m) => !!m.originalId))),
    contractStatuses: [
      "VIGENTE",
      "ELABORACAO",
      "SUSPENSO",
      "ENCERRADO",
      "CANCELADO",
    ].map((status) => ({
      status,
      count: contracts.filter((c) => c.status === status).length,
    })),
  };
}
export type DashboardResult = ReturnType<typeof buildDashboard>;
