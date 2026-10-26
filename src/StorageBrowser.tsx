import { useEffect, useRef, useState } from "react";

type Directory = {
  path: string;
  parent: string | null;
  entries: { name: string; path: string; directory: boolean }[];
  truncated: boolean;
  shortcuts: { name: string; path: string }[];
};
export function StorageBrowser({
  initial,
  request,
  onSelect,
  onClose,
}: {
  initial: string;
  request: (route: string, body: unknown) => Promise<any>;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const version = useRef(0);
  const [location, setLocation] = useState(initial);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  async function open(path: string) {
    const current = ++version.current;
    setBusy(true);
    setError("");
    try {
      const result = (await request("browse", { path })) as Directory;
      if (version.current === current) {
        setDirectory(result);
        setLocation(result.path);
      }
    } catch (e) {
      if (version.current === current) setError((e as Error).message);
    } finally {
      if (version.current === current) setBusy(false);
    }
  }
  useEffect(() => {
    dialog.current?.showModal();
    void open(initial);
    return () => {
      version.current++;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="storage-browser"
      aria-labelledby="storage-browser-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2 id="storage-browser-title">Selecionar base de dados</h2>
      <p>Abra a pasta e selecione o arquivo .mdb ou .accdb.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void open(location);
        }}
      >
        <label>
          Pasta ou caminho do arquivo
          <input
            autoFocus
            disabled={busy}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            spellCheck={false}
          />
        </label>
        <button className="primary" disabled={busy}>
          Abrir pasta
        </button>
      </form>
      <div className="storage-browser-shortcuts">
        {directory?.parent && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void open(directory.parent!)}
          >
            ↑ Pasta anterior
          </button>
        )}
        {directory?.shortcuts.map((item) => (
          <button
            type="button"
            key={item.path + item.name}
            disabled={busy}
            onClick={() => void open(item.path)}
          >
            {item.name}
          </button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {busy ? (
        <p role="status">Carregando pasta…</p>
      ) : (
        directory &&
        !error && (
          <>
            <p className="storage-browser-location">{directory.path}</p>
            <ul aria-label="Pastas e bases disponíveis">
              {directory.entries.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    aria-label={
                      (entry.directory ? "Abrir pasta " : "Selecionar base ") +
                      entry.name
                    }
                    onClick={() =>
                      entry.directory
                        ? void open(entry.path)
                        : onSelect(entry.path)
                    }
                  >
                    <span aria-hidden="true">
                      {entry.directory ? "▸" : "▤"}
                    </span>
                    {entry.name}
                  </button>
                </li>
              ))}
            </ul>
            {!directory.entries.length && (
              <p>Nenhuma pasta ou base encontrada neste local.</p>
            )}
            {directory.truncated && (
              <p>
                Mostrando os primeiros 2.000 itens. Informe uma pasta mais
                específica para continuar.
              </p>
            )}
          </>
        )
      )}
      <footer>
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
      </footer>
    </dialog>
  );
}
