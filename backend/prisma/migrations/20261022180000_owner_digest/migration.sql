-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "lastOwnerDigestAt" TIMESTAMP(3),
ADD COLUMN     "ownerDigestEnabled" BOOLEAN NOT NULL DEFAULT false;

