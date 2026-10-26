ALTER TABLE "Supplier" ADD COLUMN "categoryId" TEXT;
CREATE INDEX "Supplier_categoryId_idx" ON "Supplier"("categoryId");
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ContractCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
