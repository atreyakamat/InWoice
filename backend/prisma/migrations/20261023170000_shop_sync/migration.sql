-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "shopSyncCursor" TEXT,
ADD COLUMN     "shopSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shopSyncLastAt" TIMESTAMP(3),
ADD COLUMN     "shopSyncLastError" TEXT,
ADD COLUMN     "shopSyncToken" TEXT,
ADD COLUMN     "shopUrl" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "shopOrderRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_shopOrderRef_key" ON "Invoice"("shopOrderRef");
