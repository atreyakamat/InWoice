-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "autoMailUserId" TEXT,
ADD COLUMN     "googleClientId" TEXT,
ADD COLUMN     "googleClientSecret" TEXT,
ADD COLUMN     "signatureUrl" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "gmailAddress" TEXT,
ADD COLUMN     "gmailConnectedAt" TIMESTAMP(3),
ADD COLUMN     "gmailRefreshToken" TEXT;

