-- Open Finance connections + dedupe key on transactions
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "openFinanceId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_userId_openFinanceId_key"
  ON "Transaction"("userId", "openFinanceId");

CREATE TABLE IF NOT EXISTS "OpenFinanceConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "externalLinkId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'linked',
  "lastSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OpenFinanceConnection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OpenFinanceConnection_userId_idx" ON "OpenFinanceConnection"("userId");
CREATE INDEX IF NOT EXISTS "OpenFinanceConnection_userId_provider_idx" ON "OpenFinanceConnection"("userId", "provider");

ALTER TABLE "OpenFinanceConnection"
  ADD CONSTRAINT "OpenFinanceConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
