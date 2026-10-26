let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string> = {},
    public status = 400,
  ) {
    super(message);
  }
}
export async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch("/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    credentials: "same-origin",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json();
  if (data.storageUnavailable) window.dispatchEvent(new Event("storage-unavailable"));
  if (!res.ok)
    throw new ApiError(
      data.error || "Não foi possível concluir.",
      data.fields,
      res.status,
    );
  return data;
}
export const brDate = (v: string | undefined) =>
  v
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(v))
    : "—";
export const money = (v: unknown) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(Number(v));
export const civil = (s: string) => s?.slice(0, 10) || "";
