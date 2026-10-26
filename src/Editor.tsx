import { useEffect, useRef, useState } from "react";
import { api, ApiError, civil, brDate } from "./api";
import { forms, labels, Field } from "./forms";
import { healthPlanOptions } from "../shared/benefits";
import { CurrencyInput } from "./CurrencyInput";
export const optionLabel = (r: string, x: any) =>
  r === "employments"
    ? `${x.registration} • ${x.person?.name || ""}`
    : r === "periods"
      ? `${x.employment?.person?.name || ""} • ${brDate(x.start)} a ${brDate(x.end)}`
      : r === "dependents"
        ? `${x.name} • ${x.person?.name || ""}`
        : `${x.code ? x.code + " • " : ""}${x.name}`;
export function Editor({
  resource,
  initial,
  onClose,
  onSaved,
}: {
  resource: string;
  initial?: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const config = forms[resource];
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<any>(() =>
    Object.fromEntries(
      config.fields.map((f) => [
        f.key,
        initial?.[f.key] ??
          (f.key === "unitIds"
            ? initial?.units?.map((u: any) => u.unitId) || []
            : f.type === "checkbox"
              ? ["active", "review", "draft"].includes(f.key)
              : (f.options?.[0] ?? (f.key === "entitlement" ? 30 : ""))),
      ]),
    ),
  );
  const [options, setOptions] = useState<Record<string, any[]>>({});
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    dialog.current?.showModal();
    const resources = [
      ...new Set(config.fields.map((f) => f.resource).filter(Boolean)),
    ] as string[];
    Promise.all(
      resources.map(async (r) => [r, await api("/data/" + r)] as const),
    )
      .then((p) => setOptions(Object.fromEntries(p)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [config]);
  function set(key: string, value: any) {
    setValues((old: any) => ({
      ...old,
      [key]: value,
      ...(resource === "enrollments" && key === "benefitId"
        ? { plan: "" }
        : {}),
    }));
    setFields((old) => ({ ...old, [key]: "" }));
  }
  function field(f: Field) {
    if (resource === "benefits" && f.key === "plan" && values.kind === "SAUDE")
      return null;
    if (resource === "enrollments" && f.key === "plan") {
      if (
        options.benefits?.find((b) => b.id === values.benefitId)?.kind !==
        "SAUDE"
      )
        return null;
      f = {
        ...f,
        type: "select",
        options: [...healthPlanOptions],
        hint: "Selecione o plano desta pessoa. Titular e dependente podem ter escolhas diferentes.",
      };
    }
    const id = "edit-" + f.key;
    let rows = options[f.resource || ""] || [];
    if (resource === "bookings" && f.key === "periodId") {
      rows = rows.filter(
        (p) => !p.settled || (initial?.id && p.id === initial.periodId),
      );
      f = {
        ...f,
        hint: rows.length
          ? "Períodos quitados ficam ocultos em novos lançamentos. O histórico é mantido."
          : "Nenhum período disponível para um novo lançamento. Os períodos quitados continuam no histórico.",
      };
    }
    if (f.kind) rows = rows.filter((x) => x.kind === f.kind);
    if (f.key === "costCenterId" && values.unitId)
      rows = rows.filter((x) =>
        x.units.some((u: any) => u.unitId === values.unitId),
      );
    if (f.key === "dependentId" && values.employmentId) {
      const e = options.employments?.find((x) => x.id === values.employmentId);
      rows = rows.filter((x) => x.personId === e?.personId);
    }
    const inputProps = {
      id,
      required: f.required,
      "aria-invalid": !!fields[f.key],
      "aria-describedby": fields[f.key] ? id + "-error" : undefined,
    };
    return (
      <div
        key={f.key}
        className={
          f.type === "textarea" || f.type === "checkbox"
            ? "field wide"
            : "field"
        }
      >
        <label htmlFor={id}>
          {f.label}
          {f.required ? " *" : ""}
        </label>
        {f.type === "select" ? (
          <select
            {...inputProps}
            multiple={f.multiple}
            value={values[f.key] ?? (f.multiple ? [] : "")}
            onChange={(e) =>
              set(
                f.key,
                f.multiple
                  ? Array.from(e.target.selectedOptions, (x) => x.value)
                  : e.target.value,
              )
            }
          >
            {!f.multiple && <option value="">Selecione</option>}
            {f.options?.map((o) => (
              <option key={o} value={o}>
                {labels[o] || o}
              </option>
            ))}
            {rows.map((x) => (
              <option key={x.id} value={x.id}>
                {optionLabel(f.resource!, x)}
                {x.active === false ? " (inativo)" : ""}
              </option>
            ))}
          </select>
        ) : f.type === "checkbox" ? (
          <input
            {...inputProps}
            type="checkbox"
            checked={!!values[f.key]}
            onChange={(e) => set(f.key, e.target.checked)}
          />
        ) : f.type === "textarea" ? (
          <textarea
            {...inputProps}
            value={values[f.key] || ""}
            onChange={(e) => set(f.key, e.target.value)}
          />
        ) : f.key === "companyCost" ? (
          <CurrencyInput
            {...inputProps}
            value={values[f.key]}
            onValueChange={(value) => set(f.key, value)}
          />
        ) : (
          <input
            {...inputProps}
            type={f.type || "text"}
            step={f.type === "number" ? "0.01" : undefined}
            value={
              f.type === "date" ? civil(values[f.key]) : (values[f.key] ?? "")
            }
            onChange={(e) => set(f.key, e.target.value)}
          />
        )}{" "}
        {f.hint && <small>{f.hint}</small>}
        {fields[f.key] && (
          <small className="error" id={id + "-error"}>
            {fields[f.key]}
          </small>
        )}
      </div>
    );
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFields({});
    try {
      const payload = { ...values };
      for (const f of config.fields) {
        if (f.type === "number")
          payload[f.key] =
            values[f.key] === ""
              ? null
              : f.key === "companyCost"
                ? values[f.key]
                : Number(values[f.key]);
        if (f.type === "date") payload[f.key] = civil(values[f.key]);
      }
      await api(
        "/data/" + resource + (initial?.id ? "/" + initial.id : ""),
        initial?.id ? "PUT" : "POST",
        payload,
      );
      onSaved();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields);
      } else setError("Falha de conexão. Seus campos foram preservados.");
    } finally {
      setBusy(false);
    }
  }
  const selectedPeriod = options.periods?.find((p) => p.id === values.periodId);
  const days = Number(values.days);
  const validStart =
    values.start &&
    Number.isInteger(days) &&
    days > 0 &&
    !isNaN(Date.parse(values.start));
  const dayString = (start: string, offset: number) =>
    brDate(
      new Date(
        Date.parse(start.slice(0, 10) + "T00:00:00Z") + offset * 86400000,
      ).toISOString(),
    );
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
            <small>GESTÃO DE RH</small>
            <h2>
              {initial?.id ? "Editar" : "Cadastrar"}{" "}
              {config.title.toLowerCase()}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            disabled={busy}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {resource === "employments" && (
          <p className="notice">
            Readmissão: selecione a pessoa existente e crie um novo vínculo.
            Recesso de estágio e outros vínculos não faz parte desta versão.
          </p>
        )}
        {resource === "bookings" && (
          <p className="notice">
            O retorno é uma previsão por calendário, sem considerar escala.
            Aprovações reservam saldo; a conclusão registra o gozo. Após a
            aprovação, o início e a conclusão são atualizados automaticamente
            pelas datas, a cada minuto com o servidor aberto ou ao reiniciá-lo.
            {validStart && (
              <>
                {" "}
                Fim inclusivo:{" "}
                <strong>{dayString(values.start, days - 1)}</strong>. Retorno
                previsto: <strong>{dayString(values.start, days)}</strong>.
              </>
            )}
            {selectedPeriod && days > 0 && (
              <>
                {" "}
                Data limite para concluir as férias:{" "}
                <strong>{brDate(selectedPeriod.target)}</strong>. Último início
                para concluir até essa data:{" "}
                <strong>{dayString(selectedPeriod.target, 1 - days)}</strong>.{" "}
                Último início para concluir no prazo concessivo:{" "}
                <strong>
                  {dayString(selectedPeriod.concessionEnd, 1 - days)}
                </strong>
                . Saldo disponível: {selectedPeriod.balance?.available} dias.
              </>
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="error banner">
            {error}
          </p>
        )}
        {loading ? (
          <p>Carregando cadastros…</p>
        ) : (
          <div className="form-grid">{config.fields.map(field)}</div>
        )}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={busy || loading}>
            {busy ? "Salvando…" : "Salvar registro"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
