-- Create dedicated idempotency storage for checkout requests with TTL expiration
CREATE TABLE "checkout_idempotency" (
  "id" SERIAL NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "orderExternalId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "checkout_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checkout_idempotency_idempotencyKey_key" ON "checkout_idempotency"("idempotencyKey");
CREATE INDEX "checkout_idempotency_expiresAt_idx" ON "checkout_idempotency"("expiresAt");
