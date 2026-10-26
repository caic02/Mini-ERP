import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import { browseFiles } from "../../server/storage/browse.js";

test("Procurar lista pastas e bases, aceita caminho de arquivo e não abre seu conteúdo", async () => {
  await mkdir(".tools", { recursive: true });
  const directory = await mkdtemp(path.resolve(".tools/browser-test-"));
  await mkdir(path.join(directory, "Subpasta"));
  for (const name of ["base.mdb", "segunda.ACCDB", "ignorar.txt"])
    await writeFile(
      path.join(directory, name),
      "conteúdo sintético, não é uma base",
    );
  const result = await browseFiles(path.join(directory, "base.mdb"));
  assert.equal(result.path, directory);
  assert.equal(result.parent, path.dirname(directory));
  assert.deepEqual(
    result.entries.map((entry) => entry.name),
    ["Subpasta", "base.mdb", "segunda.ACCDB"],
  );
  assert.equal(result.entries[0].directory, true);
  assert.equal(
    (await browseFiles(path.join(directory, "nova.mdb"))).path,
    directory,
  );
  assert.equal(
    (await browseFiles(path.join(directory, "Subpasta"))).entries.length,
    0,
  );
  assert.equal(
    await readFile(path.join(directory, "base.mdb"), "utf8"),
    "conteúdo sintético, não é uma base",
  );
  await assert.rejects(
    browseFiles(path.join(directory, "ausente")),
    (e: any) => e.code === "PATH",
  );
  await assert.rejects(
    browseFiles("caminho-relativo"),
    (e: any) => e.code === "PATH",
  );
});
