ALTER TABLE "BackupRecord" ADD COLUMN "verificationStatus" TEXT NOT NULL DEFAULT 'never';
ALTER TABLE "BackupRecord" ADD COLUMN "verifiedAt" DATETIME;
ALTER TABLE "BackupRecord" ADD COLUMN "verificationReport" TEXT;
