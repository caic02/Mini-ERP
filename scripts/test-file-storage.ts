import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createFile } from "../server/storage/file.js";
import { initialDataset } from "../server/storage/initialize.js";

await mkdir(".tools", { recursive: true });
const directory = await mkdtemp(path.resolve(".tools/tests-file-"));
const file = path.join(directory, "test.mdb");
await createFile(file, await initialDataset("admin-test", randomUUID()));
const env = {
  ...process.env,
  CONFIRM_TEST_DB: "SIM",
  DATABASE_URL: "postgresql://unused@127.0.0.1:1/file_test",
  MINIERP_FILE_DATABASE: file,
  MINIERP_STORAGE_CONFIG: path.join(directory, "storage.json"),
};
async function run(args: string[]) {
  return new Promise<number>((resolve) => {
    const child = spawn(process.execPath, args, {
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", () => resolve(1));
    child.once("exit", (code) => resolve(code || 0));
  });
}
console.log("Base isolada de testes: " + file);
// As suítes exercitam o mesmo arquivo. A disputa entre processos tem teste próprio.
let code = await run([
  "--import",
  "tsx",
  "--test",
  "--test-concurrency=1",
  "tests/integration/postgres.test.ts",
  "tests/integration/contracts.test.ts",
  "tests/integration/measurements.test.ts",
]);
if (!code && process.argv.includes("--browser"))
  code = await run(["node_modules/@playwright/test/cli.js", "test"]);
process.exitCode = code;
