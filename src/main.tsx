import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, ApiError, setCsrf, brDate, money, civil } from "./api";
import { branding } from "./config";
import { Editor } from "./Editor";
import { forms, labels } from "./forms";
import { Table, Column } from "./Table";
import { orderVacationPeriods } from "./vacationOrder";
import { ContractsModule } from "./contracts/Module";
import { StorageSetup, getStorageStatus, StorageStatus } from "./StorageSetup";
import "./style.css";
type User = { id: string; username: string; role: string };
const badge = (value: string) => {
  const concessionDays = /^Prazo concessivo: até (\d+) dias$/.exec(value);
  const severity =
    value === "Prazo ultrapassado com saldo"
      ? "critical"
      : concessionDays && Number(concessionDays[1]) <= 90
        ? "deadline-warning"
        : /Revis|conflito/i.test(value)
          ? "warning"
          : "";
  return <span className={"badge " + severity}>{labels[value] || value}</span>;
};
const name = (r: any) =>
  r.person?.name ||
  r.employment?.person?.name ||
  r.period?.employment?.person?.name ||
  r.name;
const columns: Record<string, Column[]> = {
  units: [
    { label: "Código", value: (r) => r.code },
    { label: "Unidade", value: (r) => r.name },
    { label: "Tipo", value: (r) => labels[r.kind] },
    {
      label: "Cidade / UF",
      value: (r) => [r.city, r.state].filter(Boolean).join(" / "),
    },
    { label: "Situação", value: (r) => badge(r.active ? "Ativo" : "Inativo") },
  ],
  "cost-centers": [
    { label: "Código", value: (r) => r.code },
    { label: "Descrição", value: (r) => r.name },
    { label: "Unidades permitidas", value: (r) => r.units.length },
    { label: "Situação", value: (r) => badge(r.active ? "Ativo" : "Inativo") },
  ],
  lookups: [
    { label: "Categoria", value: (r) => labels[r.kind] },
    { label: "Nome", value: (r) => r.name },
    { label: "Identificador", value: (r) => r.tag },
    { label: "Situação", value: (r) => badge(r.active ? "Ativo" : "Inativo") },
  ],
  people: [
    { label: "Nome", value: (r) => r.name },
    { label: "CPF", value: (r) => r.cpf },
    { label: "Nascimento", value: (r) => brDate(r.birthDate) },
    {
      label: "Situação",
      value: (r) => badge(r.archived ? "Arquivado" : "Disponível"),
    },
  ],
  dependents: [
    { label: "Dependente", value: (r) => r.name },
    { label: "Titular", value: (r) => r.person?.name },
    { label: "Parentesco", value: (r) => r.relationship?.name },
    { label: "Nascimento", value: (r) => brDate(r.birthDate) },
    { label: "IR informado", value: (r) => (r.incomeTax ? "Sim" : "Não") },
    { label: "Situação", value: (r) => badge(r.active ? "Ativo" : "Inativo") },
  ],
  benefits: [
    { label: "Código", value: (r) => r.code },
    { label: "Benefício", value: (r) => r.name },
    { label: "Tipo", value: (r) => labels[r.kind] },
    { label: "Fornecedor", value: (r) => r.provider },
    { label: "Plano", value: (r) => r.plan },
    { label: "Situação", value: (r) => badge(r.active ? "Ativo" : "Inativo") },
  ],
  enrollments: [
    { label: "Titular", value: name },
    { label: "Benefício", value: (r) => r.benefit?.name },
    {
      label: "Plano",
      value: (r) =>
        (r.benefit?.kind === "SAUDE" ? r.plan : r.benefit?.plan) ||
        "Não informado",
    },
    { label: "Pessoa coberta", value: (r) => r.dependent?.name || "Titular" },
    { label: "Inclusão", value: (r) => brDate(r.start) },
    { label: "Exclusão", value: (r) => brDate(r.end) },
    { label: "Custo da empresa (R$)", value: (r) => money(r.companyCost) },
  ],
  leaves: [
    { label: "Colaborador", value: name },
    { label: "Tipo", value: (r) => r.type?.name },
    { label: "Início", value: (r) => brDate(r.start) },
    { label: "Fim previsto", value: (r) => brDate(r.expectedEnd) },
    { label: "Fim efetivo", value: (r) => brDate(r.actualEnd) },
    { label: "Revisão", value: (r) => (r.review ? "Pendente" : "Revisado") },
  ],
  periods: [
    { label: "Colaborador", value: name },
    {
      label: "Aquisitivo",
      value: (r) => `${brDate(r.start)} a ${brDate(r.end)}`,
    },
    { label: "Fim concessivo", value: (r) => brDate(r.concessionEnd) },
    {
      label: "Data limite",
      value: (r) => (
        <span title="Data definida pela empresa para concluir o gozo das férias.">
          {brDate(r.target)}
        </span>
      ),
    },
    { label: "Direito", value: (r) => r.balance?.entitlement },
    { label: "Gozados", value: (r) => r.balance?.used },
    { label: "Reservados", value: (r) => r.balance?.reserved },
    { label: "Abono", value: (r) => r.balance?.allowance },
    { label: "Ajustes", value: (r) => r.balance?.adjustment },
    {
      label: "Disponível",
      value: (r) => <strong>{r.balance?.available}</strong>,
    },
    { label: "Não usufruído", value: (r) => r.balance?.notEnjoyed },
    { label: "Condição", value: (r) => badge(r.indicator) },
  ],
  bookings: [
    { label: "Colaborador", value: name },
    { label: "Início", value: (r) => brDate(r.start) },
    { label: "Dias corridos", value: (r) => r.days },
    { label: "Fim inclusivo", value: (r) => brDate(r.end) },
    { label: "Retorno (previsão)", value: (r) => brDate(r.returnDate) },
    { label: "Situação", value: (r) => badge(r.status) },
  ],
  adjustments: [
    { label: "Período (ID)", value: (r) => r.periodId },
    { label: "Tipo", value: (r) => labels[r.kind] },
    { label: "Dias", value: (r) => r.days },
    { label: "Justificativa", value: (r) => r.reason },
    { label: "Registrado", value: (r) => brDate(r.createdAt) },
  ],
  audit: [
    { label: "Data", value: (r) => new Date(r.at).toLocaleString("pt-BR") },
    { label: "Autor", value: (r) => r.user.username },
    { label: "Ação", value: (r) => r.action },
    { label: "Cadastro", value: (r) => r.entity },
    { label: "Registro", value: (r) => r.entityId },
    { label: "Campos alterados", value: (r) => r.fields.join(", ") },
  ],
};
function Brand() {
  const [failed, setFailed] = useState(false);
  return (
    <div className="brand">
      {branding.logoUrl && !failed ? (
        <img
          src={branding.logoUrl}
          alt={branding.name}
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <strong>
            Middleby<span>do Brasil</span>
          </strong>
          <small>GESTÃO DE PESSOAS</small>
        </>
      )}
    </div>
  );
}
function Login({
  onLogin,
  onStorage,
  fileMode,
}: {
  onLogin: (u: User) => void;
  onStorage: () => void;
  fileMode: boolean;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <div className="login-card">
        <section>
          <Brand />
          <p className="eyebrow">ACESSO LOCAL · RECURSOS HUMANOS</p>
          <h1>
            Pessoas bem cuidadas.
            <br />
            Gestão bem organizada.
          </h1>
          <p>Cadastros, benefícios e férias em um só lugar.</p>
        </section>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const data = new FormData(e.currentTarget);
            try {
              const r = await api("/login", "POST", Object.fromEntries(data));
              setCsrf(r.csrf);
              onLogin(r.user);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Entrar no sistema</h2>
          <p>Use seu usuário cadastrado pelo administrador.</p>
          <label>
            Usuário
            <input autoFocus name="username" autoComplete="username" required />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
          <small>
            {fileMode
              ? "Conectado à base em arquivo selecionada."
              : "Conectado ao PostgreSQL configurado."}
          </small>
          <button type="button" onClick={onStorage}>
            Alterar base de dados
          </button>
        </form>
      </div>
    </main>
  );
}
function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeModule, setActiveModule] = useState<"rh" | "contracts" | null>(
    null,
  );
  const [signingOut, setSigningOut] = useState(false);
  const [boot, setBoot] = useState(true);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [configureStorage, setConfigureStorage] = useState(false);
  const [screen, setScreen] = useState("Visão geral");
  const [resource, setResource] = useState("units");
  const [benefitCatalog, setBenefitCatalog] = useState<any[]>([]);
  const [selectedBenefitId, setSelectedBenefitId] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [editor, setEditor] = useState<{
    resource: string;
    initial?: any;
  } | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [tab, setTab] = useState("Dados pessoais");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState("");
  const [unit, setUnit] = useState("");
  const [center, setCenter] = useState("");
  const [department, setDepartment] = useState("");
  const [condition, setCondition] = useState("");
  const [manager, setManager] = useState("");
  const [deadline, setDeadline] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [month, setMonth] = useState(
    new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit" })
      .format(new Date())
      .slice(0, 7),
  );
  const [logoError] = useState(false);
  const rh = user?.role === "RH";
  useEffect(() => {
    if (!user || activeModule !== "rh") return;
    const timer = setInterval(() => setRefresh((n) => n + 1), 60000);
    return () => clearInterval(timer);
  }, [user, activeModule]);
  async function openSession() {
    setBoot(true);
    try {
      const current = await getStorageStatus();
      setStorage(current);
      if (!current.ready || current.needsChoice) {
        setConfigureStorage(true);
        return;
      }
      setConfigureStorage(false);
      const r = await api("/me");
      setUser(r.user);
      setCsrf(r.csrf);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401))
        setConfigureStorage(true);
    } finally {
      setBoot(false);
    }
  }
  useEffect(() => {
    void openSession();
    const unavailable = () => {
      setUser(null);
      setActiveModule(null);
      setCsrf("");
      setStorage(null);
      setConfigureStorage(true);
    };
    window.addEventListener("storage-unavailable", unavailable);
    return () => window.removeEventListener("storage-unavailable", unavailable);
  }, []);
  useEffect(() => {
    if (!user || activeModule !== "rh") return;
    let disposed = false;
    setLoading(true);
    setError("");
    Promise.all([
      api("/professional"),
      api("/dashboard" + (from && to ? `?from=${from}&to=${to}` : "")),
      rh &&
      resource !== "calendar" &&
      screen !== "Visão geral" &&
      screen !== "Colaboradores" &&
      screen !== "Configurações"
        ? api("/data/" + resource)
        : rh && screen === "Colaboradores"
          ? api("/data/employments")
          : Promise.resolve([]),
      rh && screen === "Benefícios"
        ? api("/data/benefits")
        : Promise.resolve([]),
    ])
      .then(([emps, dash, data, catalog]) => {
        if (!disposed) {
          setEmployees(emps);
          setDashboard(dash);
          setRows(data);
          setBenefitCatalog(catalog);
          if (screen === "Colaboradores")
            setSelected((current: any) => {
              if (!current) return null;
              const latest = (rh ? data : emps).find(
                (e: any) => e.id === current.id,
              );
              return latest
                ? {
                    ...latest,
                    condition: emps.find((e: any) => e.id === current.id)
                      ?.condition,
                  }
                : current;
            });
        }
      })
      .catch((e) => {
        if (!disposed) {
          setError(e.message);
          if (e instanceof ApiError && e.status === 401) {
            setUser(null);
            setActiveModule(null);
            setSelected(null);
            setRows([]);
            setEmployees([]);
            setScreen("Visão geral");
          }
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [user, activeModule, screen, resource, refresh, from, to]);
  function navigate(s: string) {
    setSelectedBenefitId("");
    if (s !== screen) {
      setRows([]);
      setLoading(true);
    }
    setScreen(s);
    setSelected(null);
    setSearch("");
    setUnit("");
    setCenter("");
    setDepartment("");
    setCondition("");
    setManager("");
    setDeadline("");
    setResource(
      (
        {
          Férias: "periods",
          Dependentes: "dependents",
          Benefícios: "benefits",
          Cadastros: "units",
        } as Record<string, string>
      )[s] || "units",
    );
  }
  const edit = (r: string, initial?: any) =>
    setEditor({ resource: r, initial });
  const selectedBenefit = benefitCatalog.find(
    (b) => b.id === selectedBenefitId,
  );
  const visibleRows =
    screen === "Benefícios" && resource === "enrollments" && selectedBenefitId
      ? rows.filter((r) => r.benefitId === selectedBenefitId)
      : rows;
  const filters = (list: any[]) =>
    list.filter((r) => {
      const e = r.employment || r;
      return (
        (!unit || e.unit?.id === unit) &&
        (!center || e.costCenter?.id === center) &&
        (!department || e.department?.name === department) &&
        (!manager || e.manager?.id === manager) &&
        (!condition ||
          (r.condition?.label || r.status || r.indicator || "") ===
            condition) &&
        (!deadline ||
          (r.concessionEnd &&
            civil(r.concessionEnd) <= deadline &&
            r.balance?.notEnjoyed > 0)) &&
        (!search ||
          [
            name(r),
            r.registration,
            e.registration,
            r.person?.cpf,
            r.name,
            r.code,
            r.benefit?.name,
            r.period?.employment?.person?.name,
          ]
            .join(" ")
            .toLocaleLowerCase("pt-BR")
            .includes(search.toLocaleLowerCase("pt-BR")))
      );
    });
  const filterControls = (list: any[], professional = false) => (
    <div className="filters">
      <label className="search">
        Buscar
        <input
          placeholder={
            professional
              ? "Nome, matrícula" + (rh ? " ou CPF" : "")
              : "Buscar registros"
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {professional && (
        <>
          <label>
            Unidade
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">Todas as unidades</option>
              {unique(employees.map((e) => e.unit)).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Centro de custos
            <select value={center} onChange={(e) => setCenter(e.target.value)}>
              <option value="">Todos os centros</option>
              {unique(employees.map((e) => e.costCenter)).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Departamento
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">Todos</option>
              {[...new Set(employees.map((e) => e.department.name))].map(
                (x) => (
                  <option key={x}>{x}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Condição / situação
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            >
              <option value="">Todas</option>
              {[
                ...new Set(
                  list
                    .map((r) => r.condition?.label || r.status || r.indicator)
                    .filter(Boolean),
                ),
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {screen === "Férias" && resource === "periods" && (
        <>
          <label>
            Gestor
            <select
              value={manager}
              onChange={(e) => setManager(e.target.value)}
            >
              <option value="">Todos</option>
              {unique(
                rows.map((r) => r.employment?.manager).filter(Boolean),
              ).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.person?.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prazo até
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
        </>
      )}
      <button
        onClick={() => {
          setSearch("");
          setUnit("");
          setCenter("");
          setDepartment("");
          setCondition("");
          setManager("");
          setDeadline("");
        }}
      >
        Limpar filtros
      </button>
    </div>
  );
  const employeeColumns: Column[] = [
    { label: "Colaborador", value: (r) => <strong>{r.person?.name}</strong> },
    { label: "Matrícula", value: (r) => r.registration },
    { label: "Unidade", value: (r) => r.unit.name },
    { label: "Centro de custos", value: (r) => r.costCenter.name },
    { label: "Cargo", value: (r) => r.job.name },
    { label: "Admissão", value: (r) => brDate(r.admission) },
    {
      label: "Condição atual",
      value: (r) => (
        <>
          {badge(r.condition?.label || "")}
          {r.condition?.conflict && badge("Conflito de ausências")}
        </>
      ),
    },
  ];
  const employeeRows = rh
    ? rows.map((r) => ({
        ...r,
        condition: employees.find((e) => e.id === r.id)?.condition,
      }))
    : employees;
  const allBookings = employees.flatMap((e) => [
    ...(e.absences || []).map((a: any) => ({
      ...a,
      employeeName: e.person.name,
      unitName: e.unit.name,
      team: e.department.name,
      employmentId: e.id,
      status: "Afastamento / licença",
      end: a.end || "9999-12-31",
      days: null,
    })),
    ...e.periods.flatMap((p: any) =>
      p.bookings
        .filter((b: any) =>
          ["APROVADA", "EM_ANDAMENTO", "CONCLUIDA"].includes(b.status),
        )
        .map((b: any) => ({
          ...b,
          employeeName: e.person.name,
          unitName: e.unit.name,
          team: e.department.name,
          employmentId: e.id,
        })),
    ),
  ]);
  const saved = () => {
    setEditor(null);
    setRefresh((n) => n + 1);
    if (selected) {
      setSelected(null);
      setScreen("Colaboradores");
    }
  };
  if (boot) return <main className="boot">Carregando sessão…</main>;
  if (configureStorage)
    return (
      <StorageSetup
        brand={<Brand />}
        initial={storage}
        onReady={() => window.location.reload()}
        onCancel={
          storage?.ready && !storage.needsChoice
            ? () => setConfigureStorage(false)
            : undefined
        }
      />
    );
  async function logout() {
    setSigningOut(true);
    setError("");
    try {
      await api("/logout", "POST");
      setUser(null);
      setActiveModule(null);
      setSelected(null);
      setRows([]);
      setEmployees([]);
      setDashboard(null);
      setScreen("Visão geral");
      setCsrf("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setActiveModule(null);
        setCsrf("");
      } else setError((e as Error).message);
    } finally {
      setSigningOut(false);
    }
  }
  if (!user)
    return (
      <Login
        fileMode={storage?.mode === "file"}
        onStorage={() => setConfigureStorage(true)}
        onLogin={(u) => {
          setActiveModule(null);
          setError("");
          setUser(u);
        }}
      />
    );
  if (!activeModule)
    return (
      <div className="module-selection">
        <header className="module-header">
          <Brand />
          <div>
            <span>
              {user.username}
              <small>{rh ? "RH administrador" : "Consulta"}</small>
            </span>
            <button disabled={signingOut} onClick={logout}>
              {signingOut ? "Saindo…" : "Sair"}
            </button>
          </div>
        </header>
        <main className="module-main">
          <p className="eyebrow">MIDDLEBY DO BRASIL · GESTÃO EMPRESARIAL</p>
          <h1>Selecione um módulo</h1>
          <p className="module-intro">Escolha a área que deseja acessar.</p>
          {error && (
            <p className="banner error" role="alert">
              {error}
            </p>
          )}
          <div className="module-grid">
            <section className="module-card">
              <span className="badge">Disponível</span>
              <h2>Recursos Humanos</h2>
              <p>Colaboradores, dependentes, benefícios e férias.</p>
              <button
                className="primary"
                onClick={() => {
                  navigate("Visão geral");
                  setLoading(true);
                  setError("");
                  setActiveModule("rh");
                }}
              >
                Acessar Recursos Humanos →
              </button>
            </section>
            <section className="module-card" aria-labelledby="contracts-title">
              <span className="badge">
                {rh ? "Disponível · Primeira etapa" : "Acesso restrito"}
              </span>
              <h2 id="contracts-title">Contratos e Medições</h2>
              <p>Contratos, itens e previsões mensais de cobrança.</p>
              {rh ? (
                <button
                  className="primary"
                  onClick={() => {
                    setError("");
                    setActiveModule("contracts");
                  }}
                >
                  Acessar Contratos e Medições →
                </button>
              ) : (
                <small>Acesso restrito ao RH administrador.</small>
              )}
            </section>
          </div>
          <p className="module-footer">
            <span className="local-dot" /> Ambiente local · Seus dados
            permanecem no servidor da empresa.
          </p>
        </main>
      </div>
    );
  if (activeModule === "contracts" && rh)
    return (
      <ContractsModule
        user={user}
        brand={<Brand />}
        onBack={() => setActiveModule(null)}
        onLogout={logout}
        signingOut={signingOut}
      />
    );
  return (
    <div className="shell">
      <aside>
        <Brand />
        <div className="workspace-label">PAINEL DO RH</div>
        <nav aria-label="Menu principal">
          {[
            "Visão geral",
            "Colaboradores",
            "Férias",
            ...(rh
              ? ["Dependentes", "Benefícios", "Cadastros", "Configurações"]
              : []),
          ].map((s, i) => (
            <button
              key={s}
              className={screen === s ? "nav-active" : ""}
              onClick={() => navigate(s)}
            >
              <span aria-hidden="true">
                {["◫", "♙", "▦", "♧", "◇", "▤", "⚙"][i]}
              </span>
              {s}
            </button>
          ))}
        </nav>
        <div className="aside-footer">
          <span className="local-dot" /> Ambiente local
          <br />
          <small>Middleby do Brasil · RH</small>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <span>
            Middleby do Brasil <b>/</b> Recursos Humanos
          </span>
          <div>
            <button
              onClick={() => {
                setEditor(null);
                setSelected(null);
                setRows([]);
                setEmployees([]);
                setDashboard(null);
                setError("");
                setActiveModule(null);
              }}
            >
              Trocar módulo
            </button>
            <span>
              {user.username}{" "}
              <small>{rh ? "RH administrador" : "Consulta"}</small>
            </span>
            <button disabled={signingOut} onClick={logout}>
              Sair
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">GESTÃO DE PESSOAS</p>
              <h1>{selected ? "Ficha do colaborador" : screen}</h1>
              <p>
                {selected
                  ? `${selected.person.name} · Matrícula ${selected.registration}`
                  : (
                      {
                        "Visão geral":
                          "Acompanhe a equipe e as próximas ações do RH.",
                        Colaboradores:
                          "Pessoas, vínculos e histórico profissional.",
                        Férias: "Períodos aquisitivos, programação e gozo.",
                        Dependentes:
                          "Cadastro familiar independente de benefícios e enquadramento fiscal.",
                        Benefícios:
                          "Catálogo de benefícios e pessoas cobertas.",
                        Cadastros:
                          "Estrutura organizacional e cadastros de apoio.",
                        Configurações: "Empresa, alertas e rastreabilidade.",
                      } as any
                    )[screen]}
              </p>
            </div>
            <span className="today">
              {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(
                new Date(),
              )}
            </span>
          </div>
          {error && (
            <div className="banner error" role="alert">
              {error}
              <button onClick={() => setRefresh((n) => n + 1)}>
                Tentar novamente
              </button>
            </div>
          )}
          {loading ? (
            <p role="status">Carregando registros…</p>
          ) : selected ? (
            <Profile
              employee={selected}
              rh={rh}
              tab={tab}
              setTab={setTab}
              edit={edit}
              back={() => setSelected(null)}
              refresh={refresh}
            />
          ) : screen === "Visão geral" ? (
            <>
              <div className="metrics">
                {[
                  ["Colaboradores ativos", dashboard?.active],
                  ["Em atividade", dashboard?.working],
                  ["Em férias", dashboard?.vacation],
                  ["Afastados / licenças", dashboard?.away],
                ].map(([l, n]) => (
                  <div key={l}>
                    <span>{l}</span>
                    <strong>{n ?? 0}</strong>
                  </div>
                ))}
              </div>
              <section className="panel">
                <div className="panel-title">
                  <h2>Próximas férias</h2>
                  <button onClick={() => navigate("Férias")}>
                    Ver programação →
                  </button>
                </div>
                <Table
                  rows={dashboard?.upcoming || []}
                  columns={[
                    { label: "Colaborador", value: (r) => r.name },
                    { label: "Matrícula", value: (r) => r.registration },
                    { label: "Unidade", value: (r) => r.unit },
                    { label: "Início", value: (r) => brDate(r.start) },
                    { label: "Fim", value: (r) => brDate(r.end) },
                    { label: "Dias", value: (r) => r.days },
                  ]}
                />
              </section>
              {rh && (
                <section className="panel">
                  <div className="panel-title">
                    <h2>Períodos com saldo próximos do prazo</h2>
                    <span>
                      {dashboard?.reviews || 0} revisão(ões) pendente(s)
                    </span>
                  </div>
                  <Table
                    rows={dashboard?.deadlines || []}
                    columns={[
                      { label: "Colaborador", value: (r) => r.employeeName },
                      ...columns.periods.filter((c) =>
                        [
                          "Fim concessivo",
                          "Data limite",
                          "Não usufruído",
                          "Condição",
                        ].includes(c.label),
                      ),
                    ]}
                  />
                </section>
              )}
              <section className="panel">
                <h2>Desligamentos por período</h2>
                <div className="filters">
                  <label>
                    De
                    <input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </label>
                  <label>
                    Até
                    <input
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </label>
                  <strong>
                    {dashboard?.terminated || 0} desligamento(s)
                    {!from && !to ? " nos últimos 30 dias" : ""}
                  </strong>
                </div>
              </section>
            </>
          ) : screen === "Colaboradores" ? (
            <section className="panel">
              <div className="panel-title">
                <h2>Colaboradores</h2>
                {rh && (
                  <div>
                    <button onClick={() => edit("people")}>
                      Cadastrar pessoa
                    </button>
                    <button
                      className="primary"
                      onClick={() => edit("employments")}
                    >
                      + Novo vínculo
                    </button>
                  </div>
                )}
              </div>
              {filterControls(employeeRows, true)}
              <Table
                rows={filters(employeeRows)}
                columns={employeeColumns}
                onOpen={(r) => {
                  setSelected(r);
                  setTab(rh ? "Dados pessoais" : "Dados profissionais");
                }}
              />
            </section>
          ) : screen === "Configurações" ? (
            <Settings onError={setError} />
          ) : (
            <>
              <div className="tabs">
                {(screen === "Férias"
                  ? rh
                    ? ["periods", "bookings", "adjustments", "calendar"]
                    : ["calendar"]
                  : screen === "Benefícios"
                    ? ["benefits", "enrollments"]
                    : screen === "Cadastros"
                      ? ["units", "cost-centers", "lookups", "people"]
                      : ["dependents"]
                ).map((r) => (
                  <button
                    className={
                      resource === r &&
                      !(screen === "Benefícios" && selectedBenefitId)
                        ? "active"
                        : ""
                    }
                    key={r}
                    onClick={() => {
                      if (r !== resource) {
                        setRows([]);
                        setLoading(true);
                      }
                      setResource(r);
                      setSelectedBenefitId("");
                      setSearch("");
                      setCondition("");
                    }}
                  >
                    {
                      (
                        {
                          periods: "Períodos e saldos",
                          bookings: "Programação e gozo",
                          adjustments: "Abono e ajustes",
                          calendar: "Calendário",
                          benefits: "Catálogo",
                          enrollments: "Pessoas cobertas",
                          units: "Unidades",
                          "cost-centers": "Centros de custos",
                          lookups: "Cadastros auxiliares",
                          people: "Pessoas",
                          dependents: "Dependentes",
                        } as any
                      )[r]
                    }
                  </button>
                ))}
                {screen === "Benefícios" &&
                  benefitCatalog.map((benefit) => (
                    <button
                      key={benefit.id}
                      className={
                        resource === "enrollments" &&
                        selectedBenefitId === benefit.id
                          ? "active"
                          : ""
                      }
                      aria-pressed={
                        resource === "enrollments" &&
                        selectedBenefitId === benefit.id
                      }
                      onClick={() => {
                        if (resource !== "enrollments") {
                          setRows([]);
                          setLoading(true);
                          setResource("enrollments");
                        }
                        setSelectedBenefitId(benefit.id);
                        setSearch("");
                        setCondition("");
                      }}
                    >
                      {benefit.name}
                      {benefit.active ? "" : " (inativo)"}
                    </button>
                  ))}
              </div>
              {resource === "calendar" || (!rh && screen === "Férias") ? (
                <Calendar
                  bookings={allBookings}
                  month={month}
                  setMonth={setMonth}
                />
              ) : (
                <section className="panel">
                  <div className="panel-title">
                    <h2>
                      {screen === "Benefícios" && selectedBenefit
                        ? selectedBenefit.name
                        : forms[resource]?.title}
                    </h2>
                    {rh && (
                      <button
                        className="primary"
                        onClick={() =>
                          edit(
                            resource,
                            screen === "Benefícios" &&
                              resource === "enrollments" &&
                              selectedBenefitId
                              ? { benefitId: selectedBenefitId }
                              : undefined,
                          )
                        }
                      >
                        + Cadastrar
                      </button>
                    )}
                  </div>
                  {screen === "Férias" && (
                    <p className="notice">
                      Aprovação exige revisão pelo RH de feriados e repousos.
                      Sem automação jurídica para exceções. Retorno é previsão
                      por calendário.
                    </p>
                  )}
                  {filterControls(
                    visibleRows,
                    screen === "Férias" && resource === "periods",
                  )}
                  <Table
                    rows={
                      screen === "Férias" && resource === "periods"
                        ? orderVacationPeriods(filters(visibleRows))
                        : filters(visibleRows)
                    }
                    columns={columns[resource] || []}
                    onEdit={
                      rh && resource !== "adjustments"
                        ? (r) => edit(resource, r)
                        : undefined
                    }
                  />
                </section>
              )}
            </>
          )}
          <footer className="page-footer">
            Middleby do Brasil · Gestão de RH{" "}
            <span>
              Dados locais · Acesso {rh ? "administrativo" : "de consulta"}
            </span>
          </footer>
        </main>
      </div>
      {editor && (
        <Editor
          key={editor.resource + (editor.initial?.id || "new")}
          {...editor}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
function unique(rows: any[]) {
  return [...new Map(rows.map((r) => [r.id, r])).values()];
}
function Profile({
  employee: e,
  rh,
  tab,
  setTab,
  edit,
  back,
  refresh,
}: {
  employee: any;
  rh: boolean;
  tab: string;
  setTab: (s: string) => void;
  edit: (r: string, i?: any) => void;
  back: () => void;
  refresh: number;
}) {
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState("");
  const resource = (
    {
      Dependentes: "dependents",
      Benefícios: "enrollments",
      Férias: "bookings",
      Afastamentos: "leaves",
    } as any
  )[tab];
  useEffect(() => {
    setData([]);
    setError("");
    if (!rh || !resource) return;
    api("/data/" + resource)
      .then((rows) =>
        setData(
          rows.filter((r: any) =>
            resource === "dependents"
              ? r.personId === e.personId
              : resource === "bookings"
                ? r.period?.employmentId === e.id
                : r.employmentId === e.id,
          ),
        ),
      )
      .catch((x) => setError(x.message));
  }, [tab, e.id, rh, resource, refresh]);
  return (
    <section className="panel">
      <div className="panel-title">
        <button onClick={back}>← Voltar à lista</button>
        <div>
          {badge(e.condition?.label || e.status)}
          {e.condition?.conflict && badge("Conflito de ausências")}
        </div>
      </div>
      <div className="tabs">
        {(rh
          ? [
              "Dados pessoais",
              "Dados profissionais",
              "Dependentes",
              "Benefícios",
              "Férias",
              "Afastamentos",
              "Histórico",
            ]
          : ["Dados profissionais", "Férias"]
        ).map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {tab === "Dados pessoais" ? (
        <>
          <div className="panel-title">
            <h2>{e.person.name}</h2>
            <button onClick={() => edit("people", e.person)}>
              Editar / arquivar pessoa
            </button>
          </div>
          <dl>
            {Object.entries({
              Nome: e.person.name,
              "Nome social": e.person.socialName,
              CPF: e.person.cpf,
              Nascimento: brDate(e.person.birthDate),
              Telefone: e.person.phone,
              "E-mail pessoal": e.person.email,
              Endereço: e.person.address,
              "Contato de emergência": e.person.emergencyName,
              "Telefone de emergência": e.person.emergencyPhone,
              "Relação do contato": e.person.emergencyRelation,
              "Notas restritas ao RH": e.person.notes,
              Arquivado: e.person.archived ? "Sim" : "Não",
            }).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{String(v || "—")}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : tab === "Dados profissionais" ? (
        <>
          <div className="panel-title">
            <h2>Vínculo {e.registration}</h2>
            {rh && (
              <button onClick={() => edit("employments", e)}>
                Editar / encerrar vínculo
              </button>
            )}
          </div>
          <dl>
            {Object.entries({
              Unidade: e.unit.name,
              "Centro de custos": e.costCenter.name,
              Departamento: e.department.name,
              Cargo: e.job.name,
              Gestor: e.manager?.person?.name,
              Tipo: labels[e.kind],
              Admissão: brDate(e.admission),
              Desligamento: brDate(e.termination),
              Situação: labels[e.status],
              "E-mail corporativo": e.corporateEmail,
              "Jornada semanal": e.weeklyHours,
            }).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{String(v || "—")}</dd>
              </div>
            ))}
          </dl>
          {e.kind !== "CLT" && (
            <p className="notice">
              Controle de recesso para este vínculo não incluído nesta versão.
            </p>
          )}
        </>
      ) : tab === "Histórico" ? (
        <Table
          rows={e.assignments || []}
          columns={[
            { label: "Vigência", value: (r) => brDate(r.effective) },
            { label: "Unidade", value: (r) => r.unit.name },
            { label: "Centro", value: (r) => r.costCenter.name },
            { label: "Departamento", value: (r) => r.department.name },
            { label: "Cargo", value: (r) => r.job.name },
            { label: "Justificativa", value: (r) => r.reason },
          ]}
        />
      ) : (
        <>
          {rh && (
            <div className="panel-title">
              <p>
                {tab === "Dependentes"
                  ? "Cadastro familiar não gera automaticamente cobertura ou direito fiscal."
                  : tab === "Benefícios"
                    ? "Inclusões e exclusões dos benefícios do colaborador."
                    : ""}
              </p>
              <button
                className="primary"
                onClick={() =>
                  edit(resource, {
                    ...(resource === "dependents"
                      ? { personId: e.personId }
                      : { employmentId: e.id }),
                  })
                }
              >
                + Cadastrar
              </button>
            </div>
          )}
          <Table
            rows={rh ? data : e.periods.flatMap((p: any) => p.bookings)}
            columns={
              rh
                ? columns[resource] || []
                : columns.bookings.filter((c) => c.label !== "Colaborador")
            }
            onEdit={rh ? (r) => edit(resource, r) : undefined}
          />
        </>
      )}
    </section>
  );
}
function Calendar({
  bookings,
  month,
  setMonth,
}: {
  bookings: any[];
  month: string;
  setMonth: (s: string) => void;
}) {
  const filtered = bookings.filter(
    (b) =>
      civil(b.start).slice(0, 7) <= month && civil(b.end).slice(0, 7) >= month,
  );
  const days = month
    ? new Date(
        Number(month.slice(0, 4)),
        Number(month.slice(5, 7)),
        0,
      ).getDate()
    : 0;
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Calendário de ausências</h2>
        <label>
          Mês
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
      </div>
      <p className="notice">
        Sobreposição na mesma equipe é um alerta de planejamento e não bloqueia
        automaticamente a aprovação.
      </p>
      <div className="calendar">
        {month &&
          Array.from(
            { length: (new Date(month + "-01T00:00:00Z").getUTCDay() + 6) % 7 },
            (_, i) => (
              <div key={"blank-" + i} className="day" aria-hidden="true" />
            ),
          )}
        {Array.from({ length: days }, (_, i) => {
          const d = month + "-" + String(i + 1).padStart(2, "0");
          const absent = filtered.filter(
            (b) => civil(b.start) <= d && civil(b.end) >= d,
          );
          return (
            <div className="day" key={d}>
              <strong>{i + 1}</strong>
              <small>
                {new Intl.DateTimeFormat("pt-BR", {
                  weekday: "short",
                  timeZone: "UTC",
                }).format(new Date(d + "T12:00:00Z"))}
              </small>
              {absent.map((b) => (
                <span key={b.id}>{b.employeeName}</span>
              ))}
              {absent.some((b, i) =>
                absent.some(
                  (o, j) =>
                    i !== j && b.team === o.team && b.unitName === o.unitName,
                ),
              ) && <small className="error">Sobreposição na equipe</small>}
            </div>
          );
        })}
      </div>
      <Table
        rows={filtered}
        columns={[
          { label: "Colaborador", value: (r) => r.employeeName },
          { label: "Equipe", value: (r) => r.team },
          { label: "Unidade", value: (r) => r.unitName },
          ...columns.bookings.filter((c) => c.label !== "Colaborador"),
        ]}
      />
    </section>
  );
}
function Settings({ onError }: { onError: (s: string) => void }) {
  const [values, setValues] = useState<any>(null);
  const [audits, setAudits] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([api("/data/company"), api("/data/audit")])
      .then(([c, a]) => {
        setValues({ ...c, alerts: c.alertDays.join(", ") });
        setAudits(a);
      })
      .catch((e) => onError(e.message));
  }, []);
  return (
    <>
      {values && (
        <section className="panel">
          <h2>Empresa e alertas</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api("/settings", "PUT", {
                  ...values,
                  alertDays: values.alerts.split(",").map(Number),
                });
                setMessage(
                  "Configuração salva. A meta atualizada vale para períodos gerados posteriormente; períodos existentes mantêm suas datas.",
                );
              } catch (e) {
                onError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              {[
                ["name", "Nome fantasia"],
                ["legalName", "Razão social (opcional)"],
                ["code", "Identificador interno"],
                ["notes", "Observações"],
                ["targetMonths", "Data limite: meses após aquisição"],
                ["alerts", "Alertas: dias separados por vírgula"],
              ].map(([k, l]) => (
                <label key={k}>
                  {l}
                  <input
                    value={values[k] ?? ""}
                    type={k === "targetMonths" ? "number" : "text"}
                    required={["name", "code", "alerts"].includes(k)}
                    min={k === "targetMonths" ? 1 : undefined}
                    max={k === "targetMonths" ? 12 : undefined}
                    onChange={(e) =>
                      setValues({ ...values, [k]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <footer>
              <button className="primary" disabled={busy}>
                Salvar configurações
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api("/reconcile", "POST");
                    setMessage("Períodos reconciliados.");
                  } catch (e) {
                    onError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Reconciliar períodos
              </button>
            </footer>
            <p role="status">{message}</p>
          </form>
          <p>
            Logo local: configure <code>src/config.ts</code>. Usuários: crie ou
            atualize pelo procedimento local descrito no README.
          </p>
        </section>
      )}
      <section className="panel">
        <h2>Auditoria de alterações</h2>
        <p>
          Até 500 alterações recentes. Registra autor, data, entidade e nomes
          dos campos, sem copiar dados pessoais para logs.
        </p>
        <Table rows={audits} columns={columns.audit} />
      </section>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
