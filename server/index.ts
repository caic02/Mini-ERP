import "dotenv/config";
import { app } from "./app.js";
import { reconcileAll } from "./services.js";
import { reconcileContracts } from "./contracts/service.js";
import {
  useStorage,
  initializeStorage,
  disconnectStorage,
  storageStatus,
} from "./storage/runtime.js";
const server = app.listen(
  Number(process.env.PORT || 3001),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      "Middleby RH disponível na porta " + (process.env.PORT || 3001),
    ),
);
// Reconciliation is also repeated while the process remains open, including after midnight.
let running = false;
async function reconcile() {
  if (running) return;
  running = true;
  try {
    const status = await storageStatus();
    if (status.needsChoice || !status.mode) return;
    await useStorage(async () => {
      await reconcileAll();
      await reconcileContracts();
    });
  } catch {
    console.error("Reconciliação indisponível; verificar banco.");
  } finally {
    running = false;
  }
}
await initializeStorage();
void reconcile();
const timer = setInterval(() => void reconcile(), 60000);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    clearInterval(timer);
    server.close(() => {
      void disconnectStorage().finally(() => process.exit(0));
    });
  });
