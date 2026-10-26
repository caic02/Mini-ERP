import { FileStore, fileClient } from "../../server/storage/file.js";
import { recordSession } from "../../server/storage/records.js";

const store = new FileStore(JSON.parse(process.argv[2]));
const mode = process.argv[3];
const userId = process.argv[4];
if (mode === "profile") {
  const { storageStatus } = await import("../../server/storage/runtime.js");
  process.send!(await storageStatus());
  process.disconnect!();
} else {
  const snapshot = await store.read();
  const ready = new Promise<void>((resolve) =>
    process.once("message", () => resolve()),
  );
  process.send!({ ready: true });
  await ready;
  try {
    if (mode === "retry") {
      await fileClient(store).user.update({
        where: { id: userId },
        data: { username: "alterado-" + userId },
      });
    } else {
      const session = recordSession(snapshot.data);
      await session.client.user.update({
        where: { id: userId },
        data: { username: "vencedor-" + process.pid },
      });
      await session.client.audit.create({
        data: {
          userId,
          action: "TESTE",
          entity: "User",
          entityId: userId,
          fields: ["username"],
        },
      });
      await store.write(snapshot.revision, session.data);
    }
    process.send!({ ok: true });
  } catch (error: any) {
    process.send!({ ok: false, code: error.code });
  }
  process.disconnect!();
}
