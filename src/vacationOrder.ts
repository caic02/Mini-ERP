type PeriodRow = {
  indicator?: string;
  settled?: boolean;
  concessionEnd?: string;
  target?: string;
  start?: string;
  employment?: { person?: { name?: string } };
};
function priority(p: PeriodRow) {
  if (p.settled || p.indicator === "Período quitado") return 6;
  if (p.indicator === "Prazo ultrapassado com saldo") return 0;
  if (p.indicator === "Revisão necessária") return 1;
  if (p.indicator?.startsWith("Prazo concessivo:")) return 2;
  if (p.indicator === "Data limite próxima") return 3;
  if (p.indicator === "Em aquisição") return 5;
  return 4;
}
export function orderVacationPeriods<T extends PeriodRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const rank = priority(a) - priority(b);
    if (rank) return rank;
    const dateA = priority(a) === 3 ? a.target : a.concessionEnd;
    const dateB = priority(b) === 3 ? b.target : b.concessionEnd;
    return (
      (dateA || "").localeCompare(dateB || "") ||
      (a.employment?.person?.name || "").localeCompare(
        b.employment?.person?.name || "",
        "pt-BR",
      ) ||
      (a.start || "").localeCompare(b.start || "")
    );
  });
}
