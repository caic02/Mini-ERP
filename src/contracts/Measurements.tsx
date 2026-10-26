import { useEffect, useRef, useState } from "react";
import { api, ApiError, brDate, civil, money } from "../api";
import { Table, Column } from "../Table";
import { allocationSummary, cents } from "../../shared/measurementMath";
import { NewMeasurement } from "./NewMeasurement";
import { CurrencyInput } from "../CurrencyInput";
import {
  MeasurementStatus,
  measurementStates as states,
} from "./MeasurementStatus";
function Command({
  action,
  onClose,
  onSubmit,
}: {
  action: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
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
          try {
            await onSubmit(reason);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="dialog-head">
          <h2>
            {action === "REABRIR" ? "Reabrir medição" : "Cancelar medição"}
          </h2>
          <button type="button" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </div>
        <label>
          Motivo obrigatório
          <textarea
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Voltar
          </button>
          <button className="primary" disabled={busy}>
            Confirmar
          </button>
        </footer>
      </form>
    </dialog>
  );
}
export function Measurements({
  data,
  entry,
  onRefresh,
}: {
  data: any;
  entry?: any;
  onRefresh: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
      entry?.id || null,
    ),
    [creating, setCreating] = useState<any>(entry?.seed || null),
    [m, setM] = useState<any>(null),
    [values, setValues] = useState<any>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [command, setCommand] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [month, setMonth] = useState(""),
    [status, setStatus] = useState(""),
    [revision, setRevision] = useState(0),
    [tab, setTab] = useState("Distribuição");
  const [lineSearch, setLineSearch] = useState("");
  useEffect(() => setLineSearch(""), [selectedId]);
  useEffect(() => {
    if (!selectedId) return;
    let disposed = false;
    setLoading(true);
    setError("");
    api("/contracts/measurements/" + selectedId)
      .then((row) => {
        if (!disposed) {
          setM(row);
          setValues({
            invoice: row.invoice || "",
            issue: civil(row.issue),
            due: civil(row.due),
            amount: row.amount,
            mode: row.mode,
            notes: row.notes || "",
            reviewConfirmed: row.reviewConfirmed,
            varianceConfirmed: row.varianceConfirmed,
            lines: row.lines,
          });
        }
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [selectedId, revision]);
  function update(key: string, value: any) {
    setValues((old: any) => ({ ...old, [key]: value }));
  }
  function line(index: number, key: string, value: any) {
    setValues((old: any) => ({
      ...old,
      lines: old.lines.map((l: any, i: number) =>
        i === index ? { ...l, [key]: value } : l,
      ),
    }));
  }
  let summary: any = null;
  try {
    if (values)
      summary = allocationSummary(
        values.mode,
        values.amount,
        values.lines.map((l: any) => ({
          ...l,
          amount: l.amount || "0",
          percent: l.percent || "0",
        })),
      );
  } catch {}
  const draft = m?.status === "PREENCHIMENTO";
  const source = m?.sourceSnapshot || {};
  const activeLines =
    values?.lines
      .map((l: any, index: number) => ({ ...l, index }))
      .filter(
        (l: any) =>
          l.kind === "AJUSTE" ||
          l.kind === (values.mode === "PESSOAS" ? "PESSOA" : "CENTRO"),
      ) || [];
  const normalizeName = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
  const terms = normalizeName(lineSearch).trim().split(/\s+/).filter(Boolean);
  const visibleLines = activeLines.filter((l: any) => {
    const names = normalizeName(
      [l.coveredName, l.employeeName].filter(Boolean).join(" "),
    );
    return terms.every((term) => names.includes(term));
  });
  const changed =
    m &&
    values &&
    JSON.stringify(values) !==
      JSON.stringify({
        invoice: m.invoice || "",
        issue: civil(m.issue),
        due: civil(m.due),
        amount: m.amount,
        mode: m.mode,
        notes: m.notes || "",
        reviewConfirmed: m.reviewConfirmed,
        varianceConfirmed: m.varianceConfirmed,
        lines: m.lines,
      });
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/contracts/measurements/" + m.id, "PUT", {
        ...values,
        version: m.version,
        lines: values.lines.map((l: any) => ({
          id: l.id,
          kind: l.kind,
          unitId: l.unitId,
          costCenterId: l.costCenterId,
          amount: l.amount || "0",
          percent: l.percent || "0",
          reason: l.reason || null,
        })),
      });
      setRevision((n) => n + 1);
      onRefresh();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message +
              (Object.keys(e.fields).length
                ? " " + Object.values(e.fields).join(" ")
                : "")
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(action: string, reason?: string) {
    await api("/contracts/measurements/" + m.id + "/action", "POST", {
      version: m.version,
      action,
      reason,
    });
    setCommand(null);
    setRevision((n) => n + 1);
    onRefresh();
  }
  function add(kind: string) {
    setLineSearch("");
    setValues((old: any) => ({
      ...old,
      lines: [
        ...old.lines,
        {
          kind,
          unitId: "",
          costCenterId: "",
          amount: "0.00",
          percent: "0",
          reason: "",
          unitName: "",
          costCenterName: "",
          costCenterCode: "",
          reference: "0.00",
        },
      ],
    }));
  }
  const cols: Column[] = [
    { label: "Código", value: (r) => r.code },
    {
      label: "Tipo",
      value: (r) =>
        r.originalId ? "Complemento" : r.contractId ? "Principal" : "Avulsa",
    },
    { label: "Contrato", value: (r) => r.contract?.name || "Despesa avulsa" },
    { label: "Fornecedor", value: (r) => r.supplier.name },
    {
      label: "Competência",
      value: (r) => civil(r.month).slice(0, 7).split("-").reverse().join("/"),
    },
    { label: "Fatura / NF", value: (r) => r.invoice },
    { label: "Vencimento", value: (r) => brDate(r.due) },
    { label: "Valor (R$)", value: (r) => money(r.amount) },
    {
      label: "Situação",
      value: (r) => <MeasurementStatus status={r.status} />,
    },
  ];
  return (
    <>
      {error && (
        <p className="banner error" role="alert">
          {error}
        </p>
      )}
      {!selectedId ? (
        <section className="panel">
          <div className="panel-title">
            <h2>Medições e faturas</h2>
            <button className="primary" onClick={() => setCreating({})}>
              + Nova medição
            </button>
          </div>
          <div className="filters">
            <label className="search">
              Buscar medição
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Código, fornecedor ou fatura"
              />
            </label>
            <label>
              Competência
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
            <label>
              Situação
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Todas</option>
                {Object.entries(states).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => {
                setSearch("");
                setMonth("");
                setStatus("");
              }}
            >
              Limpar filtros
            </button>
          </div>
          <Table
            rows={data.measurements.filter(
              (r: any) =>
                (!search ||
                  [r.code, r.invoice, r.supplier.name, r.contract?.name]
                    .join(" ")
                    .toLocaleLowerCase("pt-BR")
                    .includes(search.toLocaleLowerCase("pt-BR"))) &&
                (!month || civil(r.month).startsWith(month)) &&
                (!status || r.status === status),
            )}
            columns={cols}
            onOpen={(r) => {
              setSelectedId(r.id);
              setTab("Distribuição");
            }}
            openLabel="Abrir medição"
          />
        </section>
      ) : loading || !m || !values ? (
        <p role="status">Carregando medição…</p>
      ) : (
        <>
          <section className="panel">
            <div className="panel-title">
              <div>
                <button
                  onClick={() => {
                    if (
                      changed &&
                      !window.confirm("Descartar alterações ainda não salvas?")
                    )
                      return;
                    setSelectedId(null);
                    setM(null);
                  }}
                >
                  ← Voltar às medições
                </button>
                <strong>{m.code}</strong>
                <MeasurementStatus status={m.status} />
              </div>
              <div>
                {draft ? (
                  <>
                    <button disabled={busy} className="primary" onClick={save}>
                      Salvar alterações
                    </button>
                    <button
                      disabled={busy || changed}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          await action("CONFERIR");
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Conferir medição
                    </button>
                    <button
                      disabled={busy || changed}
                      onClick={() => setCommand("CANCELAR")}
                    >
                      Cancelar medição
                    </button>
                  </>
                ) : m.status === "CONFERIDA" ? (
                  <button disabled={busy} onClick={() => setCommand("REABRIR")}>
                    Reabrir medição
                  </button>
                ) : null}
                {!m.originalId &&
                  m.status !== "CANCELADA" &&
                  (!m.contractId || m.contract?.status === "VIGENTE") && (
                    <button
                      disabled={busy || changed}
                      onClick={() =>
                        setCreating({
                          originalId: m.id,
                          contractId: m.contractId,
                          month: civil(m.month),
                        })
                      }
                    >
                      + Complemento
                    </button>
                  )}
              </div>
            </div>
            {changed && draft && (
              <p className="notice">
                Há alterações não salvas. Salve antes de conferir ou executar
                outra ação.
              </p>
            )}
            <dl>
              {Object.entries({
                Contrato: source.contractName || "Despesa avulsa",
                Competência: civil(m.month)
                  .slice(0, 7)
                  .split("-")
                  .reverse()
                  .join("/"),
                Fornecedor: source.supplierName,
                "Unidade faturada": source.unitName,
                Categoria: source.categoryName,
                Principal: m.original?.code,
                Previsto: source.forecastAmount
                  ? money(source.forecastAmount)
                  : "Sem previsão",
                "Conferida em": m.confirmedAt
                  ? new Date(m.confirmedAt).toLocaleString("pt-BR")
                  : "Aguardando conferência",
              }).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{String(value || "—")}</dd>
                </div>
              ))}
            </dl>
            <div className="form-grid">
              {[
                ["invoice", "Referência da fatura / NF", "text"],
                ["issue", "Emissão", "date"],
                ["due", "Vencimento", "date"],
                ["amount", "Valor da fatura (R$)", "number"],
              ].map(([key, label, type]) => (
                <label key={key}>
                  {label}
                  {key === "amount" ? (
                    <CurrencyInput
                      disabled={!draft || busy}
                      value={values[key]}
                      onValueChange={(value) => update(key, value)}
                    />
                  ) : (
                    <input
                      disabled={!draft || busy}
                      type={type}
                      step={type === "number" ? "0.01" : undefined}
                      value={values[key]}
                      onChange={(e) => update(key, e.target.value)}
                    />
                  )}
                </label>
              ))}
              <label>
                Distribuição
                <select
                  value={values.mode}
                  disabled={!draft || busy}
                  onChange={(e) => update("mode", e.target.value)}
                >
                  <option value="PESSOAS">Pessoas cobertas</option>
                  <option value="VALOR">Valor por unidade / centro</option>
                  <option value="PERCENTUAL">
                    Percentual por unidade / centro
                  </option>
                </select>
              </label>
              <label>
                Observações
                <textarea
                  disabled={!draft || busy}
                  value={values.notes}
                  onChange={(e) => update("notes", e.target.value)}
                />
              </label>
            </div>
          </section>
          <div className="tabs">
            {["Distribuição", "Histórico"].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "Histórico" ? (
            <section className="panel">
              <h2>Histórico e versões</h2>
              <Table
                rows={m.history}
                columns={[
                  {
                    label: "Data",
                    value: (r) => new Date(r.at).toLocaleString("pt-BR"),
                  },
                  { label: "Autor", value: (r) => r.author.username },
                  { label: "Ação", value: (r) => r.action },
                  { label: "Motivo", value: (r) => r.reason },
                  {
                    label: "Versão preservada",
                    value: (r) => r.snapshot.version,
                  },
                  {
                    label: "Valor anterior",
                    value: (r) => money(r.snapshot.amount),
                  },
                ]}
              />
            </section>
          ) : (
            <>
              <section className="panel">
                <div className="panel-title">
                  <h2>Base e distribuição dos custos</h2>
                  {draft && (
                    <div>
                      {values.mode !== "PESSOAS" && (
                        <button disabled={busy} onClick={() => add("CENTRO")}>
                          + Adicionar centro
                        </button>
                      )}
                      <button disabled={busy} onClick={() => add("AJUSTE")}>
                        + Ajuste / desconto
                      </button>
                    </div>
                  )}
                </div>
                {source.warnings?.length > 0 && (
                  <details className="notice" open>
                    <summary>
                      Alertas para revisão ({source.warnings.length})
                    </summary>
                    <ul>
                      {source.warnings.map((w: string, i: number) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {draft && source.warnings?.length > 0 && (
                  <label className="measurement-check">
                    <input
                      type="checkbox"
                      checked={values.reviewConfirmed}
                      onChange={(e) =>
                        update("reviewConfirmed", e.target.checked)
                      }
                    />
                    RH conferiu os alertas, coberturas, valores e lotações desta
                    competência.
                  </label>
                )}
                {draft &&
                  source.forecastAmount &&
                  summary &&
                  cents(values.amount) !== cents(source.forecastAmount) && (
                    <label className="measurement-check">
                      <input
                        type="checkbox"
                        checked={values.varianceConfirmed}
                        onChange={(e) =>
                          update("varianceConfirmed", e.target.checked)
                        }
                      />
                      RH confirmou a diferença entre previsão (
                      {money(source.forecastAmount)}) e fatura (
                      {money(values.amount)}).
                    </label>
                  )}
                <div className="measurement-line-search">
                  <label>
                    Pesquisar funcionário ou dependente
                    <input
                      type="search"
                      placeholder="Digite o nome do titular ou do dependente"
                      value={lineSearch}
                      onChange={(e) => setLineSearch(e.target.value)}
                    />
                  </label>
                  {lineSearch && (
                    <button type="button" onClick={() => setLineSearch("")}>
                      Limpar pesquisa
                    </button>
                  )}
                </div>
                <p className="measurement-search-count" aria-live="polite">
                  Exibindo {visibleLines.length} de {activeLines.length}{" "}
                  registros. Os totais consideram toda a distribuição.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Pessoa / tipo</th>
                        <th>Plano</th>
                        <th>Unidade beneficiada</th>
                        <th>Centro de custos</th>
                        <th>
                          {values.mode === "PERCENTUAL"
                            ? "Percentual (%)"
                            : "Valor (R$)"}
                        </th>
                        <th>Justificativa / nota</th>
                        {draft && <th>Ações</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLines.map((l: any) => (
                        <tr key={l.id || "new-" + l.index}>
                          <td>
                            {l.kind === "AJUSTE" ? (
                              "Ajuste / desconto"
                            ) : l.kind === "CENTRO" ? (
                              "Centro"
                            ) : (
                              <>
                                {l.coveredName}
                                <small className="measurement-subtext">
                                  {l.dependentId
                                    ? "Dependente de " + l.employeeName
                                    : "Titular"}
                                </small>
                              </>
                            )}
                          </td>
                          <td>{l.plan || "—"}</td>
                          <td>
                            {l.kind === "PESSOA" || !draft ? (
                              l.unitName
                            ) : (
                              <select
                                aria-label={"Unidade da linha " + (l.index + 1)}
                                value={l.unitId}
                                disabled={busy}
                                onChange={(e) => {
                                  line(l.index, "unitId", e.target.value);
                                  line(l.index, "costCenterId", "");
                                }}
                              >
                                <option value="">Selecione</option>
                                {data.units
                                  .filter(
                                    (u: any) => u.active || u.id === l.unitId,
                                  )
                                  .map((u: any) => (
                                    <option key={u.id} value={u.id}>
                                      {u.name}
                                    </option>
                                  ))}
                              </select>
                            )}
                          </td>
                          <td>
                            {l.kind === "PESSOA" || !draft ? (
                              l.costCenterCode + " · " + l.costCenterName
                            ) : (
                              <select
                                aria-label={"Centro da linha " + (l.index + 1)}
                                disabled={busy}
                                value={l.costCenterId}
                                onChange={(e) =>
                                  line(l.index, "costCenterId", e.target.value)
                                }
                              >
                                <option value="">Selecione</option>
                                {data.costCenters
                                  .filter(
                                    (c: any) =>
                                      c.units.some(
                                        (u: any) => u.unitId === l.unitId,
                                      ) &&
                                      (c.active || c.id === l.costCenterId),
                                  )
                                  .map((c: any) => (
                                    <option key={c.id} value={c.id}>
                                      {c.code} · {c.name}
                                    </option>
                                  ))}
                              </select>
                            )}
                          </td>
                          <td>
                            {draft &&
                            !(
                              values.mode === "PERCENTUAL" &&
                              l.kind === "CENTRO"
                            ) ? (
                              <CurrencyInput
                                aria-label={"Valor da linha " + (l.index + 1)}
                                disabled={busy}
                                allowNegative={l.kind === "AJUSTE"}
                                value={l.amount}
                                onValueChange={(value) =>
                                  line(l.index, "amount", value)
                                }
                              />
                            ) : draft ? (
                              <input
                                aria-label={"Valor da linha " + (l.index + 1)}
                                type="number"
                                step="0.01"
                                disabled={busy}
                                value={
                                  values.mode === "PERCENTUAL" &&
                                  l.kind === "CENTRO"
                                    ? l.percent
                                    : l.amount
                                }
                                onChange={(e) =>
                                  line(
                                    l.index,
                                    values.mode === "PERCENTUAL" &&
                                      l.kind === "CENTRO"
                                      ? "percent"
                                      : "amount",
                                    e.target.value,
                                  )
                                }
                              />
                            ) : values.mode === "PERCENTUAL" &&
                              l.kind === "CENTRO" ? (
                              l.percent + "%"
                            ) : (
                              money(l.amount)
                            )}
                          </td>
                          <td>
                            {draft ? (
                              <input
                                aria-label={"Nota da linha " + (l.index + 1)}
                                value={l.reason || ""}
                                disabled={busy}
                                onChange={(e) =>
                                  line(l.index, "reason", e.target.value)
                                }
                              />
                            ) : (
                              l.reason || "—"
                            )}
                          </td>
                          {draft && (
                            <td>
                              <button
                                disabled={busy}
                                onClick={() =>
                                  update(
                                    "lines",
                                    values.lines.filter(
                                      (_: any, i: number) => i !== l.index,
                                    ),
                                  )
                                }
                              >
                                Remover
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {activeLines.length > 0 && !visibleLines.length && (
                    <p className="empty">
                      Nenhum funcionário ou dependente encontrado para esta
                      pesquisa.
                    </p>
                  )}
                  {!activeLines.length && (
                    <p className="empty">
                      Nenhuma linha nesta distribuição. Adicione um centro ou
                      use a base de pessoas disponível.
                    </p>
                  )}
                </div>
              </section>
              <section className="panel">
                <div className="panel-title">
                  <h2>Resumo por unidade e centro</h2>
                  <strong
                    className={summary?.difference !== "0.00" ? "error" : ""}
                  >
                    Diferença:{" "}
                    {summary ? money(summary.difference) : "Revise os valores"}
                  </strong>
                </div>
                {summary ? (
                  <>
                    <p>
                      Distribuído: <strong>{money(summary.total)}</strong> ·
                      Fatura: <strong>{money(values.amount)}</strong>
                      {values.mode === "PERCENTUAL" && (
                        <> · Percentuais: {summary.percentTotal}%</>
                      )}
                    </p>
                    {(summary.hasNegative || summary.negativeBase) && (
                      <p className="error">
                        Há custo negativo ou ajuste maior que a fatura. Corrija
                        antes de conferir.
                      </p>
                    )}
                    <Table
                      rows={summary.rows}
                      columns={[
                        {
                          label: "Unidade beneficiada",
                          value: (r) =>
                            r.unitName ||
                            data.units.find((u: any) => u.id === r.unitId)
                              ?.name,
                        },
                        {
                          label: "Centro de custos",
                          value: (r) =>
                            r.costCenterName ||
                            data.costCenters.find(
                              (c: any) => c.id === r.costCenterId,
                            )?.name,
                        },
                        { label: "Valor (R$)", value: (r) => money(r.amount) },
                      ]}
                    />
                  </>
                ) : (
                  <p className="error">
                    Preencha valores e percentuais válidos.
                  </p>
                )}
              </section>
            </>
          )}
        </>
      )}
      {creating && (
        <NewMeasurement
          data={data}
          seed={creating}
          onClose={() => setCreating(null)}
          onCreated={(id) => {
            setCreating(null);
            setSelectedId(id);
            setRevision((n) => n + 1);
            setTab("Distribuição");
            onRefresh();
          }}
        />
      )}
      {command && (
        <Command
          action={command}
          onClose={() => setCommand(null)}
          onSubmit={(reason) => action(command, reason)}
        />
      )}
    </>
  );
}
