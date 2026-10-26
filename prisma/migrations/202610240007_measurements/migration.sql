-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contractId" TEXT,
    "forecastId" TEXT,
    "originalId" TEXT,
    "supplierId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "invoice" TEXT,
    "issue" DATE NOT NULL,
    "due" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'VALOR',
    "status" TEXT NOT NULL DEFAULT 'PREENCHIMENTO',
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "reviewConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "varianceConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "sourceSnapshot" JSONB NOT NULL,
    "confirmedSnapshot" JSONB,
    "confirmedAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "sentNote" TEXT,
    "changedAfterSend" BOOLEAN NOT NULL DEFAULT false,
    "changedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurementLine" (
    "id" TEXT NOT NULL,
    "measurementId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "employmentId" TEXT,
    "dependentId" TEXT,
    "enrollmentId" TEXT,
    "itemId" TEXT,
    "unitName" TEXT NOT NULL,
    "costCenterName" TEXT NOT NULL,
    "costCenterCode" TEXT NOT NULL,
    "employeeName" TEXT,
    "coveredName" TEXT,
    "plan" TEXT,
    "reference" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "MeasurementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurementHistory" (
    "id" TEXT NOT NULL,
    "measurementId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "authorId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeasurementHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Measurement_code_key" ON "Measurement"("code");

-- CreateIndex
CREATE INDEX "Measurement_month_status_due_idx" ON "Measurement"("month", "status", "due");

-- CreateIndex
CREATE INDEX "Measurement_contractId_month_idx" ON "Measurement"("contractId", "month");

-- CreateIndex
CREATE INDEX "Measurement_originalId_idx" ON "Measurement"("originalId");

-- CreateIndex
CREATE INDEX "MeasurementLine_measurementId_kind_idx" ON "MeasurementLine"("measurementId", "kind");

-- CreateIndex
CREATE INDEX "MeasurementLine_enrollmentId_idx" ON "MeasurementLine"("enrollmentId");

-- CreateIndex
CREATE INDEX "MeasurementHistory_measurementId_at_idx" ON "MeasurementHistory"("measurementId", "at");

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_forecastId_fkey" FOREIGN KEY ("forecastId") REFERENCES "ContractForecast"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_originalId_fkey" FOREIGN KEY ("originalId") REFERENCES "Measurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ContractCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementLine" ADD CONSTRAINT "MeasurementLine_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "Measurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementLine" ADD CONSTRAINT "MeasurementLine_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementLine" ADD CONSTRAINT "MeasurementLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementLine" ADD CONSTRAINT "MeasurementLine_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementLine" ADD CONSTRAINT "MeasurementLine_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "Dependent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementLine" ADD CONSTRAINT "MeasurementLine_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementLine" ADD CONSTRAINT "MeasurementLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ContractItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementHistory" ADD CONSTRAINT "MeasurementHistory_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "Measurement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementHistory" ADD CONSTRAINT "MeasurementHistory_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "measurement_unique_principal" ON "Measurement"("contractId","month") WHERE "originalId" IS NULL AND "status"<>'CANCELADA';
CREATE UNIQUE INDEX "measurement_unique_enrollment" ON "MeasurementLine"("measurementId","enrollmentId") WHERE "kind"='PESSOA';
CREATE UNIQUE INDEX "measurement_unique_center" ON "MeasurementLine"("measurementId","unitId","costCenterId") WHERE "kind"='CENTRO';
ALTER TABLE "Measurement" ADD CONSTRAINT "measurement_state" CHECK ("status" IN ('PREENCHIMENTO','CONFERIDA','ENVIADA','CANCELADA')), ADD CONSTRAINT "measurement_mode" CHECK ("mode" IN ('PESSOAS','VALOR','PERCENTUAL')), ADD CONSTRAINT "measurement_values" CHECK ("amount">=0 AND "version">0 AND "month"=date_trunc('month',"month")::date AND "due">="issue"), ADD CONSTRAINT "measurement_original" CHECK ("originalId"<>"id"), ADD CONSTRAINT "measurement_confirmed" CHECK ("status" NOT IN ('CONFERIDA','ENVIADA') OR ("confirmedAt" IS NOT NULL AND "confirmedSnapshot" IS NOT NULL AND jsonb_typeof("confirmedSnapshot")='object' AND "amount">0 AND "invoice" IS NOT NULL AND length(trim("invoice"))>0)), ADD CONSTRAINT "measurement_sent" CHECK ("status"<>'ENVIADA' OR "sentAt" IS NOT NULL);
ALTER TABLE "MeasurementLine" ADD CONSTRAINT "measurement_line_kind" CHECK ("kind" IN ('PESSOA','CENTRO','AJUSTE')), ADD CONSTRAINT "measurement_line_values" CHECK ("reference">=0 AND "percent" BETWEEN 0 AND 100 AND ("amount">=0 OR "kind"='AJUSTE')), ADD CONSTRAINT "measurement_line_person" CHECK ("kind"<>'PESSOA' OR ("employmentId" IS NOT NULL AND "enrollmentId" IS NOT NULL AND "itemId" IS NOT NULL)), ADD CONSTRAINT "measurement_line_adjustment" CHECK ("kind"<>'AJUSTE' OR ("reason" IS NOT NULL AND length(trim("reason"))>0));
