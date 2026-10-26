import { useState } from "react";
import { ColumnHelp, columnHelp } from "./ColumnHelp";
export type Column = {
  label: string;
  help?: string;
  value: (row: any) => React.ReactNode;
};
export function Table({
  rows,
  columns,
  onEdit,
  onOpen,
  openLabel = "Abrir ficha",
  pageSize = 15,
}: {
  rows: any[];
  columns: Column[];
  onEdit?: (r: any) => void;
  onOpen?: (r: any) => void;
  openLabel?: string;
  pageSize?: number;
}) {
  const [page, setPage] = useState(0);
  const size = pageSize;
  const current = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / size) - 1),
  );
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.label} scope="col">
                  {c.label}
                  {(c.help || columnHelp[c.label]) && (
                    <ColumnHelp
                      label={c.label}
                      text={c.help || columnHelp[c.label]}
                    />
                  )}
                </th>
              ))}
              {(onEdit || onOpen) && (
                <th scope="col">
                  Ações <ColumnHelp label="Ações" text={columnHelp["Ações"]} />
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.slice(current * size, (current + 1) * size).map((r, i) => (
              <tr key={r.id || i}>
                {columns.map((c) => (
                  <td key={c.label}>{c.value(r) ?? "—"}</td>
                ))}
                {(onEdit || onOpen) && (
                  <td className="actions">
                    {onOpen && (
                      <button onClick={() => onOpen(r)}>{openLabel}</button>
                    )}
                    {onEdit && (
                      <button onClick={() => onEdit(r)}>Editar</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">
            <strong>Nenhum registro encontrado</strong>
            <p>Cadastre o primeiro registro ou ajuste os filtros.</p>
          </div>
        )}
      </div>
      <div className="pagination">
        <span>
          {rows.length} registro(s) • Página {current + 1} de{" "}
          {Math.max(1, Math.ceil(rows.length / size))}
        </span>
        <div>
          <button disabled={!current} onClick={() => setPage(current - 1)}>
            Anterior
          </button>
          <button
            disabled={(current + 1) * size >= rows.length}
            onClick={() => setPage(current + 1)}
          >
            Próxima
          </button>
        </div>
      </div>
    </>
  );
}
