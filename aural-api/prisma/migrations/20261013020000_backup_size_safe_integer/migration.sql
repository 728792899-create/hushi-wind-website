-- Keep the existing numeric JSON contract and exact byte counts through 2^53-1.
-- Rebuilding this relation preserves all prior result and verification fields.
BEGIN TRANSACTION;
CREATE TABLE "new_BackupRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "filename" TEXT NOT NULL,
    "size" REAL NOT NULL DEFAULT 0 CHECK ("size" >= 0 AND "size" <= 9007199254740991 AND "size" = CAST("size" AS INTEGER)),
    "status" TEXT NOT NULL DEFAULT 'success',
    "message" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'never',
    "verifiedAt" DATETIME,
    "verificationReport" TEXT,
    "adminUserId" INTEGER,
    "operator" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_BackupRecord" ("id", "filename", "size", "status", "message", "verificationStatus", "verifiedAt", "verificationReport", "adminUserId", "operator", "createdAt")
SELECT "id", "filename", "size", "status", "message", "verificationStatus", "verifiedAt", "verificationReport", "adminUserId", "operator", "createdAt" FROM "BackupRecord";
UPDATE sqlite_sequence SET seq = MAX(seq, COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'BackupRecord'), 0)) WHERE name = 'new_BackupRecord';
INSERT INTO sqlite_sequence (name, seq) SELECT 'new_BackupRecord', seq FROM sqlite_sequence WHERE name = 'BackupRecord' AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'new_BackupRecord');
DROP TABLE "BackupRecord";
ALTER TABLE "new_BackupRecord" RENAME TO "BackupRecord";
COMMIT;
