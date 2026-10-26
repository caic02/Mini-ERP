import { useEffect, useRef, useState } from "react";
import { api, ApiError, civil } from "../api";
import { forms, statusLabels } from "./forms";
import { CurrencyInput } from "../CurrencyInput";
export function ContractEditor({
  resource,
  initial,
  data,
  onClose,
  onSaved,
}: {
  resource: string;
  initial?: any;
  data: any;
  onClose: () => void;
  onSaved: (row: any) => void | Promise<void>;
}) {
  const config = forms[resource];
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<any>(() => ({
    ...Object.fromEntries(
      config.fields.map((f) => [
        f.key,
        initial?.[f.key] ??
          (f.type === "checkbox" ? true : (f.options?.[0]?.[0] ?? "")),
      ]),
    ),
    ...initial,
    ...(!initial?.id && resource === "contracts"
      ? { alertDays: 90, kind: "FIXO" }
      : {}),
    ...(!initial?.id && resource === "items"
      ? {
          quantity: "1",
          unitPrice: "0.00",
          billingUnit: "MENSALIDADE",
          allocationMode: "VALOR",
        }
      : {}),
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  function set(key: string, value: any) {
    setValues((old: any) => ({
      ...old,
      [key]: value,
      ...(resource === "contracts" && key === "supplierId" && !old.categoryId
        ? {
            categoryId:
              data.suppliers.find((s: any) => s.id === value)?.categoryId || "",
          }
        : {}),
      ...(resource === "contracts" && key === "supplierId" && !old.paymentTermId
        ? {
            paymentTermId:
              data.suppliers.find((s: any) => s.id === value)?.paymentTermId ||
              "",
          }
        : {}),
    }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }
  const final = ["ENCERRADO", "CANCELADO"].includes(values.status);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setErrors({});
    try {
      let body: any = {};
      for (const field of config.fields) {
        let value = values[field.key];
        if (field.type === "date") value = civil(value);
        if (
          field.type === "number" &&
          !(
            resource === "items" &&
            ["quantity", "unitPrice"].includes(field.key)
          )
        )
          value = value === "" ? null : Number(value);
        body[field.key] = value;
      }
      if (initial?.version) body.version = initial.version;
      if (resource === "items") body.contractId = initial.contractId;
      if (resource === "payment-terms") {
        body.day = values.mode === "FIXO" ? body.day : null;
        body.days = values.mode === "DIAS" ? body.days : null;
      }
      const path =
        resource === "status"
          ? `/contracts/${initial.id}/status`
          : resource === "cancel"
            ? `/contracts/forecasts/${initial.id}/cancel`
            : `/contracts/resources/${resource}` +
              (initial?.id ? "/" + initial.id : "");
      const result = await api(
        path,
        ["status", "cancel"].includes(resource)
          ? "POST"
          : initial?.id
            ? "PUT"
            : "POST",
        body,
      );
      await onSaved(result);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setErrors(e.fields);
      } else setError("Falha de conexão. O preenchimento foi preservado.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="dialog-head">
          <div>
            <small>CONTRATOS E MEDIÇÕES</small>
            <h2>{config.title}</h2>
          </div>
          <button
            type="button"
            disabled={busy}
            aria-label="Fechar"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {initial?.code && (
          <p>
            Código: <strong>{initial.code}</strong> · gerado automaticamente
          </p>
        )}
        {resource === "contracts" && (
          <p className="notice">
            O contrato começa em elaboração. Inclua itens e ative-o após
            conferir. A unidade faturada não limita as unidades beneficiadas
            pelo futuro rateio.
          </p>
        )}
        {resource === "items" && (
          <p className="notice">
            A previsão usa quantidade × valor unitário, arredondada por item
            para centavos. Pessoas cobertas serão conferidas na etapa de
            medição.
          </p>
        )}
        {error && (
          <p className="banner error" role="alert">
            {error}
          </p>
        )}
        <div className="form-grid">
          {config.fields.map((field) => {
            if (
              resource === "payment-terms" &&
              ((field.key === "day" && values.mode !== "FIXO") ||
                (field.key === "days" && values.mode !== "DIAS"))
            )
              return null;
            if (
              resource === "status" &&
              ["closedOn", "reason"].includes(field.key) &&
              !final
            )
              return null;
            const key = field.key;
            let options = field.options || [];
            if (resource === "status" && key === "status") {
              const allowed: Record<string, string[]> = {
                ELABORACAO: ["VIGENTE", "CANCELADO"],
                VIGENTE: ["SUSPENSO", "ENCERRADO", "CANCELADO"],
                SUSPENSO: ["VIGENTE", "ENCERRADO", "CANCELADO"],
              };
              options = (allowed[initial.previousStatus] || []).map((v) => [
                v,
                statusLabels[v],
              ]);
            }
            const locked =
              resource === "contracts" &&
              initial?.activatedAt &&
              !["notes", "alertDays"].includes(key);
            const required =
              field.required ||
              (resource === "payment-terms" && ["day", "days"].includes(key)) ||
              (resource === "status" &&
                final &&
                ["closedOn", "reason"].includes(key));
            const id = "contract-" + key;
            const props = {
              id,
              required,
              disabled: !!locked,
              "aria-invalid": !!errors[key],
              "aria-describedby": errors[key] ? id + "-error" : undefined,
            };
            return (
              <div
                key={key}
                className={
                  "field " +
                  (["checkbox", "textarea"].includes(field.type || "")
                    ? "wide"
                    : "")
                }
              >
                <label htmlFor={id}>
                  {field.label}
                  {required ? " *" : ""}
                </label>
                {field.type === "select" ? (
                  <select
                    {...props}
                    value={values[key] ?? ""}
                    onChange={(e) => set(key, e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {options.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                    {field.source &&
                      (data[field.source] || [])
                        .filter((r: any) => r.active || r.id === values[key])
                        .map((r: any) => (
                          <option key={r.id} value={r.id}>
                            {r.code ? r.code + " · " : ""}
                            {r.name}
                            {!r.active ? " (inativo)" : ""}
                          </option>
                        ))}
                  </select>
                ) : field.type === "checkbox" ? (
                  <input
                    {...props}
                    type="checkbox"
                    checked={!!values[key]}
                    onChange={(e) => set(key, e.target.checked)}
                  />
                ) : field.type === "textarea" ? (
                  <textarea
                    {...props}
                    value={values[key] || ""}
                    onChange={(e) => set(key, e.target.value)}
                  />
                ) : key === "unitPrice" ? (
                  <CurrencyInput
                    {...props}
                    value={values[key]}
                    onValueChange={(value) => set(key, value)}
                  />
                ) : (
                  <input
                    {...props}
                    type={field.type || "text"}
                    step={field.step || "1"}
                    min={
                      field.type === "number"
                        ? key === "day"
                          ? "1"
                          : "0"
                        : undefined
                    }
                    max={key === "day" ? "31" : undefined}
                    value={
                      field.type === "date"
                        ? civil(values[key])
                        : (values[key] ?? "")
                    }
                    onChange={(e) => set(key, e.target.value)}
                  />
                )}
                {field.hint && <small>{field.hint}</small>}
                {errors[key] && (
                  <small id={id + "-error"} className="error">
                    {errors[key]}
                  </small>
                )}
              </div>
            );
          })}
        </div>
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
