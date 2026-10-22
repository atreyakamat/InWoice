-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "reminderDays" TEXT NOT NULL DEFAULT '-1,3,7,15',
ADD COLUMN     "remindersEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "remindersSent" INTEGER NOT NULL DEFAULT 0;
