import { statusLabels } from "./forms";

const statusClasses: Record<string, string> = {
  ELABORACAO: "filling",
  VIGENTE: "confirmed",
  SUSPENSO: "paused",
  ENCERRADO: "closed",
  CANCELADO: "cancelled",
  PREVISTA: "planned",
  PREENCHIMENTO: "filling",
  CONFERIDA: "confirmed",
  CANCELADA: "cancelled",
  Ativo: "confirmed",
  Inativo: "inactive",
};

export function StatusBadge({
  status,
  className = "",
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={`badge status-indicator ${statusClasses[status] || ""} ${className}`.trim()}
    >
      {statusLabels[status] || status}
    </span>
  );
}
