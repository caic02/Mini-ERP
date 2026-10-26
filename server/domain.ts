export class RuleError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}
export function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new RuleError(message);
}
export function date(value: string | Date): Date {
  if (value instanceof Date)
    return new Date(value.toISOString().slice(0, 10) + "T00:00:00Z");
  ensure(/^\d{4}-\d{2}-\d{2}$/.test(value), "Informe uma data válida.");
  const d = new Date(value + "T00:00:00Z");
  ensure(
    !isNaN(+d) && d.toISOString().slice(0, 10) === value,
    "Data civil inválida.",
  );
  return d;
}
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => new Date(+d + n * 86400000);
export function addMonths(d: Date, n: number) {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return target;
}
export function today() {
  return date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.BUSINESS_TIMEZONE || "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
}
export function validCpf(value: string) {
  const s = value.replace(/\D/g, "");
  if (s.length !== 11 || /^(\d)\1+$/.test(s)) return false;
  return [9, 10].every((n) => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(s[i]) * (n + 1 - i);
    const digit = (sum * 10) % 11;
    return Number(s[n]) === (digit === 10 ? 0 : digit);
  });
}
export function overlap(a: Date, b: Date | null, c: Date, d: Date | null) {
  return (!d || a <= d) && (!b || c <= b);
}
export type PeriodShape = {
  start: Date;
  end: Date;
  concessionStart: Date;
  concessionEnd: Date;
  target: Date;
};
export function expectedPeriods(
  admission: Date,
  until: Date,
  termination: Date | null = null,
  targetMonths = 11,
): PeriodShape[] {
  const limit = termination && termination < until ? termination : until;
  const periods: PeriodShape[] = [];
  for (let year = 0; year < 150; year++) {
    // Always anchor to admission: Feb 29 becomes Feb 28 in common years and returns to Feb 29 in leap years.
    const start = addMonths(admission, year * 12);
    if (start > limit) break;
    const next = addMonths(admission, (year + 1) * 12),
      after = addMonths(admission, (year + 2) * 12);
    periods.push({
      start,
      end: addDays(next, -1),
      concessionStart: next,
      concessionEnd: addDays(after, -1),
      target: addMonths(next, targetMonths),
    });
  }
  return periods;
}
export const reservedStatuses = ["APROVADA", "EM_ANDAMENTO"];
export function automaticVacationStatus(
  status: string,
  start: Date,
  end: Date,
  asOf = today(),
) {
  if (!reservedStatuses.includes(status)) return status;
  if (end < asOf) return "CONCLUIDA";
  if (start <= asOf) return "EM_ANDAMENTO";
  return status;
}
type Booking = { status: string; days: number };
type Adjustment = { kind: string; days: number };
export function balance(
  period: {
    entitlement: number;
    end: Date;
    bookings: Booking[];
    adjustments: Adjustment[];
  },
  asOf = today(),
) {
  const entitlement = period.end < asOf ? period.entitlement : 0;
  const adjustment = period.adjustments
    .filter((x) => x.kind === "AJUSTE")
    .reduce((a, x) => a + x.days, 0);
  const allowance = period.adjustments
    .filter((x) => x.kind === "ABONO")
    .reduce((a, x) => a + x.days, 0);
  const used = period.bookings
    .filter((x) => x.status === "CONCLUIDA")
    .reduce((a, x) => a + x.days, 0);
  const reserved = period.bookings
    .filter((x) => reservedStatuses.includes(x.status))
    .reduce((a, x) => a + x.days, 0);
  return {
    entitlement,
    adjustment,
    allowance,
    used,
    reserved,
    available: entitlement + adjustment - allowance - used - reserved,
    notEnjoyed: entitlement + adjustment - allowance - used,
  };
}
export function periodIndicator(
  p: { end: Date; concessionEnd: Date; target: Date; review: boolean },
  b: ReturnType<typeof balance>,
  asOf = today(),
  alerts = [90, 60, 30],
) {
  if (p.review) return "Revisão necessária";
  if (p.end >= asOf) return "Em aquisição";
  if (b.notEnjoyed <= 0) return "Período quitado";
  const left = Math.ceil((+p.concessionEnd - +asOf) / 86400000);
  if (left < 0) return "Prazo ultrapassado com saldo";
  const threshold = [...alerts].sort((a, b) => a - b).find((n) => left <= n);
  if (threshold !== undefined) return `Prazo concessivo: até ${threshold} dias`;
  if (+p.target - +asOf <= Math.max(...alerts) * 86400000)
    return "Data limite próxima";
  return "Direito adquirido • dentro do prazo";
}
export function validateSplit(
  days: number[],
  entitlement: number,
  allowance: number,
) {
  ensure(days.length <= 3, "São permitidos até três períodos.");
  ensure(
    days.every((n) => Number.isInteger(n) && n >= 5),
    "Cada fração deve ter ao menos cinco dias.",
  );
  const remaining = entitlement - allowance - days.reduce((a, n) => a + n, 0);
  ensure(
    days.some((n) => n >= 14) || remaining >= 14,
    "O fracionamento deve preservar uma fração de ao menos 14 dias.",
  );
  ensure(
    remaining === 0 || remaining >= 5,
    "O saldo restante não pode formar fração inferior a cinco dias.",
  );
  ensure(
    allowance <= Math.floor(entitlement / 3),
    "Abono não pode exceder um terço do direito.",
  );
}
export function currentCondition(
  e: {
    status: string;
    termination: Date | null;
    admission?: Date;
    leaves: {
      start: Date;
      actualEnd: Date | null;
      expectedEnd: Date | null;
      type: { tag: string | null };
    }[];
    periods: { bookings: { start: Date; end: Date; status: string }[] }[];
  },
  asOf = today(),
) {
  if (e.termination && e.termination <= asOf)
    return { label: "Desligado", conflict: false };
  if (e.status === "INATIVO") return { label: "Inativo", conflict: false };
  if (e.admission && e.admission > asOf)
    return { label: "Admissão futura", conflict: false };
  const leaves = e.leaves.filter(
    (x) =>
      x.start <= asOf &&
      (!(x.actualEnd || x.expectedEnd) ||
        (x.actualEnd || x.expectedEnd)! >= asOf),
  );
  const bookings = e.periods
    .flatMap((p) => p.bookings)
    .filter(
      (x) =>
        ["APROVADA", "EM_ANDAMENTO", "CONCLUIDA"].includes(x.status) &&
        x.start <= asOf &&
        x.end >= asOf,
    );
  const label = leaves.some((x) => x.type.tag === "MATERNIDADE")
    ? "Licença-maternidade"
    : leaves.some((x) => x.type.tag === "LICENCA")
      ? "Outra licença"
      : leaves.length
        ? "Afastado"
        : bookings.length
          ? "Em férias"
          : "Em atividade";
  return { label, conflict: leaves.length + bookings.length > 1 };
}
export function professionalProjection(e: any) {
  return {
    id: e.id,
    registration: e.registration,
    person: { name: e.person.name, socialName: e.person.socialName },
    unit: e.unit,
    costCenter: e.costCenter,
    department: { name: e.department.name },
    job: { name: e.job.name },
    manager: e.manager
      ? { id: e.manager.id, person: { name: e.manager.person.name } }
      : null,
    corporateEmail: e.corporateEmail,
    weeklyHours: e.weeklyHours,
    kind: e.kind,
    admission: e.admission,
    termination: e.termination,
    status: e.status,
    condition: currentCondition(e),
    absences: e.leaves.map((l: any) => ({
      id: l.id,
      start: l.start,
      end: l.actualEnd || l.expectedEnd,
      kind: "Afastamento / licença",
    })),
    periods: e.periods.map((p: any) => ({
      id: p.id,
      start: p.start,
      end: p.end,
      bookings: p.bookings.map((b: any) => ({
        id: b.id,
        start: b.start,
        end: b.end,
        returnDate: b.returnDate,
        days: b.days,
        status: b.status,
      })),
    })),
  };
}
