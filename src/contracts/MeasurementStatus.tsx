import { StatusBadge } from "./StatusBadge";

export const measurementStates: Record<string, string> = {
  PREENCHIMENTO: "Em preenchimento",
  CONFERIDA: "Conferida",
  CANCELADA: "Cancelada",
};
export function MeasurementStatus({ status }: { status: string }) {
  return <StatusBadge status={status} className="measurement-status" />;
}
