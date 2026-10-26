-- SQL CHECK permits UNKNOWN: guard required operands explicitly.
ALTER TABLE "PaymentTerm" DROP CONSTRAINT "payment_term_rule";
ALTER TABLE "PaymentTerm" ADD CONSTRAINT "payment_term_rule" CHECK (
  ("mode"='FIXO' AND "day" IS NOT NULL AND "day" BETWEEN 1 AND 31 AND "days" IS NULL)
  OR ("mode"='DIAS' AND "days" IS NOT NULL AND "days" BETWEEN 0 AND 365 AND "day" IS NULL)
);
ALTER TABLE "Contract" DROP CONSTRAINT "contract_payment_rule";
ALTER TABLE "Contract" ADD CONSTRAINT "contract_payment_rule" CHECK (
  ("paymentMode"='FIXO' AND "paymentDay" IS NOT NULL AND "paymentDay" BETWEEN 1 AND 31 AND "paymentDays" IS NULL)
  OR ("paymentMode"='DIAS' AND "paymentDays" IS NOT NULL AND "paymentDays" BETWEEN 0 AND 365 AND "paymentDay" IS NULL)
);
ALTER TABLE "Contract" ADD CONSTRAINT "contract_closure" CHECK (
  ("status" NOT IN ('ENCERRADO','CANCELADO') AND "closedOn" IS NULL AND "closureReason" IS NULL)
  OR ("status" IN ('ENCERRADO','CANCELADO') AND "closedOn" IS NOT NULL AND "closureReason" IS NOT NULL AND length(trim("closureReason"))>0 AND ("status"='CANCELADO' OR "closedOn">="start"))
);
