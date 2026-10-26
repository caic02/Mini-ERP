import { useEffect, useRef, useState } from "react";
import { api, brDate, civil, money } from "../api";
import { Table, Column } from "../Table";
import { ContractEditor } from "./Editor";
import { statusLabels } from "./forms";
import { Measurements } from "./Measurements";
import { StatusBadge } from "./StatusBadge";
import { Dashboard } from "./Dashboard";
import { DashboardFilters } from "./dashboardData";
const badge = (v: string) => <StatusBadge status={v} />;
export function ContractsModule({
  user,
  brand,
  onBack,
  onLogout,
  signingOut,
}: {
  user: { username: string; role: string };
  brand: React.ReactNode;
  onBack: () => void;
  onLogout: () => Promise<void>;
  signingOut: boolean;
}) {
  const [section, setSection] = useState("Visão geral"),
    [master, setMaster] = useState("suppliers"),
    [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [editor, setEditor] = useState<{ resource: string; initial?: any } | null>(
      null,
    ),
    [search, setSearch] = useState(""),
    [unit, setUnit] = useState(""),
    [supplier, setSupplier] = useState(""),
    [status, setStatus] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [busy, setBusy] = useState(false);
  const [detailTab, setDetailTab] = useState("Itens");
  const [measurementEntry, setMeasurementEntry] = useState<any>(null);
  const [dashboardFilters, setDashboardFilters] =
    useState<DashboardFilters | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const loadVersion = useRef(0);
  function openMeasurement(id?: string, seed?: any) {
    setSelectedId(null);
    setMeasurementEntry({ id, seed });
    setSection("Medições");
  }
  async function load() {
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    await api("/contracts/bootstrap")
      .then((r) => {
        if (version === loadVersion.current) {
          setData(r);
          setUpdatedAt(new Date());
        }
      })
      .catch((e) => {
        if (version === loadVersion.current) setError(e.message);
      })
      .finally(() => {
        if (version === loadVersion.current) setLoading(false);
      });
  }
  useEffect(() => {
    void load();
    return () => {
      loadVersion.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => setRefresh((n) => n + 1), 60000);
    return () => clearInterval(timer);
  }, []);
  const contract = data?.contracts.find((c: any) => c.id === selectedId);
  const forecasts = data?.forecasts || [];
  function navigate(s: string) {
    setMeasurementEntry(null);
    setSection(s);
    setSelectedId(null);
    setSearch("");
    setUnit("");
    setSupplier("");
    setStatus("");
    setFrom("");
    setTo("");
  }
  function open(c: any) {
    setSection("Contratos");
    setSelectedId(c.id);
    setDetailTab("Itens");
    setSearch("");
  }
  function edit(resource: string, initial?: any) {
    setEditor({ resource, initial });
  }
  async function saved(row: any) {
    if (editor?.resource === "contracts") setSelectedId(row.id);
    await load();
    setEditor(null);
  }
  const contractCols: Column[] = [
    { label: "Código", value: (c) => c.code },
    { label: "Contrato", value: (c) => <strong>{c.name}</strong> },
    { label: "Fornecedor", value: (c) => c.supplier.name },
    { label: "Unidade faturada", value: (c) => c.unit.name },
    { label: "Tipo", value: (c) => statusLabels[c.kind] },
    {
      label: "Vigência",
      help: "Intervalo de validade do contrato. As previsões consideram as competências entre essas datas, sem proporcionalidade automática nos meses parciais.",
      value: (c) =>
        `${brDate(c.start)} a ${c.end ? brDate(c.end) : "sem término"}`,
    },
    {
      label: "Referência mensal (R$)",
      help: "Soma de quantidade × valor unitário dos itens ativos. É uma previsão, não custo realizado.",
      value: (c) => money(c.monthlyReference),
    },
    { label: "Situação", value: (c) => badge(c.status) },
  ];
  const forecastCols: Column[] = [
    { label: "Código", value: (f) => f.code },
    {
      label: "Contrato",
      value: (f) => (
        <strong>
          {f.contract.code} · {f.contract.name}
        </strong>
      ),
    },
    {
      label: "Competência",
      value: (f) => civil(f.month).slice(0, 7).split("-").reverse().join("/"),
    },
    { label: "Unidade faturada", value: (f) => f.contract.unit.name },
    { label: "Vencimento", value: (f) => brDate(f.due) },
    {
      label: "Previsto (R$)",
      help: "Referência prevista a partir dos itens do contrato. O valor conferido depende da medição da competência.",
      value: (f) => money(f.amount),
    },
    {
      label: "Situação",
      help: "Situação da previsão ou da medição principal vinculada. Prevista: competência sem medição principal. Em preenchimento: medição lançada, aguardando conferência. Conferida: medição validada e concluída. Cancelada: previsão cancelada, preservada no histórico.",
      value: (f) => badge(f.measurementStatus || f.status),
    },
    { label: "Motivo", value: (f) => f.reason },
    {
      label: "Ações",
      value: (f) =>
        !f.measurementId &&
        f.status === "PREVISTA" &&
        !["ENCERRADO", "CANCELADO"].includes(f.contract.status) ? (
          <button
            onClick={() =>
              edit("cancel", { ...f, version: f.contract.version })
            }
          >
            Cancelar previsão
          </button>
        ) : (
          "—"
        ),
    },
  ];
  forecastCols.push({
    label: "Medição",
    value: (f) =>
      f.measurementId ? (
        <button onClick={() => openMeasurement(f.measurementId)}>
          Abrir medição
        </button>
      ) : f.status === "PREVISTA" && f.contract.status === "VIGENTE" ? (
        <button
          onClick={() =>
            openMeasurement(undefined, {
              contractId: f.contractId,
              month: civil(f.month),
              forecastId: f.id,
            })
          }
        >
          Nova medição
        </button>
      ) : (
        "—"
      ),
  });
  const itemCols: Column[] = [
    { label: "Código", value: (i) => i.code },
    { label: "Item", value: (i) => i.name },
    { label: "Unidade de cobrança", value: (i) => statusLabels[i.billingUnit] },
    {
      label: "Quantidade",
      value: (i) =>
        new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(
          Number(i.quantity),
        ),
    },
    { label: "Valor unitário (R$)", value: (i) => money(i.unitPrice) },
    { label: "Total de referência (R$)", value: (i) => money(i.total) },
    {
      label: "Distribuição prevista",
      value: (i) => statusLabels[i.allocationMode],
    },
    { label: "Benefício associado", value: (i) => i.benefit?.name },
    { label: "Situação", value: (i) => badge(i.active ? "Ativo" : "Inativo") },
  ];
  const masterCols: Record<string, Column[]> = {
    suppliers: [
      { label: "Código", value: (r) => r.code },
      { label: "Fornecedor", value: (r) => r.name },
      { label: "Nome fantasia", value: (r) => r.tradeName },
      { label: "CPF / CNPJ", value: (r) => r.document },
      { label: "Categoria padrão", value: (r) => r.category?.name },
      { label: "Condição padrão", value: (r) => r.paymentTerm?.name },
      {
        label: "Situação",
        value: (r) => badge(r.active ? "Ativo" : "Inativo"),
      },
    ],
    categories: [
      { label: "Código", value: (r) => r.code },
      { label: "Categoria", value: (r) => r.name },
      {
        label: "Situação",
        value: (r) => badge(r.active ? "Ativo" : "Inativo"),
      },
    ],
    "payment-terms": [
      { label: "Código", value: (r) => r.code },
      { label: "Condição", value: (r) => r.name },
      {
        label: "Regra de vencimento",
        value: (r) =>
          r.mode === "FIXO"
            ? `Dia ${r.day} da competência`
            : `${r.days} dias após início da competência`,
      },
      {
        label: "Situação",
        value: (r) => badge(r.active ? "Ativo" : "Inativo"),
      },
    ],
  };
  function filtered(rows: any[], isForecast = false) {
    return rows.filter((r) => {
      const c = isForecast ? r.contract : r;
      return (
        (!search ||
          [r.code, r.name, c.name, c.code, c.supplier?.name]
            .join(" ")
            .toLocaleLowerCase("pt-BR")
            .includes(search.toLocaleLowerCase("pt-BR"))) &&
        (!unit || c.unitId === unit) &&
        (!supplier || c.supplierId === supplier) &&
        (!status || r.status === status) &&
        (!from || !isForecast || civil(r.month).slice(0, 7) >= from) &&
        (!to || !isForecast || civil(r.month).slice(0, 7) <= to)
      );
    });
  }
  function filters(isForecast = false) {
    return (
      <div className="filters">
        <label className="search">
          Buscar
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Código, descrição ou fornecedor"
          />
        </label>
        {section !== "Cadastros" && (
          <>
            <label>
              Unidade
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="">Todas</option>
                {data.units.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fornecedor
              <select
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              >
                <option value="">Todos</option>
                {data.suppliers.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Situação
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Todas</option>
                {(isForecast
                  ? ["PREVISTA", "CANCELADA"]
                  : [
                      "ELABORACAO",
                      "VIGENTE",
                      "SUSPENSO",
                      "ENCERRADO",
                      "CANCELADO",
                    ]
                ).map((v) => (
                  <option key={v} value={v}>
                    {statusLabels[v]}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {isForecast && (
          <>
            <label>
              Competência inicial
              <input
                type="month"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Competência final
              <input
                type="month"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        )}
        <button
          onClick={() => {
            setSearch("");
            setUnit("");
            setSupplier("");
            setStatus("");
            setFrom("");
            setTo("");
          }}
        >
          Limpar filtros
        </button>
      </div>
    );
  }
  return (
    <div className="shell">
      <aside>
        {brand}
        <div className="workspace-label">CONTRATOS E MEDIÇÕES</div>
        <nav aria-label="Menu de contratos">
          {[
            "Visão geral",
            "Contratos",
            "Medições",
            "Previsões",
            "Cadastros",
          ].map((s) => (
            <button
              key={s}
              className={section === s ? "nav-active" : ""}
              onClick={() => navigate(s)}
            >
              {s}
            </button>
          ))}
        </nav>
        <div className="aside-footer">
          <span className="local-dot" /> Ambiente local
          <br />
          <small>Contratos · Medições · Distribuição</small>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <span>
            Middleby do Brasil <b>/</b> Contratos e Medições
          </span>
          <div>
            <button onClick={onBack}>Trocar módulo</button>
            <span>
              {user.username}
              <small>RH administrador</small>
            </span>
            <button onClick={onLogout} disabled={signingOut}>
              Sair
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">GESTÃO CONTRATUAL</p>
              <h1>{contract ? "Ficha do contrato" : section}</h1>
              <p>
                {contract
                  ? `${contract.code} · ${contract.name}`
                  : section === "Contratos"
                    ? "Contratos, itens e condições para planejar as cobranças."
                    : section === "Previsões"
                      ? "Cronograma de valores previstos por competência."
                      : section === "Cadastros"
                        ? "Fornecedores, categorias e condições de pagamento."
                        : section === "Visão geral"
                          ? "Planejamento, custos conferidos e prioridades para o fechamento."
                          : "Acompanhe as medições e a distribuição dos custos."}
              </p>
            </div>
          </div>
          {section !== "Visão geral" && (
            <p className="notice">
              Contratos, medições e distribuição de custos. A conferência
              conclui a medição.
            </p>
          )}
          {error && (
            <p className="banner error" role="alert">
              {error}{" "}
              <button onClick={() => setRefresh((n) => n + 1)}>
                Tentar novamente
              </button>
            </p>
          )}
          {loading && !data ? (
            <p role="status">Carregando contratos…</p>
          ) : !data ? (
            <p>Não foi possível carregar os registros.</p>
          ) : section === "Medições" ? (
            <Measurements
              key={JSON.stringify(measurementEntry)}
              data={data}
              entry={measurementEntry}
              onRefresh={() => setRefresh((n) => n + 1)}
            />
          ) : contract ? (
            <>
              <section className="panel">
                <div className="panel-title">
                  <button onClick={() => setSelectedId(null)}>
                    ← Voltar aos contratos
                  </button>
                  <div>
                    {badge(contract.status)}
                    {!["ENCERRADO", "CANCELADO"].includes(contract.status) && (
                      <>
                        <button onClick={() => edit("contracts", contract)}>
                          Editar contrato
                        </button>
                        <button
                          className="primary"
                          onClick={() =>
                            edit("status", {
                              id: contract.id,
                              code: contract.code,
                              version: contract.version,
                              previousStatus: contract.status,
                              status: "",
                              closedOn: data.businessDate,
                              reason: "",
                            })
                          }
                        >
                          Alterar situação
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <dl>
                  {Object.entries({
                    Fornecedor: contract.supplier.name,
                    "Unidade faturada": contract.unit.name,
                    Categoria: contract.category.name,
                    "Condição de pagamento": `${contract.paymentTerm.name} · ${contract.paymentMode === "FIXO" ? `dia ${contract.paymentDay} da competência` : `${contract.paymentDays} dias após início da competência`}`,
                    Tipo: statusLabels[contract.kind],
                    "Número externo": contract.externalNumber,
                    Início: brDate(contract.start),
                    Fim: contract.end ? brDate(contract.end) : "Sem término",
                    "Reajuste previsto": brDate(contract.adjustmentDate),
                    "Referência mensal": money(contract.monthlyReference),
                    "Motivo do encerramento": contract.closureReason,
                    Observações: contract.notes,
                  }).map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{String(value || "—")}</dd>
                    </div>
                  ))}
                </dl>
                {contract.activatedAt && (
                  <p className="notice">
                    Termos e itens estão preservados após a ativação. Revisões
                    de valores ou prorrogações serão tratadas na próxima etapa.
                  </p>
                )}
              </section>
              <div className="tabs">
                {["Itens", "Previsões", "Medições"].map((t) => (
                  <button
                    key={t}
                    className={detailTab === t ? "active" : ""}
                    onClick={() => setDetailTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <section className="panel">
                <div className="panel-title">
                  <h2>
                    {detailTab === "Itens"
                      ? "Itens do contrato"
                      : detailTab === "Medições"
                        ? "Medições do contrato"
                        : "Previsões do contrato"}
                  </h2>
                  {detailTab === "Itens" &&
                  !contract.activatedAt &&
                  contract.status === "ELABORACAO" ? (
                    <button
                      className="primary"
                      onClick={() =>
                        edit("items", {
                          contractId: contract.id,
                          version: contract.version,
                        })
                      }
                    >
                      + Adicionar item
                    </button>
                  ) : detailTab === "Previsões" &&
                    ["ELABORACAO", "VIGENTE"].includes(contract.status) ? (
                    <button
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api(
                            "/contracts/" + contract.id + "/reconcile",
                            "POST",
                          );
                          setRefresh((n) => n + 1);
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Atualizar previsões
                    </button>
                  ) : detailTab === "Medições" &&
                    contract.status === "VIGENTE" ? (
                    <button
                      className="primary"
                      onClick={() =>
                        openMeasurement(undefined, { contractId: contract.id })
                      }
                    >
                      + Nova medição
                    </button>
                  ) : null}
                </div>
                {detailTab === "Itens" ? (
                  <Table
                    rows={contract.items}
                    columns={itemCols}
                    onEdit={
                      !contract.activatedAt && contract.status === "ELABORACAO"
                        ? (i) =>
                            edit("items", { ...i, version: contract.version })
                        : undefined
                    }
                  />
                ) : detailTab === "Medições" ? (
                  <Table
                    rows={data.measurements.filter(
                      (m: any) => m.contractId === contract.id,
                    )}
                    columns={[
                      { label: "Código", value: (m) => m.code },
                      {
                        label: "Competência",
                        value: (m) => civil(m.month).slice(0, 7),
                      },
                      { label: "Fatura / NF", value: (m) => m.invoice },
                      { label: "Valor (R$)", value: (m) => money(m.amount) },
                      { label: "Situação", value: (m) => badge(m.status) },
                    ]}
                    onOpen={(m) => openMeasurement(m.id)}
                    openLabel="Abrir medição"
                  />
                ) : (
                  <>
                    <p className="notice">
                      Recorrentes: quantidade × valor dos itens por mês de
                      vigência. Eventuais não geram previsões automáticas.
                      Cancelamentos são preservados; esta tela não representa
                      pagamento.
                    </p>
                    <Table
                      rows={forecasts.filter(
                        (f: any) => f.contractId === contract.id,
                      )}
                      columns={forecastCols}
                    />
                  </>
                )}
              </section>
            </>
          ) : section === "Visão geral" ? (
            <Dashboard
              data={data}
              filters={dashboardFilters}
              onFilters={setDashboardFilters}
              updatedAt={updatedAt}
              refreshing={loading}
              onRefresh={() => setRefresh((n) => n + 1)}
              onOpenContract={open}
              onOpenMeasurement={(id) => openMeasurement(id)}
              onCreateMeasurement={(forecast) =>
                openMeasurement(undefined, {
                  contractId: forecast.contractId,
                  month: civil(forecast.month),
                })
              }
              onContracts={() => navigate("Contratos")}
            />
          ) : section === "Contratos" ? (
            <section className="panel">
              <div className="panel-title">
                <h2>Contratos cadastrados</h2>
                <button className="primary" onClick={() => edit("contracts")}>
                  + Novo contrato
                </button>
              </div>
              {filters()}
              <Table
                rows={filtered(data.contracts)}
                columns={contractCols}
                onOpen={open}
                openLabel="Abrir contrato"
              />
            </section>
          ) : section === "Previsões" ? (
            <section className="panel">
              <div className="panel-title">
                <h2>Previsões por competência</h2>
                <span>Valores previstos, sem lançamento financeiro</span>
              </div>
              {filters(true)}
              {from && to && from > to ? (
                <p className="error">
                  A competência final deve ser posterior ou igual à inicial.
                </p>
              ) : (
                <Table
                  rows={filtered(forecasts, true)}
                  columns={forecastCols}
                  onOpen={(f) => open(f.contract)}
                  openLabel="Abrir contrato"
                />
              )}
            </section>
          ) : (
            <>
              <div className="tabs">
                {[
                  ["suppliers", "Fornecedores"],
                  ["categories", "Categorias"],
                  ["payment-terms", "Condições de pagamento"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={master === key ? "active" : ""}
                    onClick={() => {
                      setMaster(key);
                      setSearch("");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <section className="panel">
                <div className="panel-title">
                  <h2>
                    {master === "suppliers"
                      ? "Fornecedores"
                      : master === "categories"
                        ? "Categorias"
                        : "Condições de pagamento"}
                  </h2>
                  <button className="primary" onClick={() => edit(master)}>
                    + Cadastrar
                  </button>
                </div>
                {filters()}
                <Table
                  rows={filtered(
                    master === "payment-terms"
                      ? data.paymentTerms
                      : data[master],
                  )}
                  columns={masterCols[master]}
                  onEdit={(row) => edit(master, row)}
                />
              </section>
            </>
          )}
          <footer className="page-footer">
            Middleby do Brasil · Contratos e Medições
            <span>Dados locais · Acesso administrativo</span>
          </footer>
        </main>
      </div>
      {editor && data && (
        <ContractEditor
          key={editor.resource + (editor.initial?.id || "new")}
          {...editor}
          data={data}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
