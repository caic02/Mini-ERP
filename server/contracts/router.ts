import { Router } from "express";
import { z } from "zod";
import { rhOnly } from "../auth.js";
import { serial } from "../db.js";
import {
  bootstrap,
  saveContractResource,
  changeContractStatus,
  cancelForecast,
  reconcileContract,
} from "./service.js";
import { audit } from "../services.js";
import {
  createMeasurement,
  editMeasurement,
  measurementDetail,
  measurementAction,
} from "./measurements.js";
export const contractsRouter = Router();
contractsRouter.use(rhOnly);
contractsRouter.post("/measurements", async (req, res) =>
  res.status(201).json(await createMeasurement(req.body, req.user.id)),
);
contractsRouter.get("/measurements/:id", async (req, res) =>
  res.json(await measurementDetail(String(req.params.id))),
);
contractsRouter.put("/measurements/:id", async (req, res) =>
  res.json(await editMeasurement(String(req.params.id), req.body, req.user.id)),
);
contractsRouter.post("/measurements/:id/action", async (req, res) =>
  res.json(
    await measurementAction(String(req.params.id), req.body, req.user.id),
  ),
);
contractsRouter.get("/bootstrap", async (_req, res) =>
  res.json(await bootstrap()),
);
contractsRouter.post("/resources/:resource", async (req, res) =>
  res
    .status(201)
    .json(
      await saveContractResource(
        String(req.params.resource),
        req.body,
        undefined,
        req.user.id,
      ),
    ),
);
contractsRouter.put("/resources/:resource/:id", async (req, res) =>
  res.json(
    await saveContractResource(
      String(req.params.resource),
      req.body,
      String(req.params.id),
      req.user.id,
    ),
  ),
);
contractsRouter.post("/:id/status", async (req, res) =>
  res.json(
    await changeContractStatus(String(req.params.id), req.body, req.user.id),
  ),
);
contractsRouter.post("/:id/reconcile", async (req, res) =>
  res.json(
    await serial(async (tx) => {
      const changes = await reconcileContract(tx, String(req.params.id));
      if (changes)
        await audit(
          tx,
          req.user.id,
          "RECONCILIAR",
          "contracts.contracts",
          String(req.params.id),
          ["forecasts"],
        );
      return { changes };
    }),
  ),
);
contractsRouter.post("/forecasts/:id/cancel", async (req, res) => {
  const { reason, version } = z
    .object({
      reason: z.string().trim().min(1).max(4000),
      version: z.number().int().positive(),
    })
    .parse(req.body);
  res.json(
    await cancelForecast(String(req.params.id), reason, version, req.user.id),
  );
});
