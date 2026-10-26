import { execFile } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export class FileStorageError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export type FileProvider = { provider: string; architecture: "x86" | "x64" };
export type NativeResult = {
  ok: boolean;
  code?: string;
  message?: string;
  identity?: string;
  revision?: number;
  schema?: string;
  data?: string;
  path?: string | null;
};
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const builds = new Map<string, Promise<string>>();
async function binary(architecture: string) {
  if (process.platform !== "win32")
    throw new FileStorageError(
      "PLATFORM",
      "O modo de arquivo compartilhado requer Windows.",
    );
  const source = path.join(project, "server/storage/native/FileDatabase.cs");
  const hash = createHash("sha256")
    .update(await readFile(source))
    .digest("hex")
    .slice(0, 16);
  const key = hash + architecture;
  if (!builds.has(key))
    builds.set(
      key,
      (async () => {
        const directory = path.join(project, ".tools", "file-runtime", hash);
        await mkdir(directory, { recursive: true });
        const executable = path.join(
          directory,
          "database-" + architecture + ".exe",
        );
        if (
          await access(executable).then(
            () => true,
            () => false,
          )
        )
          return executable;
        const compiler = path.join(
          process.env.SystemRoot || "C:\\Windows",
          "Microsoft.NET/Framework/v4.0.30319/csc.exe",
        );
        await new Promise<void>((resolve, reject) =>
          execFile(
            compiler,
            [
              "/nologo",
              "/target:exe",
              "/platform:" + architecture,
              "/codepage:65001",
              "/r:System.Data.dll",
              "/r:System.Runtime.Serialization.dll",
              "/out:" + executable,
              source,
            ],
            { windowsHide: true, timeout: 30000 },
            (error) =>
              error
                ? reject(
                    new FileStorageError(
                      "COMPILER",
                      "Não foi possível preparar o componente local de banco em arquivo.",
                    ),
                  )
                : resolve(),
          ),
        );
        return executable;
      })(),
    );
  return builds.get(key)!;
}
export async function native(
  provider: FileProvider,
  request: Record<string, unknown>,
): Promise<NativeResult> {
  const executable = await binary(provider.architecture);
  const input = JSON.stringify({ ...request, provider: provider.provider });
  return new Promise((resolve, reject) => {
    let complete = false;
    const child = execFile(
      executable,
      [],
      {
        windowsHide: true,
        timeout: 30000,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
      (error, stdout) => {
        complete = true;
        try {
          const result = JSON.parse(
            String(stdout).replace(/^\uFEFF/, ""),
          ) as NativeResult;
          if (result.ok) resolve(result);
          else
            reject(
              new FileStorageError(
                result.code || "UNAVAILABLE",
                result.message || "Base indisponível.",
              ),
            );
        } catch (parseError) {
          if (parseError instanceof FileStorageError) reject(parseError);
          else
            reject(
              new FileStorageError(
                request.operation === "write"
                  ? "COMMIT_UNKNOWN"
                  : "UNAVAILABLE",
                error
                  ? "O acesso à base não foi concluído. Confira a conexão e tente novamente."
                  : "O componente de armazenamento retornou uma resposta inválida.",
              ),
            );
        }
      },
    );
    child.stdin?.on("error", () => {
      if (!complete)
        reject(
          new FileStorageError(
            "UNAVAILABLE",
            "Não foi possível iniciar o componente local de armazenamento.",
          ),
        );
    });
    child.stdin?.end(input);
  });
}
export const providers: FileProvider[] = [
  { provider: "Microsoft.ACE.OLEDB.16.0", architecture: "x64" },
  { provider: "Microsoft.ACE.OLEDB.12.0", architecture: "x64" },
  { provider: "Microsoft.ACE.OLEDB.16.0", architecture: "x86" },
  { provider: "Microsoft.ACE.OLEDB.12.0", architecture: "x86" },
  { provider: "Microsoft.Jet.OLEDB.4.0", architecture: "x86" },
];
