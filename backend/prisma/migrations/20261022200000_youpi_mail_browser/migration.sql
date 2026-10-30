-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "mailBrowser" TEXT,
ADD COLUMN     "mailBrowserProfile" TEXT,
ADD COLUMN     "youpiApiUrl" TEXT,
ADD COLUMN     "youpiEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "youpiMerchantId" TEXT,
ADD COLUMN     "youpiWebhookSecret" TEXT;

-- CreateTable
CREATE TABLE "OnlinePayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'YOUPI',
    "orderId" TEXT NOT NULL,
    "gatewayPaymentId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "checkoutUrl" TEXT,
    "utr" TEXT,
    "paymentId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnlinePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnlinePayment_orderId_key" ON "OnlinePayment"("orderId");

-- CreateIndex
CREATE INDEX "OnlinePayment_invoiceId_idx" ON "OnlinePayment"("invoiceId");

-- CreateIndex
CREATE INDEX "OnlinePayment_status_createdAt_idx" ON "OnlinePayment"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "OnlinePayment" ADD CONSTRAINT "OnlinePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

