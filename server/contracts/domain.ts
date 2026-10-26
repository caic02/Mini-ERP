import { Prisma } from "@prisma/client";
import { date, addDays, ensure } from "../domain.js";
export const contractStatuses = [
  "ELABORACAO",
  "VIGENTE",
  "SUSPENSO",
  "ENCERRADO",
  "CANCELADO",
] as const;
export const contractKinds = ["FIXO", "VARIAVEL", "EVENTUAL"] as const;
export function monthDate(value: string) {
  ensure(
    /^\d{4}-\d{2}$/.test(value),
    "Informe uma competência válida (AAAA-MM).",
  );
  return date(value + "-01");
}
export function monthStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
export function nextMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}
export function forecastMonths(start: Date, end: Date | null, asOf: Date) {
  const first = monthStart(start),
    last = monthStart(end || new Date(Math.max(+start, +asOf)));
  const months: Date[] = [];
  for (let m = first; m <= last; m = nextMonth(m)) {
    ensure(
      months.length < 1200,
      "Vigência limitada a 100 anos para geração de previsões.",
    );
    months.push(m);
  }
  return months;
}
export function paymentDue(
  month: Date,
  term: {
    paymentMode: string;
    paymentDay: number | null;
    paymentDays: number | null;
  },
) {
  if (term.paymentMode === "DIAS") return addDays(month, term.paymentDays || 0);
  const last = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      month.getUTCFullYear(),
      month.getUTCMonth(),
      Math.min(term.paymentDay || 1, last),
    ),
  );
}
export function itemTotal(item: {
  quantity: Prisma.Decimal | string;
  unitPrice: Prisma.Decimal | string;
}) {
  const total = new Prisma.Decimal(item.quantity)
    .mul(item.unitPrice)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  ensure(
    total.lte("9999999999999999.99"),
    "Total do item excede o limite suportado.",
  );
  return total;
}
export function contractTotal(
  items: {
    quantity: Prisma.Decimal | string;
    unitPrice: Prisma.Decimal | string;
    active: boolean;
  }[],
) {
  const total = items
    .filter((i) => i.active)
    .reduce((total, i) => total.add(itemTotal(i)), new Prisma.Decimal(0));
  ensure(
    total.lte("9999999999999999.99"),
    "Total do contrato excede o limite suportado.",
  );
  return total;
}
