import path from "node:path";
import os from "node:os";
import { readdir, stat } from "node:fs/promises";
import { FileStorageError } from "./native.js";

// Somente nomes e caminhos: o seletor não abre nem altera o conteúdo das bases.
export async function browseFiles(input: string) {
  let directory = input.trim() || process.cwd();
  if (!path.isAbsolute(directory) || /[\r\n\0]/.test(directory))
    throw new FileStorageError(
      "PATH",
      "Informe o caminho completo de uma pasta ou base.",
    );
  directory = path.normalize(directory);
  try {
    const info = await stat(directory).catch(() => null);
    if (info?.isFile() || (!info && /\.(mdb|accdb)$/i.test(directory)))
      directory = path.dirname(directory);
    const entries = (await readdir(directory, { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isDirectory() ||
          (entry.isFile() && /\.(mdb|accdb)$/i.test(entry.name)),
      )
      .map((entry) => ({
        name: entry.name,
        path: path.join(directory, entry.name),
        directory: entry.isDirectory(),
      }))
      .sort(
        (a, b) =>
          Number(b.directory) - Number(a.directory) ||
          a.name.localeCompare(b.name, "pt-BR"),
      );
    const parent = path.dirname(directory);
    return {
      path: directory,
      parent: parent !== directory ? parent : null,
      entries: entries.slice(0, 2000),
      truncated: entries.length > 2000,
      shortcuts: [
        { name: "Pasta do programa", path: process.cwd() },
        { name: "Pasta do usuário", path: os.homedir() },
      ],
    };
  } catch {
    throw new FileStorageError(
      "PATH",
      "Não foi possível listar essa pasta. Confira o caminho e as permissões de acesso.",
    );
  }
}
