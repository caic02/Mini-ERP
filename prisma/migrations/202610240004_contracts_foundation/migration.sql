-- CreateTable
CREATE TABLE "ContractSequence" (
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContractSequence_pkey" PRIMARY KEY ("kind")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeName" TEXT,
    "document" TEXT,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "paymentTermId" TEXT,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ContractCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTerm" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "day" INTEGER,
    "days" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PaymentTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "externalNumber" TEXT,
    "name" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "paymentTermId" TEXT NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "paymentDay" INTEGER,
    "paymentDays" INTEGER,
    "start" DATE NOT NULL,
    "end" DATE,
    "adjustmentDate" DATE,
    "alertDays" INTEGER NOT NULL DEFAULT 90,
    "kind" TEXT NOT NULL DEFAULT 'FIXO',
    "status" TEXT NOT NULL DEFAULT 'ELABORACAO',
    "activatedAt" TIMESTAMPTZ(3),
    "closedOn" DATE,
    "closureReason" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "billingUnit" TEXT NOT NULL DEFAULT 'MENSALIDADE',
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "allocationMode" TEXT NOT NULL DEFAULT 'VALOR',
    "benefitId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ContractItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractForecast" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "due" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVISTA',
    "reason" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContractForecast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ContractCategory_code_key" ON "ContractCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ContractCategory_name_key" ON "ContractCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTerm_code_key" ON "PaymentTerm"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_code_key" ON "Contract"("code");

-- CreateIndex
CREATE INDEX "Contract_status_start_end_idx" ON "Contract"("status", "start", "end");

-- CreateIndex
CREATE INDEX "Contract_supplierId_unitId_categoryId_idx" ON "Contract"("supplierId", "unitId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractItem_code_key" ON "ContractItem"("code");

-- CreateIndex
CREATE INDEX "ContractItem_contractId_active_idx" ON "ContractItem"("contractId", "active");

-- CreateIndex
CREATE INDEX "ContractItem_benefitId_idx" ON "ContractItem"("benefitId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractForecast_code_key" ON "ContractForecast"("code");

-- CreateIndex
CREATE INDEX "ContractForecast_month_status_due_idx" ON "ContractForecast"("month", "status", "due");

-- CreateIndex
CREATE UNIQUE INDEX "ContractForecast_contractId_month_key" ON "ContractForecast"("contractId", "month");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ContractCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractItem" ADD CONSTRAINT "ContractItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractItem" ADD CONSTRAINT "ContractItem_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "Benefit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractForecast" ADD CONSTRAINT "ContractForecast_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContractSequence" ADD CONSTRAINT "contract_sequence_positive" CHECK ("value">=0);
ALTER TABLE "PaymentTerm" ADD CONSTRAINT "payment_term_rule" CHECK (("mode"='FIXO' AND "day" BETWEEN 1 AND 31 AND "days" IS NULL) OR ("mode"='DIAS' AND "days" BETWEEN 0 AND 365 AND "day" IS NULL));
ALTER TABLE "Contract" ADD CONSTRAINT "contract_dates" CHECK ("end" IS NULL OR "end">="start"), ADD CONSTRAINT "contract_kind" CHECK ("kind" IN ('FIXO','VARIAVEL','EVENTUAL')), ADD CONSTRAINT "contract_status" CHECK ("status" IN ('ELABORACAO','VIGENTE','SUSPENSO','ENCERRADO','CANCELADO')), ADD CONSTRAINT "contract_payment_rule" CHECK (("paymentMode"='FIXO' AND "paymentDay" BETWEEN 1 AND 31 AND "paymentDays" IS NULL) OR ("paymentMode"='DIAS' AND "paymentDays" BETWEEN 0 AND 365 AND "paymentDay" IS NULL)), ADD CONSTRAINT "contract_version_positive" CHECK ("version">0), ADD CONSTRAINT "contract_alert_days" CHECK ("alertDays" BETWEEN 1 AND 365);
ALTER TABLE "ContractItem" ADD CONSTRAINT "contract_item_values" CHECK ("quantity">0 AND "unitPrice">=0), ADD CONSTRAINT "contract_item_allocation" CHECK ("allocationMode" IN ('VALOR','PERCENTUAL','PESSOAS') AND ("allocationMode"<>'PESSOAS' OR "benefitId" IS NOT NULL)), ADD CONSTRAINT "contract_item_unit" CHECK ("billingUnit" IN ('MENSALIDADE','PESSOA','HORA','SERVICO','OUTRA'));
ALTER TABLE "ContractForecast" ADD CONSTRAINT "forecast_values" CHECK ("amount">=0 AND "month"=date_trunc('month',"month")::date), ADD CONSTRAINT "forecast_status" CHECK ("status" IN ('PREVISTA','CANCELADA'));
