BEGIN;

LOCK TABLE "Measurement" IN SHARE ROW EXCLUSIVE MODE;

-- Preserva os dados do antigo estado antes da conversão. O autor de referência
-- é o último responsável pela medição; o motivo identifica a migração automática.
INSERT INTO "MeasurementHistory" ("id", "measurementId", "action", "reason", "snapshot", "authorId", "at")
SELECT 'confirmation-final-history-' || m."id", m."id", 'SIMPLIFICAR_FLUXO',
       'Migração automática: situação Enviada ao Financeiro convertida em Conferida após remoção da etapa de envio. Dados anteriores preservados.',
       to_jsonb(m) || jsonb_build_object('lines', COALESCE(
         (SELECT jsonb_agg(to_jsonb(l) ORDER BY l."id") FROM "MeasurementLine" l WHERE l."measurementId" = m."id"), '[]'::jsonb)),
       m."changedBy", CURRENT_TIMESTAMP
FROM "Measurement" m WHERE m."status" = 'ENVIADA';

INSERT INTO "Audit" ("id", "userId", "action", "entity", "entityId", "fields", "at")
SELECT 'confirmation-final-audit-' || "id", "changedBy", 'SIMPLIFICAR_FLUXO',
       'contracts.measurements', "id", ARRAY['status', 'version'], CURRENT_TIMESTAMP
FROM "Measurement" WHERE "status" = 'ENVIADA';

UPDATE "Measurement"
SET "status" = 'CONFERIDA', "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'ENVIADA';

ALTER TABLE "Measurement" DROP CONSTRAINT "measurement_sent";
ALTER TABLE "Measurement" DROP CONSTRAINT "measurement_state";
ALTER TABLE "Measurement" DROP CONSTRAINT "measurement_confirmed";
ALTER TABLE "Measurement"
  ADD CONSTRAINT "measurement_state" CHECK ("status" IN ('PREENCHIMENTO', 'CONFERIDA', 'CANCELADA')),
  ADD CONSTRAINT "measurement_confirmed" CHECK ("status" <> 'CONFERIDA' OR
    ("confirmedAt" IS NOT NULL AND "confirmedSnapshot" IS NOT NULL AND
     jsonb_typeof("confirmedSnapshot") = 'object' AND "amount" > 0 AND
     "invoice" IS NOT NULL AND length(trim("invoice")) > 0));

-- As colunas legadas não são removidas, evitando perda de referências históricas.
COMMENT ON COLUMN "Measurement"."sentAt" IS 'Histórico legado: etapa de envio removida; Conferida é a situação final.';
COMMENT ON COLUMN "Measurement"."sentNote" IS 'Referência histórica do antigo fluxo de envio; sem ação operacional atual.';
COMMENT ON COLUMN "Measurement"."changedAfterSend" IS 'Sinalização histórica do antigo fluxo de envio; sem efeito no fluxo atual.';

COMMIT;
