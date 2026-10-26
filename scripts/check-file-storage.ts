import { execFile } from "node:child_process";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";

// Diagnóstico independente: não importa Prisma, não lê .env e não muda o banco atual.
type ProbeResult = {
  status: string;
  provider: string;
  bitness: number;
  version: number;
  amount: string | null;
  historyCount: number;
  message: string | null;
  rollbackVerified: boolean;
  foreignKeyVerified: boolean;
  unicodeVerified: boolean;
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const children = new Set<ReturnType<typeof execFile>>();
function start(executable: string, arguments_: string[], timeout = 35000) {
  const done = new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      const child = execFile(
        executable,
        arguments_,
        {
          windowsHide: true,
          timeout,
          maxBuffer: 1024 * 1024,
          encoding: "utf8",
        },
        (error, stdout, stderr) => {
          children.delete(child);
          resolve({
            code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
            stdout: String(stdout)
              .replace(/^\uFEFF/, "")
              .trim(),
            stderr: String(stderr).trim(),
          });
        },
      );
      children.add(child);
    },
  );
  return done;
}
async function waitReady(files: string[], work: Promise<unknown>[]) {
  const limit = Date.now() + 20000;
  while (Date.now() < limit) {
    if (
      (
        await Promise.all(
          files.map((file) =>
            access(file).then(
              () => true,
              () => false,
            ),
          ),
        )
      ).every(Boolean)
    )
      return;
    if (!children.size)
      throw new Error(
        "Os processos de diagnóstico não iniciaram. Verifique o relatório de componentes.",
      );
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  for (const child of children) child.kill();
  await Promise.all(work);
  throw new Error("Tempo excedido ao preparar a gravação concorrente.");
}
async function main() {
  if (args.includes("--help")) {
    console.log(
      "npm.cmd run storage:check\nnpm.cmd run storage:check -- --folder \\\\servidor\\RH\nCria somente uma subpasta de diagnóstico com nome único. Não testa uma base existente.",
    );
    return;
  }
  if (process.platform !== "win32")
    throw new Error(
      "Este diagnóstico utiliza componentes Access/OLE DB do Windows.",
    );
  if (
    args.length &&
    (args.length !== 2 || args[0] !== "--folder" || !args[1].trim())
  )
    throw new Error("Use --folder CAMINHO ou --help.");
  const folderFlag = args.length ? 0 : -1;
  const folder =
    folderFlag < 0
      ? path.join(root, ".tools", "file-storage-probe", "runs")
      : path.resolve(args[folderFlag + 1]);
  for (const syncRoot of [
    process.env.OneDrive,
    process.env.OneDriveCommercial,
    process.env.OneDriveConsumer,
  ].filter(Boolean) as string[]) {
    const relative = path.relative(path.resolve(syncRoot), folder);
    if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative)))
      throw new Error(
        "Escolha uma pasta local de teste ou uma pasta de rede, fora do OneDrive.",
      );
  }
  if (folderFlag < 0) await mkdir(folder, { recursive: true });
  if (!(await stat(folder)).isDirectory())
    throw new Error("O caminho informado não é uma pasta.");
  const runId = randomUUID();
  const runFolder = path.join(folder, "MiniERP-diagnostico-" + runId);
  await mkdir(runFolder);
  const source = path.join(root, "scripts", "storage-probe", "Probe.cs");
  const hash = createHash("sha256")
    .update(await readFile(source))
    .digest("hex")
    .slice(0, 16);
  const bin = path.join(root, ".tools", "file-storage-probe", "bin", hash);
  await mkdir(bin, { recursive: true });
  const compiler = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "Microsoft.NET",
    "Framework",
    "v4.0.30319",
    "csc.exe",
  );
  if (
    !(await access(compiler).then(
      () => true,
      () => false,
    ))
  )
    throw new Error(
      "Compilador .NET Framework não encontrado. Nenhum componente foi instalado.",
    );
  for (const architecture of ["x86", "x64"]) {
    const executable = path.join(bin, "probe-" + architecture + ".exe");
    if (
      !(await access(executable).then(
        () => true,
        () => false,
      ))
    ) {
      const build = await start(compiler, [
        "/nologo",
        "/target:exe",
        "/platform:" + architecture,
        "/codepage:65001",
        "/r:System.Data.dll",
        "/r:System.Runtime.Serialization.dll",
        "/out:" + executable,
        source,
      ]);
      if (build.code)
        throw new Error(
          "Falha ao compilar diagnóstico: " + build.stdout + " " + build.stderr,
        );
    }
  }
  const attempts: {
    provider: string;
    bitness: string;
    status: string;
    message: string | null;
  }[] = [];
  const candidates = [
    { provider: "Microsoft.ACE.OLEDB.16.0", arch: "x64", extension: "accdb" },
    { provider: "Microsoft.ACE.OLEDB.12.0", arch: "x64", extension: "accdb" },
    { provider: "Microsoft.ACE.OLEDB.16.0", arch: "x86", extension: "accdb" },
    { provider: "Microsoft.ACE.OLEDB.12.0", arch: "x86", extension: "accdb" },
    { provider: "Microsoft.Jet.OLEDB.4.0", arch: "x86", extension: "mdb" },
  ];
  let selected: (typeof candidates)[number] | null = null;
  let baseArgs: string[] = [];
  let executable = "";
  for (const [index, candidate] of candidates.entries()) {
    executable = path.join(bin, "probe-" + candidate.arch + ".exe");
    const database = path.join(
      runFolder,
      "probe-" + index + "." + candidate.extension,
    );
    const candidateArgs = [
      "--database",
      database,
      "--provider",
      candidate.provider,
      "--run-id",
      runId,
    ];
    const output = await start(executable, [
      "--operation",
      "create",
      ...candidateArgs,
    ]);
    let result: ProbeResult;
    try {
      result = JSON.parse(output.stdout);
    } catch {
      attempts.push({
        provider: candidate.provider,
        bitness: candidate.arch,
        status: "error",
        message:
          output.stderr || "O componente não retornou um diagnóstico válido.",
      });
      continue;
    }
    attempts.push({
      provider: candidate.provider,
      bitness: candidate.arch,
      status: result.status,
      message: result.status === "error" ? result.message : null,
    });
    if (!output.code && result.status === "available") {
      selected = candidate;
      baseArgs = candidateArgs;
      break;
    }
  }
  const reportFile = path.join(runFolder, "diagnostico.json");
  if (!selected) {
    await writeFile(
      reportFile,
      JSON.stringify(
        { status: "unavailable", attempts, networkValidated: false },
        null,
        2,
      ),
    );
    throw new Error(
      "Nenhum componente compatível disponível. Consulte " +
        reportFile +
        ". Nenhum componente foi instalado.",
    );
  }
  await writeFile(
    reportFile,
    JSON.stringify(
      {
        status: "component-available",
        completed: false,
        attempts,
        networkValidated: false,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  async function pair(name: string, rows: { id: number; amount: string }[]) {
    const gate = path.join(runFolder, name + ".signal");
    const readyFiles = rows.map((_, index) =>
      path.join(runFolder, name + "-" + index + ".ready"),
    );
    const workers = rows.map((row, index) =>
      start(executable, [
        "--operation",
        "write",
        ...baseArgs,
        "--gate",
        gate,
        "--ready",
        readyFiles[index],
        "--version",
        "1",
        "--record-id",
        String(row.id),
        "--amount",
        row.amount,
      ]),
    );
    await waitReady(readyFiles, workers);
    await writeFile(gate, "start", { flag: "wx" });
    return (await Promise.all(workers)).map((output) => {
      assert.equal(output.code, 0, output.stdout + output.stderr);
      return JSON.parse(output.stdout) as ProbeResult;
    });
  }
  const results = await pair("same-record", [
    { id: 1, amount: "100.11" },
    { id: 1, amount: "200.22" },
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [
    "conflict",
    "saved",
  ]);
  const check = await start(executable, ["--operation", "verify", ...baseArgs]);
  assert.equal(check.code, 0, check.stdout + check.stderr);
  const result = JSON.parse(check.stdout) as ProbeResult;
  assert.equal(result.version, 2);
  assert.equal(result.historyCount, 1);
  assert(["100.11", "200.22"].includes(result.amount!));
  assert(
    result.rollbackVerified &&
      result.foreignKeyVerified &&
      result.unicodeVerified,
  );
  const different = await pair("different-records", [
    { id: 2, amount: "300.33" },
    { id: 3, amount: "400.44" },
  ]);
  assert(different.every((row) => row.status === "saved"));
  for (const [id, amount] of [
    [2, "300.33"],
    [3, "400.44"],
  ] as const) {
    const output = await start(executable, [
      "--operation",
      "read",
      ...baseArgs,
      "--record-id",
      String(id),
    ]);
    assert.equal(output.code, 0, output.stdout + output.stderr);
    const saved = JSON.parse(output.stdout) as ProbeResult;
    assert.equal(saved.version, 2);
    assert.equal(saved.amount, amount);
    assert.equal(saved.historyCount, 3);
  }
  const report = {
    status: "passed",
    provider: selected.provider,
    format: selected.extension,
    bitness: selected.arch,
    legacyComponent: selected.extension === "mdb",
    clients: results.map((r) => r.status),
    differentRecords: different.map((r) => r.status),
    finalVersion: result.version,
    finalAmount: result.amount,
    historyRows: 3,
    rollbackVerified: result.rollbackVerified,
    foreignKeyVerified: result.foreignKeyVerified,
    unicodeVerified: result.unicodeVerified,
    uncPathSupplied: runFolder.startsWith("\\\\"),
    networkValidated: false,
    sameComputerProcesses: true,
    note: "Diagnóstico com dois processos no mesmo computador. Não valida dois computadores, nem implementa o banco do Mini ERP.",
    attempts,
  };
  await writeFile(reportFile, JSON.stringify(report, null, 2), {
    encoding: "utf8",
  });
  console.log(JSON.stringify({ ...report, reportFile }, null, 2));
}
main()
  .catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const child of children) child.kill();
  });
