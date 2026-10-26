ALTER TABLE "Enrollment" ADD COLUMN "plan" TEXT;
ALTER TABLE "Enrollment" ADD CONSTRAINT "enrollment_health_plan" CHECK ("plan" IS NULL OR "plan" IN ('Básico', 'Apartamento', 'Especial'));
-- Preserve previously configured health-plan selections without guessing missing values.
UPDATE "Enrollment" AS e SET "plan" = b."plan"
FROM "Benefit" AS b
WHERE e."benefitId" = b.id AND b.kind = 'SAUDE'
AND b."plan" IN ('Básico', 'Apartamento', 'Especial');
