export type AllocationLine = {
  id?: string;
  kind: string;
  unitId: string;
  costCenterId: string;
  unitName?: string;
  costCenterName?: string;
  costCenterCode?: string;
  amount: string;
  percent: string;
};
export function cents(value: string) {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Valor monetário inválido.");
  const negative = value.startsWith("-"),
    [integer, fraction = ""] = value.replace("-", "").split(".");
  return (
    (BigInt(integer) * 100n + BigInt(fraction.padEnd(2, "0"))) *
    (negative ? -1n : 1n)
  );
}
export function decimal(value: bigint) {
  return `${value < 0n ? "-" : ""}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2, "0")}`;
}
export function allocationSummary(
  mode: string,
  amount: string,
  lines: AllocationLine[],
) {
  const invoice = cents(amount),
    adjustments = lines.filter((l) => l.kind === "AJUSTE"),
    adjustmentTotal = adjustments.reduce((s, l) => s + cents(l.amount), 0n);
  const base = invoice - adjustmentTotal,
    centers = lines.filter((l) => l.kind === "CENTRO");
  const percentTotal = centers.reduce((s, l) => s + cents(l.percent), 0n);
  let rows: { line: AllocationLine; amount: bigint }[] = [];
  if (mode === "PERCENTUAL" && percentTotal === 10000n && base >= 0n) {
    const distributed = centers.map((line) => {
      const product = base * cents(line.percent);
      return { line, amount: product / 10000n, remainder: product % 10000n };
    });
    const remaining = base - distributed.reduce((s, l) => s + l.amount, 0n);
    const sorted = [...distributed].sort((a, b) =>
      a.remainder === b.remainder
        ? `${a.line.unitId}|${a.line.costCenterId}`.localeCompare(
            `${b.line.unitId}|${b.line.costCenterId}`,
          )
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
    for (let n = 0; n < Number(remaining); n++)
      sorted[n % sorted.length].amount++;
    rows = distributed;
  } else if (mode !== "PERCENTUAL")
    rows = lines
      .filter((l) => l.kind === (mode === "PESSOAS" ? "PESSOA" : "CENTRO"))
      .map((line) => ({ line, amount: cents(line.amount) }));
  rows.push(
    ...adjustments.map((line) => ({ line, amount: cents(line.amount) })),
  );
  const groups = new Map<
    string,
    {
      unitId: string;
      costCenterId: string;
      unitName?: string;
      costCenterName?: string;
      costCenterCode?: string;
      amount: bigint;
    }
  >();
  for (const { line, amount } of rows) {
    const key = line.unitId + "|" + line.costCenterId;
    const old = groups.get(key);
    if (old) old.amount += amount;
    else
      groups.set(key, {
        unitId: line.unitId,
        costCenterId: line.costCenterId,
        unitName: line.unitName,
        costCenterName: line.costCenterName,
        costCenterCode: line.costCenterCode,
        amount,
      });
  }
  const total = rows.reduce((s, r) => s + r.amount, 0n);
  return {
    total: decimal(total),
    difference: decimal(invoice - total),
    adjustmentTotal: decimal(adjustmentTotal),
    percentTotal: decimal(percentTotal),
    negativeBase: base < 0n,
    hasNegative: [...groups.values()].some((g) => g.amount < 0n),
    rows: [...groups.values()].map((g) => ({
      ...g,
      amount: decimal(g.amount),
    })),
    computed: rows.map((r) => ({ id: r.line.id, amount: decimal(r.amount) })),
  };
}
