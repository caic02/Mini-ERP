import { useEffect, useRef, useState } from "react";
import { api, ApiError, civil } from "../api";
import { CurrencyInput } from "../CurrencyInput";
export function NewMeasurement({
  data,
  seed,
  onClose,
  onCreated,
}: {
  data: any;
  seed?: any;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    manualAmount = useRef(false);
  const original = seed?.originalId
    ? data.measurements.find((m: any) => m.id === seed.originalId)
    : null;
  const [values, setValues] = useState<any>({
    contractId: seed?.contractId || original?.contractId || "",
    month:
      seed?.month?.slice(0, 7) ||
      civil(original?.month || data.businessDate).slice(0, 7),
    invoice: "",
    issue: seed?.month ? seed.month.slice(0, 7) + "-01" : data.businessDate,
    due: data.businessDate,
    amount: original ? "0.00" : "0.00",
    supplierId: original?.supplierId || "",
    unitId: original?.unitId || "",
    categoryId: original?.categoryId || "",
    notes: "",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  const contract = data.contracts.find((c: any) => c.id === values.contractId),
    forecast = !original
      ? data.forecasts.find(
          (f: any) =>
            f.contractId === values.contractId &&
            civil(f.month).slice(0, 7) === values.month,
        )
      : null;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (!contract || !/^\d{4}-\d{2}$/.test(values.month)) return;
    const month = values.month + "-01";
    let due = month;
    if (forecast) due = civil(forecast.due);
    else if (contract.paymentMode === "FIXO") {
      const d = new Date(month + "T00:00:00Z");
      const last = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
      ).getUTCDate();
      due =
        values.month +
        "-" +
        String(Math.min(contract.paymentDay, last)).padStart(2, "0");
    } else
      due = new Date(
        Date.parse(month + "T00:00:00Z") +
          (contract.paymentDays || 0) * 86400000,
      )
        .toISOString()
        .slice(0, 10);
    setValues((v: any) => ({
      ...v,
      supplierId: contract.supplierId,
      unitId: contract.unitId,
      categoryId: contract.categoryId,
      issue: month,
      due,
      ...(!manualAmount.current && !original
        ? { amount: forecast?.amount || contract.monthlyReference }
        : {}),
    }));
  }, [values.contractId, values.month]);
  function field(
    key: string,
    label: string,
    type = "text",
    required = true,
    source?: string,
  ) {
    const id = "measurement-new-" + key;
    return (
      <div key={key} className="field">
        <label htmlFor={id}>
          {label}
          {required ? " *" : ""}
        </label>
        {source ? (
          <select
            id={id}
            disabled={!!contract || !!original}
            required={required}
            value={values[key]}
            onChange={(e) =>
              setValues((v: any) => ({ ...v, [key]: e.target.value }))
            }
          >
            <option value="">Selecione</option>
            {data[source]
              .filter((r: any) => r.active || r.id === values[key])
              .map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.name}
                </option>
              ))}
          </select>
        ) : key === "amount" ? (
          <CurrencyInput
            id={id}
            required={required}
            value={values[key]}
            aria-invalid={!!errors[key]}
            onValueChange={(value) => {
              manualAmount.current = true;
              setValues((v: any) => ({ ...v, [key]: value }));
            }}
          />
        ) : (
          <input
            id={id}
            type={type}
            required={required}
            step={type === "number" ? "0.01" : undefined}
            min={type === "number" ? "0" : undefined}
            value={values[key]}
            onChange={(e) => {
              if (key === "amount") manualAmount.current = true;
              setValues((v: any) => ({ ...v, [key]: e.target.value }));
            }}
            aria-invalid={!!errors[key]}
          />
        )}{" "}
        {errors[key] && <small className="error">{errors[key]}</small>}
      </div>
    );
  }
  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const m = await api("/contracts/measurements", "POST", {
              ...values,
              forecastId: forecast?.id || null,
              originalId: original?.id || null,
            });
            onCreated(m.id);
          } catch (e) {
            setError((e as Error).message);
            if (e instanceof ApiError) setErrors(e.fields);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="dialog-head">
          <div>
            <small>CONTRATOS E MEDIÇÕES</small>
            <h2>{original ? "Lançamento complementar" : "Nova medição"}</h2>
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
        <p className="notice">
          {original
            ? "O complemento mantém contrato e competência da principal e começa sem repetir as pessoas cobertas."
            : "Selecione um contrato vigente ou deixe vazio para despesa avulsa. A distribuição será aberta após salvar."}
        </p>
        {error && (
          <p className="banner error" role="alert">
            {error}
          </p>
        )}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="measurement-new-contract">Contrato</label>
            <select
              id="measurement-new-contract"
              value={values.contractId}
              disabled={!!original}
              onChange={(e) =>
                setValues((v: any) => ({ ...v, contractId: e.target.value }))
              }
            >
              <option value="">Despesa avulsa (sem contrato)</option>
              {data.contracts
                .filter(
                  (c: any) =>
                    c.status === "VIGENTE" || c.id === values.contractId,
                )
                .map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="measurement-new-month">Competência *</label>
            <input
              id="measurement-new-month"
              type="month"
              required
              disabled={!!original}
              value={values.month}
              onChange={(e) =>
                setValues((v: any) => ({ ...v, month: e.target.value }))
              }
            />
          </div>
          {field("supplierId", "Fornecedor", "text", true, "suppliers")}
          {field("unitId", "Unidade faturada", "text", true, "units")}
          {field("categoryId", "Categoria", "text", true, "categories")}
          {field("invoice", "Referência da fatura / NF", "text", false)}
          {field("issue", "Emissão", "date")}
          {field("due", "Vencimento", "date")}
          {field("amount", "Valor da fatura (R$)", "number")}
          <label className="field wide">
            Observações
            <textarea
              value={values.notes}
              onChange={(e) =>
                setValues((v: any) => ({ ...v, notes: e.target.value }))
              }
            />
          </label>
        </div>
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar e abrir distribuição"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
