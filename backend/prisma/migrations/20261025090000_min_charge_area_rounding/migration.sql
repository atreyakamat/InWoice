-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "areaRoundUp" DOUBLE PRECISION NOT NULL DEFAULT 0.25;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "minCharge" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "minCharge" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "QuoteItem" ADD COLUMN     "minCharge" DOUBLE PRECISION;

