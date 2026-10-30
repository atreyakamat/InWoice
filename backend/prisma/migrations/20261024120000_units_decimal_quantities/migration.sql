-- AlterTable
ALTER TABLE "CreditNoteItem" ALTER COLUMN "quantity" SET DEFAULT 0,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "details" TEXT,
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'pcs',
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'pcs';

-- AlterTable
ALTER TABLE "QuoteItem" ADD COLUMN     "details" TEXT,
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'pcs',
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "RecurringInvoiceItem" ADD COLUMN     "details" TEXT,
ADD COLUMN     "unit" TEXT,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

