-- Business constraints complement API validation. Histories use RESTRICT FKs.
CREATE UNIQUE INDEX "one_active_headquarters" ON "Unit" ("companyId") WHERE "active" AND "kind" = 'MATRIZ';
CREATE UNIQUE INDEX "one_open_employment_per_person" ON "Employment" ("personId") WHERE "termination" IS NULL;
ALTER TABLE "Company" ADD CONSTRAINT "single_company" CHECK (id = 'middleby'), ADD CONSTRAINT "valid_target" CHECK ("targetMonths" BETWEEN 1 AND 12);
ALTER TABLE "User" ADD CONSTRAINT "user_role" CHECK (role IN ('RH','CONSULTA'));
ALTER TABLE "Unit" ADD CONSTRAINT "unit_kind" CHECK (kind IN ('MATRIZ','FILIAL'));
ALTER TABLE "Employment" ADD CONSTRAINT "employment_dates" CHECK ("termination" IS NULL OR "termination">="admission"), ADD CONSTRAINT "employment_status" CHECK (status IN ('ATIVO','INATIVO','DESLIGADO')), ADD CONSTRAINT "employment_termination_status" CHECK ((status='DESLIGADO') = ("termination" IS NOT NULL));
ALTER TABLE "VacationPeriod" ADD CONSTRAINT "period_dates" CHECK ("end">="start" AND "concessionStart">"end" AND "concessionEnd">="concessionStart"), ADD CONSTRAINT "period_right" CHECK (entitlement>=0);
ALTER TABLE "VacationBooking" ADD CONSTRAINT "booking_days" CHECK (days>0 AND "end" = "start" + days - 1 AND "returnDate"="end"+1), ADD CONSTRAINT "booking_status" CHECK (status IN ('RASCUNHO','PROGRAMADA','APROVADA','EM_ANDAMENTO','CONCLUIDA','CANCELADA'));
ALTER TABLE "VacationAdjustment" ADD CONSTRAINT "adjustment_kind" CHECK (kind IN ('ABONO','AJUSTE') AND (kind<>'ABONO' OR days>0));
ALTER TABLE "Leave" ADD CONSTRAINT "leave_dates" CHECK (("expectedEnd" IS NULL OR "expectedEnd">="start") AND ("actualEnd" IS NULL OR "actualEnd">="start"));
ALTER TABLE "Enrollment" ADD CONSTRAINT "enrollment_dates" CHECK ("end" IS NULL OR "end">="start"), ADD CONSTRAINT "enrollment_cost" CHECK (("companyCost" IS NULL OR "companyCost">=0) AND ("employeeCost" IS NULL OR "employeeCost">=0)), ADD CONSTRAINT "enrollment_closed" CHECK (active OR "end" IS NOT NULL);
ALTER TABLE "Nomination" ADD CONSTRAINT "nomination_dates" CHECK ("end" IS NULL OR "end">="start");
INSERT INTO "Company" (id,name,code,"alertDays") VALUES ('middleby','Middleby do Brasil','MIDDLEBY',ARRAY[90,60,30]);
INSERT INTO "Lookup" (id,kind,name,tag) VALUES
('rel-spouse','PARENTESCO','Cônjuge',NULL),('rel-partner','PARENTESCO','Companheiro(a)',NULL),('rel-child','PARENTESCO','Filho(a)',NULL),('rel-stepchild','PARENTESCO','Enteado(a)',NULL),('rel-father','PARENTESCO','Pai',NULL),('rel-mother','PARENTESCO','Mãe',NULL),('rel-grandfather','PARENTESCO','Avô',NULL),('rel-grandmother','PARENTESCO','Avó',NULL),('rel-other','PARENTESCO','Outro','OUTRO'),
('leave-maternity','AFASTAMENTO','Licença-maternidade','MATERNIDADE'),('leave-other','AFASTAMENTO','Outra licença','LICENCA'),('leave-away','AFASTAMENTO','Afastamento',NULL),
('benefit-health','BENEFICIO','Saúde','SAUDE'),('benefit-dental','BENEFICIO','Odontológico','ODONTO'),('benefit-life','BENEFICIO','Seguro de vida','VIDA'),('benefit-vr','BENEFICIO','Vale-refeição','VR'),('benefit-va','BENEFICIO','Vale-alimentação','VA'),('benefit-vt','BENEFICIO','Vale-transporte','VT'),('benefit-other','BENEFICIO','Outro','OUTRO');
