-- Sync v2: tombstones + idempotência
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Transaction_userId_updatedAt_idx" ON "Transaction"("userId", "updatedAt");

CREATE TABLE IF NOT EXISTS "SyncOp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resultJson" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncOp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SyncOp_userId_idx" ON "SyncOp"("userId");

ALTER TABLE "SyncOp" ADD CONSTRAINT "SyncOp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
