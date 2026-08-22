-- Fase 4: idempotência de webhooks Stripe (event.id único)
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StripeWebhookEvent_processedAt_idx" ON "StripeWebhookEvent"("processedAt");

-- Convite pendente único por org+e-mail (permite reconvite após aceite)
CREATE UNIQUE INDEX "Invitation_org_email_pending_key"
  ON "Invitation"("orgId", "email")
  WHERE "acceptedAt" IS NULL;
