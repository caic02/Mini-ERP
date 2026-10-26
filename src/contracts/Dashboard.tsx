import { useMemo, useRef, useState } from "react";
import { brDate } from "../api";
import { ColumnHelp } from "../ColumnHelp";
import { Table } from "../Table";
import { cents } from "../../shared/measurementMath";
import { statusLabels } from "./forms";
import {
  buildDashboard,
  dashboardDefaults,
  dashboardMoney as money,
  monthKey,
  percent,
  DashboardContract,
  DashboardFilters,
  DashboardForecast,
  DashboardSource,
  RankingRow,
} from "./dashboardData";
import "./dashboard.css";

const percentage = (value: number) =>
  value > 0 && value < 0.01
    ? "< 0,01%"
    : value.toLocaleString("pt-BR", {
        maximumFractionDigits: Math.abs(value) < 0.1 ? 2 : 1,
      }) + "%";
const monthName = (month: string, short = false) =>
  new Intl.DateTimeFormat("pt-BR", {
    month: short ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(month + "-01T00:00:00Z"));

function Icon({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
    plan: "M4 5h16v15H4z M8 3v4 M16 3v4 M4 10h16 M8 14h3 M8 17h7",
    confirmed: "M20 11a8 8 0 1 1-5-7 M8 11l4 4 8-9",
    draft: "M13 5H5v15h15v-8 M10 14l1-4 8-8 3 3-8 8z",
    missing: "M12 3 2 21h20z M12 9v5 M12 17v1",
  };
  return (
    <svg
      aria-hidden="true"
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[kind]} />
    </svg>
  );
}

function Ranking({
  rows,
  label,
  onSelect,
  selected,
}: {
  rows: RankingRow[];
  label: string;
  onSelect?: (id: string) => void;
  selected?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return rows.length ? (
    <>
      <ol className="dash-ranking" aria-label={label}>
        {rows.slice(0, expanded ? rows.length : 5).map((row, index) => {
          const content = (
            <>
              <span className="dash-rank-number">{index + 1}</span>
              <span className="dash-rank-body">
                <span className="dash-rank-line">
                  <span>{row.name}</span>
                  <strong>{money(row.amount)}</strong>
                </span>
                <span className="dash-track">
                  <span style={{ width: `${row.share}%` }} />
                </span>
                <small>{percentage(row.share)} do valor conferido</small>
              </span>
            </>
          );
          return (
            <li key={row.id}>
              {onSelect ? (
                <button
                  className="dash-rank-button"
                  aria-pressed={selected === row.id}
                  onClick={() => onSelect(selected === row.id ? "" : row.id)}
                >
                  {content}
                </button>
              ) : (
                <div className="dash-rank-static">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
      {rows.length > 5 && (
        <button
          className="dash-text-button"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Mostrar os 5 maiores" : `Mostrar todos (${rows.length})`}
        </button>
      )}
    </>
  ) : (
    <p className="dash-empty">
      Os valores aparecerão aqui quando houver medições conferidas neste
      recorte.
    </p>
  );
}

export function Dashboard({
  data,
  filters: savedFilters,
  onFilters,
  updatedAt,
  refreshing,
  onRefresh,
  onOpenContract,
  onOpenMeasurement,
  onCreateMeasurement,
  onContracts,
}: {
  data: DashboardSource;
  filters: DashboardFilters | null;
  onFilters: (filters: DashboardFilters) => void;
  updatedAt: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenContract: (c: DashboardContract) => void;
  onOpenMeasurement: (id: string) => void;
  onCreateMeasurement: (forecast: DashboardForecast) => void;
  onContracts: () => void;
}) {
  const filters = savedFilters || dashboardDefaults(data.businessDate);
  const [queueKind, setQueueKind] = useState("all");
  const [distribution, setDistribution] = useState("units");
  const [focusedMonth, setFocusedMonth] = useState<string | null>(null);
  const [allAlerts, setAllAlerts] = useState(false);
  const worklist = useRef<HTMLElement>(null);
  const computed = useMemo(() => {
    try {
      return { result: buildDashboard(data, filters), error: "" };
    } catch (error) {
      return { result: null, error: (error as Error).message };
    }
  }, [
    data,
    filters.from,
    filters.to,
    filters.unitId,
    filters.supplierId,
    filters.categoryId,
  ]);
  const board = computed.result;
  function update(key: keyof DashboardFilters, value: string) {
    onFilters({ ...filters, [key]: value });
  }
  function preset(kind: string) {
    const current = monthKey(data.businessDate);
    const range =
      kind === "month"
        ? { from: current, to: current }
        : kind === "year"
          ? { from: current.slice(0, 4) + "-01", to: current }
          : dashboardDefaults(data.businessDate);
    onFilters({ ...filters, from: range.from, to: range.to });
    setFocusedMonth(null);
  }
  function review(kind: string) {
    setQueueKind(kind);
    worklist.current?.scrollIntoView({ block: "start" });
  }
  const trendMax =
    board?.timeline.reduce((max, row) => {
      const p = cents(row.planned),
        a = cents(row.actual || "0");
      return [max, p, a].reduce((x, y) => (x > y ? x : y));
    }, 0n) || 0n;
  const detail =
    board?.timeline.find((row) => row.month === focusedMonth) ||
    board?.timeline.at(-1);
  const caption = computed.error
    ? "Ajuste o período"
    : filters.from === filters.to
      ? monthName(filters.from)
      : `${monthName(filters.from)} a ${monthName(filters.to)}`;
  const selectedLabels = [
    { key: "unitId" as const, label: "Unidade faturada", values: data.units },
    { key: "supplierId" as const, label: "Fornecedor", values: data.suppliers },
    { key: "categoryId" as const, label: "Categoria", values: data.categories },
  ];
  return (
    <div className="contract-dashboard">
      <section className="panel dash-filters" aria-label="Filtros do painel">
        <div className="dash-filter-top">
          <div>
            <span className="dash-overline">PERÍODO DE ANÁLISE</span>
            <h2>{computed.error ? "Ajuste o período" : caption}</h2>
          </div>
          <div
            className="dash-presets"
            role="group"
            aria-label="Atalhos de período"
          >
            <button onClick={() => preset("month")}>Mês atual</button>
            <button onClick={() => preset("six")}>Últimos 6 meses</button>
            <button onClick={() => preset("year")}>Ano até agora</button>
          </div>
        </div>
        <div className="dash-filter-grid">
          {(
            [
              ["from", "Competência inicial"],
              ["to", "Competência final"],
            ] as const
          ).map(([key, label]) => (
            <div className="field" key={key}>
              <label htmlFor={`dash-${key}`}>{label}</label>
              <input
                id={`dash-${key}`}
                type="month"
                value={filters[key]}
                onChange={(e) => update(key, e.target.value)}
              />
            </div>
          ))}
          {selectedLabels.map(({ key, label, values }) => (
            <div className="field" key={key}>
              <label htmlFor={`dash-${key}`}>{label}</label>
              <select
                id={`dash-${key}`}
                value={filters[key]}
                onChange={(e) => update(key, e.target.value)}
              >
                <option value="">
                  {key === "supplierId"
                    ? "Todos os fornecedores"
                    : key === "unitId"
                      ? "Todas as unidades"
                      : "Todas as categorias"}
                </option>
                {values.map((row) => (
                  <option value={row.id} key={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="dash-filter-bottom">
          <div className="dash-filter-chips">
            {selectedLabels
              .filter(({ key }) => filters[key])
              .map(({ key, label, values }) => (
                <button
                  key={key}
                  onClick={() => update(key, "")}
                  aria-label={`Remover filtro de ${label.toLocaleLowerCase("pt-BR")}`}
                >
                  {label}:{" "}
                  {values.find((row) => row.id === filters[key])?.name ||
                    "Não informado"}{" "}
                  <span aria-hidden="true">×</span>
                </button>
              ))}
            <button
              className="dash-text-button"
              onClick={() => {
                onFilters(dashboardDefaults(data.businessDate));
                setQueueKind("all");
                setFocusedMonth(null);
              }}
            >
              Restaurar filtros
            </button>
          </div>
          <button disabled={refreshing} onClick={onRefresh}>
            {refreshing ? "Atualizando…" : "↻ Atualizar dados"}
          </button>
        </div>
      </section>
      {computed.error ? (
        <p className="banner error" role="alert">
          {computed.error}
        </p>
      ) : (
        board && (
          <>
            <div className="dash-summary-line">
              <p>
                <strong>{board.confirmed.length}</strong> medições conferidas ·{" "}
                <strong>{board.contracts.length}</strong> contratos no recorte
              </p>
              <small>
                {updatedAt
                  ? `Atualizado às ${updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                  : `Posição em ${brDate(data.businessDate)}`}
              </small>
            </div>
            <div className="dash-kpis">
              {[
                {
                  kind: "plan",
                  label: "Previsto no período",
                  value: board.planned,
                  note: `${board.forecasts.length} competências de contratos ativados`,
                  help: "Soma das previsões não canceladas de contratos que já foram ativados. Previsões em elaboração ficam separadas. A seleção considera a competência, não a data do vencimento.",
                },
                {
                  kind: "confirmed",
                  label: "Valor conferido",
                  value: board.actual,
                  note: `${board.confirmed.length} medições, incluindo avulsas e complementos`,
                  help: "Soma somente medições na situação Conferida. Medições em preenchimento ou canceladas não entram. Reabertura retira o valor até uma nova conferência.",
                },
                {
                  kind: "draft",
                  label: "Em preenchimento",
                  value: board.draftAmount,
                  note: `${board.drafts.length} medições aguardando conferência`,
                  help: "Valor das medições em preenchimento, incluindo complementos e despesas avulsas. Ainda não compõe o valor conferido.",
                  action: () => review("draft"),
                  actionLabel: "Revisar medições",
                },
                {
                  kind: "missing",
                  label: "Sem lançamento",
                  value: board.missingAmount,
                  note: `${board.missing.length} previsões sem medição principal`,
                  help: "Previsões de contratos ativados que ainda não têm medição principal válida. Uma principal em preenchimento já conta como lançamento. Complementos não substituem a principal.",
                  action: () => review("missing"),
                  actionLabel: "Ver previsões pendentes",
                },
              ].map((card) => (
                <article
                  className={`dash-kpi ${card.kind}`}
                  key={card.kind}
                  aria-label={card.label}
                >
                  <div className="dash-kpi-label">
                    <span>
                      {card.label}
                      <ColumnHelp label={card.label} text={card.help} />
                    </span>
                    <Icon kind={card.kind} />
                  </div>
                  <strong className="dash-kpi-value">
                    {money(card.value)}
                  </strong>
                  <p>{card.note}</p>
                  {card.action && (
                    <button className="dash-text-button" onClick={card.action}>
                      {card.actionLabel} <span aria-hidden="true">→</span>
                    </button>
                  )}
                </article>
              ))}
            </div>

            <div className="dash-primary-grid">
              <section className="panel dash-trend">
                <div className="panel-title">
                  <div>
                    <h2>Previsto × conferido</h2>
                    <p className="dash-panel-caption">
                      Evolução por competência · selecione um mês para detalhar
                    </p>
                  </div>
                  <div className="dash-legend">
                    <span>
                      <i className="planned" />
                      Previsto
                    </span>
                    <span>
                      <i className="confirmed" />
                      Conferido
                    </span>
                  </div>
                </div>
                <div className="dash-chart-scroll">
                  <div
                    className="dash-chart"
                    style={{
                      minWidth:
                        board.months.length > 12
                          ? board.months.length * 52
                          : undefined,
                    }}
                    aria-label="Evolução mensal de valores previstos e conferidos"
                  >
                    {board.timeline.map((row) => (
                      <button
                        key={row.month}
                        className={`dash-chart-month ${detail?.month === row.month ? "selected" : ""}`}
                        onClick={() => setFocusedMonth(row.month)}
                        aria-pressed={detail?.month === row.month}
                        aria-label={`${monthName(row.month)}: previsto ${money(row.planned)}; ${row.actual === null ? "sem conferência" : `conferido ${money(row.actual)}`}. Detalhar competência.`}
                      >
                        <span className="dash-bar-pair" aria-hidden="true">
                          <span
                            className="dash-chart-bar planned"
                            style={{
                              height: `${percent(cents(row.planned), trendMax)}%`,
                            }}
                          />
                          <span
                            className={`dash-chart-bar ${row.actual === null ? "absent" : "confirmed"}`}
                            style={{
                              height:
                                row.actual === null
                                  ? 0
                                  : `${percent(cents(row.actual), trendMax)}%`,
                            }}
                          />
                        </span>
                        <strong>
                          {monthName(row.month, true)
                            .split(" de ")[0]
                            .replace(".", "")}
                        </strong>
                        <small>{row.month.slice(0, 4)}</small>
                        {row.actual === null && (
                          <span className="dash-month-absent">
                            Sem conferência
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                {detail && (
                  <div className="dash-month-detail" aria-live="polite">
                    <div>
                      <strong>{monthName(detail.month)}</strong>
                      <span>
                        Previsto <b>{money(detail.planned)}</b>
                      </span>
                      <span>
                        Conferido{" "}
                        <b>
                          {detail.actual === null
                            ? "Sem conferência"
                            : money(detail.actual)}
                        </b>
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        onFilters({
                          ...filters,
                          from: detail.month,
                          to: detail.month,
                        });
                      }}
                    >
                      Analisar este mês →
                    </button>
                  </div>
                )}
                <p className="dash-footnote">
                  Meses sem conferência indicam ausência de lançamentos
                  concluídos, não custo zero.
                </p>
              </section>

              <section className="panel dash-closing">
                <div className="panel-title">
                  <h2>Fechamento do período</h2>
                  <ColumnHelp
                    label="Fechamento do período"
                    text="Quantidade de previsões com medição principal conferida dividida pelo total de previsões de contratos ativados. Avulsas e complementos não aumentam esse percentual."
                  />
                </div>
                <div className="dash-closing-main">
                  <div
                    className="dash-ring"
                    role="img"
                    aria-label={`${board.closing.reviewed} de ${board.closing.total} competências conferidas`}
                    style={{
                      background: `conic-gradient(#0f6b46 0 ${board.closing.percent}%, #b16c08 ${board.closing.percent}% ${board.closing.percent + percent(board.closing.drafts, board.closing.total)}%, #e7edf3 0 100%)`,
                    }}
                  >
                    <div aria-hidden="true">
                      <strong>
                        {board.closing.total
                          ? percentage(board.closing.percent)
                          : "—"}
                      </strong>
                      <span>conferido</span>
                    </div>
                  </div>
                  <ul className="dash-closing-legend">
                    <li>
                      <i className="confirmed" />
                      <span>Conferidas</span>
                      <strong>{board.closing.reviewed}</strong>
                    </li>
                    <li>
                      <i className="draft" />
                      <span>Em preenchimento</span>
                      <strong>{board.closing.drafts}</strong>
                    </li>
                    <li>
                      <i className="missing" />
                      <span>Sem lançamento</span>
                      <strong>{board.closing.missing}</strong>
                    </li>
                  </ul>
                </div>
                <div className="dash-comparison">
                  <span>
                    Desvio nas competências conferidas
                    <ColumnHelp
                      label="Desvio nas competências conferidas"
                      text="Compara a previsão apenas com sua principal conferida e os respectivos complementos conferidos. Avulsas, competências sem conferência e valores sem previsão comparável ficam fora. Um valor abaixo do previsto não comprova economia."
                    />
                  </span>
                  {board.comparison.count ? (
                    <>
                      <strong
                        className={
                          cents(board.comparison.variance) > 0n
                            ? "above"
                            : "below"
                        }
                      >
                        {cents(board.comparison.variance) > 0n ? "+ " : ""}
                        {money(board.comparison.variance)}
                      </strong>
                      <small>
                        {board.comparison.percent === null
                          ? "Base prevista zerada"
                          : board.comparison.percent === 0
                            ? "Em linha com o previsto"
                            : `${percentage(Math.abs(board.comparison.percent))} ${board.comparison.percent > 0 ? "acima" : "abaixo"} do previsto`}{" "}
                        · {board.comparison.count} competências comparáveis
                      </small>
                    </>
                  ) : (
                    <p>
                      A comparação aparece após conferir uma principal vinculada
                      a uma previsão.
                    </p>
                  )}
                </div>
              </section>
            </div>

            <div className="dash-two-grid">
              <section className="panel">
                <div className="panel-title">
                  <div>
                    <h2>Maiores fornecedores</h2>
                    <p className="dash-panel-caption">
                      Participação no valor conferido · clique para filtrar
                    </p>
                  </div>
                </div>
                <Ranking
                  rows={board.suppliers}
                  label="Fornecedores por valor conferido"
                  selected={filters.supplierId}
                  onSelect={(value) => update("supplierId", value)}
                />
                {board.suppliers[0] && (
                  <p className="dash-insight">
                    <strong>{percentage(board.suppliers[0].share)}</strong> do
                    valor conferido está concentrado no maior fornecedor.
                  </p>
                )}
              </section>
              <section className="panel">
                <div className="panel-title">
                  <div>
                    <h2>Custos por categoria</h2>
                    <p className="dash-panel-caption">
                      Somente medições conferidas · clique para filtrar
                    </p>
                  </div>
                </div>
                <Ranking
                  rows={board.categories}
                  label="Categorias por valor conferido"
                  selected={filters.categoryId}
                  onSelect={(value) => update("categoryId", value)}
                />
              </section>
            </div>

            <div className="dash-two-grid">
              <section className="panel">
                <div className="panel-title">
                  <div>
                    <h2>Onde o custo foi alocado</h2>
                    <p className="dash-panel-caption">
                      Distribuição preservada na conferência
                    </p>
                  </div>
                  <div
                    className="dash-segments"
                    role="group"
                    aria-label="Agrupamento dos custos"
                  >
                    <button
                      aria-pressed={distribution === "units"}
                      onClick={() => setDistribution("units")}
                    >
                      Unidades
                    </button>
                    <button
                      aria-pressed={distribution === "centers"}
                      onClick={() => setDistribution("centers")}
                    >
                      Centros de custo
                    </button>
                  </div>
                </div>
                <Ranking
                  key={distribution}
                  rows={
                    distribution === "units"
                      ? board.beneficiaryUnits
                      : board.costCenters
                  }
                  label="Distribuição histórica dos custos"
                />
                <p className="dash-footnote">
                  Unidade beneficiada pelo rateio; pode ser diferente da unidade
                  faturada selecionada no filtro.
                </p>
                {board.missingDistribution > 0 && (
                  <p className="notice">
                    {board.missingDistribution} medições sem distribuição
                    histórica íntegra foram agrupadas separadamente.
                  </p>
                )}
              </section>
              <section className="panel dash-alerts">
                <div className="panel-title">
                  <div>
                    <h2>Atenção aos contratos</h2>
                    <p className="dash-panel-caption">
                      Vigência e reajuste · posição em{" "}
                      {brDate(data.businessDate)}
                    </p>
                  </div>
                  <span className="dash-count">{board.alerts.length}</span>
                </div>
                {board.alerts.length ? (
                  <ul>
                    {board.alerts
                      .slice(0, allAlerts ? board.alerts.length : 5)
                      .map((alert) => (
                        <li key={alert.id}>
                          <span
                            className={`dash-alert-marker ${alert.days < 0 ? "critical" : ""}`}
                            aria-hidden="true"
                          >
                            {alert.days < 0 ? "!" : "◷"}
                          </span>
                          <div>
                            <button
                              className="dash-text-button"
                              onClick={() => onOpenContract(alert.contract)}
                            >
                              {alert.contract.code} · {alert.contract.name}
                            </button>
                            <span>
                              {alert.kind} · {brDate(alert.date)}
                            </span>
                            <small className={alert.days < 0 ? "error" : ""}>
                              {alert.days < 0
                                ? `Data ultrapassada há ${Math.abs(alert.days)} dias`
                                : alert.days === 0
                                  ? "Data prevista para hoje"
                                  : `Em ${alert.days} dias`}
                            </small>
                          </div>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="dash-empty">
                    Nenhum alerta de vigência ou reajuste para os contratos
                    deste recorte.
                  </p>
                )}
                {board.alerts.length > 5 && (
                  <button
                    className="dash-text-button"
                    onClick={() => setAllAlerts(!allAlerts)}
                  >
                    {allAlerts
                      ? "Mostrar os 5 primeiros alertas"
                      : `Ver todos os ${board.alerts.length} alertas`}
                  </button>
                )}
                <button className="dash-text-button" onClick={onContracts}>
                  Ver carteira de contratos →
                </button>
                <div className="dash-portfolio">
                  {board.contractStatuses
                    .filter((row) => row.count)
                    .map((row) => (
                      <span key={row.status}>
                        <strong>{row.count}</strong> {statusLabels[row.status]}
                      </span>
                    ))}
                </div>
                <p className="dash-footnote">
                  Situações atuais dos contratos com vigência no período. Os
                  alertas respeitam a antecedência de cada contrato.
                </p>
              </section>
            </div>

            <section
              className="panel dash-worklist"
              ref={worklist}
              aria-label="Pendências do fechamento"
            >
              <div className="panel-title">
                <div>
                  <h2>Pendências do fechamento</h2>
                  <p className="dash-panel-caption">
                    Ordenadas pelo vencimento registrado, do mais antigo ao mais
                    próximo
                  </p>
                </div>
                <div
                  className="dash-segments"
                  role="group"
                  aria-label="Tipo de pendência"
                >
                  {[
                    ["all", "Todas", board.queue.length],
                    ["draft", "Em preenchimento", board.drafts.length],
                    ["missing", "Sem lançamento", board.missing.length],
                  ].map(([key, label, count]) => (
                    <button
                      key={key}
                      aria-pressed={queueKind === key}
                      onClick={() => setQueueKind(String(key))}
                    >
                      {label} <span>{count}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Table
                pageSize={8}
                rows={board.queue.filter(
                  (row) => queueKind === "all" || row.kind === queueKind,
                )}
                columns={[
                  {
                    label: "Registro",
                    value: (row) => (
                      <>
                        <strong>{row.code}</strong>
                        <small className="measurement-subtext">
                          {row.kind === "draft"
                            ? "Em preenchimento"
                            : "Sem lançamento"}
                        </small>
                      </>
                    ),
                  },
                  {
                    label: "Fornecedor / contrato",
                    value: (row) => (
                      <>
                        <span>{row.supplier}</span>
                        <small className="measurement-subtext">
                          {row.name}
                        </small>
                      </>
                    ),
                  },
                  {
                    label: "Competência",
                    value: (row) =>
                      monthKey(row.month).split("-").reverse().join("/"),
                  },
                  { label: "Valor (R$)", value: (row) => money(row.amount) },
                  {
                    label: "Vencimento",
                    help: "Vencimento da previsão ou da fatura, usado para ordenar a revisão dos lançamentos.",
                    value: (row) => brDate(row.due),
                  },
                  {
                    label: "Ações",
                    value: (row) => (
                      <button
                        onClick={() =>
                          row.measurement
                            ? onOpenMeasurement(row.id)
                            : row.contract.status === "VIGENTE"
                              ? onCreateMeasurement(row.forecast)
                              : onOpenContract(row.contract)
                        }
                      >
                        {row.measurement
                          ? "Abrir medição"
                          : row.contract.status === "VIGENTE"
                            ? "Lançar medição"
                            : "Ver contrato"}
                      </button>
                    ),
                  },
                ]}
              />
            </section>
            <details className="dash-method">
              <summary>Como ler os indicadores</summary>
              <div>
                <p>
                  O período considera a competência dos lançamentos. Somente{" "}
                  <strong>Conferida</strong> compõe os valores e rankings.
                  Canceladas ({board.cancelled}) ficam fora das somas. O filtro
                  de unidade considera a unidade faturada.
                </p>
                <p>
                  <strong>Avulsas conferidas:</strong>{" "}
                  {money(board.avulsaAmount)}.{" "}
                  <strong>Complementos conferidos:</strong>{" "}
                  {money(board.complementAmount)}. Esses valores já estão
                  incluídos no valor conferido, sem somar novamente.
                </p>
                <p>
                  <strong>Sem previsão comparável:</strong>{" "}
                  {money(board.comparison.outside)} do conferido fica fora do
                  cálculo de desvio. <strong>Previsões em elaboração:</strong>{" "}
                  {money(board.provisionalAmount)} ({board.provisional.length}{" "}
                  competências), separadas do previsto de contratos ativados.
                </p>
              </div>
            </details>
          </>
        )
      )}
    </div>
  );
}
