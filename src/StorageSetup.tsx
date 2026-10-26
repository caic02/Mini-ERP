import React, { useEffect, useState } from "react";
import { StorageBrowser } from "./StorageBrowser";

export type StorageStatus = {
  ready: boolean;
  needsChoice: boolean;
  mode: string | null;
  path: string;
  identity: string;
  error: string;
  canPostgres: boolean;
  token: string;
};
export async function getStorageStatus(): Promise<StorageStatus> {
  const response = await fetch("/api/storage/status", {
    credentials: "same-origin",
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      value.error || "Não foi possível verificar a base de dados.",
    );
  return value;
}
export function StorageSetup({
  brand,
  initial,
  onReady,
  onCancel,
}: {
  brand: React.ReactNode;
  initial: StorageStatus | null;
  onReady: () => void;
  onCancel?: () => void;
}) {
  const [status, setStatus] = useState(initial);
  const [file, setFile] = useState(initial?.path || "");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initial?.error || "");
  const [message, setMessage] = useState("");
  const [browsing, setBrowsing] = useState(false);
  useEffect(() => {
    if (!initial)
      void getStorageStatus()
        .then(setStatus)
        .catch((e) => setError(e.message));
  }, [initial]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function request(route: string, body: unknown = {}) {
    const current = status || (await getStorageStatus());
    setStatus(current);
    const response = await fetch("/api/storage/" + route, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Storage-Token": current.token,
      },
      body: JSON.stringify(body),
    });
    const value = await response.json();
    if (!response.ok)
      throw new Error(
        (Object.values(value.fields || {})[0] as string) ||
          value.error ||
          "Não foi possível concluir a configuração.",
      );
    return value;
  }
  return (
    <main className="login storage-setup">
      <div className="storage-card">
        <header>
          {brand}
          <p className="eyebrow">CONFIGURAÇÃO DESTE COMPUTADOR</p>
          <h1>Conectar à base de dados</h1>
          <p>
            Informe o arquivo usado pela equipe. Os dois computadores devem
            abrir a mesma base na pasta do servidor.
          </p>
        </header>
        <div className="storage-content">
          {status?.path && (
            <div className="storage-current">
              <strong>Base configurada</strong>
              <span>{status.path}</span>
              <small>Identificação: {status.identity}</small>
            </div>
          )}
          <div
            className="storage-options"
            role="group"
            aria-label="Operação com a base"
          >
            <button
              type="button"
              aria-pressed={!creating}
              disabled={busy}
              className={!creating ? "primary" : ""}
              onClick={() => {
                setCreating(false);
                setError("");
                setMessage("");
              }}
            >
              Abrir base existente
            </button>
            <button
              type="button"
              aria-pressed={creating}
              disabled={busy}
              className={creating ? "primary" : ""}
              onClick={() => {
                setCreating(true);
                setError("");
                setMessage("");
              }}
            >
              Criar base vazia
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void action(async () => {
                if (creating) {
                  if (data.get("password") !== data.get("confirmation"))
                    throw new Error("As senhas precisam ser iguais.");
                  await request("create", {
                    path: file,
                    username: data.get("username"),
                    password: data.get("password"),
                  });
                } else await request("select", { mode: "file", path: file });
                onReady();
              });
            }}
          >
            <label>
              Caminho completo do arquivo
              <div className="storage-path">
                <input
                  autoFocus
                  required
                  value={file}
                  onChange={(e) => {
                    setFile(e.target.value);
                    setMessage("");
                  }}
                  placeholder={String.raw`\\servidor\RH\MiniERP\base.mdb`}
                  spellCheck={false}
                  disabled={busy}
                  aria-describedby="storage-path-help"
                />
                {!creating && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setBrowsing(true)}
                  >
                    Procurar…
                  </button>
                )}
              </div>
            </label>
            <p id="storage-path-help" className="storage-hint">
              Use a pasta compartilhada do servidor. O caminho fica salvo
              somente neste computador. A base em uso deve ficar fora do
              OneDrive.
            </p>
            {creating && (
              <div className="storage-new">
                <p>
                  Cria uma base sem cadastros e o primeiro usuário de RH. Para
                  levar os dados atuais, use a exportação descrita no README.
                </p>
                <label>
                  Usuário administrador
                  <input
                    name="username"
                    required
                    minLength={3}
                    maxLength={80}
                    pattern="[A-Za-z0-9_.-]{3,80}"
                    title="Use de 3 a 80 letras sem acentos, números, ponto, hífen ou sublinhado."
                    autoComplete="username"
                    disabled={busy}
                  />
                </label>
                <div className="storage-passwords">
                  <div>
                    <label>
                      Senha
                      <input
                        name="password"
                        type="password"
                        required
                        minLength={12}
                        maxLength={72}
                        autoComplete="new-password"
                        disabled={busy}
                        aria-describedby="storage-password-help"
                      />
                    </label>
                    <small id="storage-password-help">
                      Mínimo de 12 caracteres.
                    </small>
                  </div>
                  <label>
                    Confirmar senha
                    <input
                      name="confirmation"
                      type="password"
                      required
                      minLength={12}
                      maxLength={72}
                      autoComplete="new-password"
                      disabled={busy}
                    />
                  </label>
                </div>
              </div>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="storage-success" role="status">
                {message}
              </p>
            )}
            <div className="storage-actions">
              {!creating && (
                <button
                  type="button"
                  disabled={busy || !file.trim()}
                  onClick={() =>
                    void action(async () => {
                      const r = await request("check", { path: file });
                      setMessage(
                        `${r.message} ${r.people} pessoa(s) cadastrada(s). Identificação: ${r.identity}`,
                      );
                    })
                  }
                >
                  Testar acesso
                </button>
              )}
              <button className="primary" disabled={busy}>
                {busy
                  ? "Aguarde…"
                  : creating
                    ? "Criar base e continuar"
                    : "Salvar e continuar"}
              </button>
            </div>
          </form>
          <div className="storage-secondary">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const r = await request("retry");
                  setStatus(r);
                  if (r.ready && !r.needsChoice) onReady();
                  else setError(r.error || "Selecione a base para continuar.");
                })
              }
            >
              Tentar novamente
            </button>
            {status?.canPostgres && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await request("select", { mode: "postgres" });
                    onReady();
                  })
                }
              >
                Usar PostgreSQL atual
              </button>
            )}
            {onCancel && (
              <button type="button" disabled={busy} onClick={onCancel}>
                Voltar ao login
              </button>
            )}
          </div>
        </div>
      </div>
      {browsing && (
        <StorageBrowser
          initial={file}
          request={request}
          onSelect={(path) => {
            setFile(path);
            setMessage("");
            setError("");
            setBrowsing(false);
          }}
          onClose={() => setBrowsing(false)}
        />
      )}
    </main>
  );
}
