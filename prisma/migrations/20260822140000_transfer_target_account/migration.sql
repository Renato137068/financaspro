-- Fase 2: transferências com conta destino por UUID
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "targetAccountId" TEXT;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_targetAccountId_fkey"
  FOREIGN KEY ("targetAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
