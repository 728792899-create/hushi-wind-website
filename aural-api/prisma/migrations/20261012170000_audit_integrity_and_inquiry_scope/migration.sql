-- Keep every original OperationLog value. The migration fixes the historical
-- boundary; the application seals its digest once before accepting new writes.
CREATE TABLE "AuditIntegrityState" (
  "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "version" INTEGER NOT NULL DEFAULT 1,
  "baselineCount" INTEGER NOT NULL,
  "baselineMaxId" INTEGER NOT NULL,
  "baselineHash" TEXT,
  "sealedAt" DATETIME,
  "entryCount" INTEGER NOT NULL DEFAULT 0,
  "lastLogId" INTEGER NOT NULL,
  "headHash" TEXT
);
INSERT INTO "AuditIntegrityState" ("id", "baselineCount", "baselineMaxId", "lastLogId")
SELECT 1, COUNT(*), COALESCE(MAX("id"), 0), COALESCE(MAX("id"), 0) FROM "OperationLog";

CREATE TABLE "AuditLogEntry" (
  "sequence" INTEGER NOT NULL PRIMARY KEY,
  "operationLogId" INTEGER NOT NULL,
  "previousHash" TEXT NOT NULL,
  "rowHash" TEXT NOT NULL,
  "hash" TEXT NOT NULL
);
CREATE UNIQUE INDEX "AuditLogEntry_operationLogId_key" ON "AuditLogEntry"("operationLogId");
CREATE INDEX "OperationLog_adminUserId_action_createdAt_idx" ON "OperationLog"("adminUserId", "action", "createdAt");

CREATE TRIGGER "OperationLog_no_update" BEFORE UPDATE ON "OperationLog"
BEGIN SELECT RAISE(ABORT, 'OperationLog is append-only'); END;
CREATE TRIGGER "OperationLog_no_delete" BEFORE DELETE ON "OperationLog"
BEGIN SELECT RAISE(ABORT, 'OperationLog is append-only'); END;
-- SQLite REPLACE can bypass DELETE triggers unless recursive_triggers is on.
CREATE TRIGGER "OperationLog_no_replace" BEFORE INSERT ON "OperationLog"
WHEN EXISTS (SELECT 1 FROM "OperationLog" WHERE "id" = NEW."id")
BEGIN SELECT RAISE(ABORT, 'OperationLog is append-only'); END;
CREATE TRIGGER "AuditLogEntry_no_update" BEFORE UPDATE ON "AuditLogEntry"
BEGIN SELECT RAISE(ABORT, 'AuditLogEntry is append-only'); END;
CREATE TRIGGER "AuditLogEntry_no_delete" BEFORE DELETE ON "AuditLogEntry"
BEGIN SELECT RAISE(ABORT, 'AuditLogEntry is append-only'); END;
CREATE TRIGGER "AuditLogEntry_no_replace" BEFORE INSERT ON "AuditLogEntry"
WHEN EXISTS (SELECT 1 FROM "AuditLogEntry" WHERE "sequence" = NEW."sequence" OR "operationLogId" = NEW."operationLogId")
BEGIN SELECT RAISE(ABORT, 'AuditLogEntry is append-only'); END;
CREATE TRIGGER "AuditIntegrityState_no_delete" BEFORE DELETE ON "AuditIntegrityState"
BEGIN SELECT RAISE(ABORT, 'AuditIntegrityState cannot be deleted'); END;
CREATE TRIGGER "AuditIntegrityState_no_replace" BEFORE INSERT ON "AuditIntegrityState"
WHEN EXISTS (SELECT 1 FROM "AuditIntegrityState" WHERE "id" = NEW."id")
BEGIN SELECT RAISE(ABORT, 'AuditIntegrityState cannot be replaced'); END;
CREATE TRIGGER "AuditIntegrityState_preserve_baseline" BEFORE UPDATE ON "AuditIntegrityState"
WHEN NEW."id" IS NOT OLD."id" OR NEW."version" IS NOT OLD."version"
  OR NEW."baselineCount" IS NOT OLD."baselineCount" OR NEW."baselineMaxId" IS NOT OLD."baselineMaxId"
  OR (OLD."baselineHash" IS NOT NULL AND (NEW."baselineHash" IS NOT OLD."baselineHash" OR NEW."sealedAt" IS NOT OLD."sealedAt"))
BEGIN SELECT RAISE(ABORT, 'AuditIntegrityState baseline is immutable'); END;

ALTER TABLE "RecycleEntry" ADD COLUMN "inquiryAssigneeId" INTEGER;
-- Invalid/legacy payloads stay unassigned; only positive JSON integer IDs count.
UPDATE "RecycleEntry" SET "inquiryAssigneeId" =
  CASE WHEN json_valid("payload") THEN
    CASE WHEN json_type("payload", '$.assigneeId') = 'integer' AND json_extract("payload", '$.assigneeId') > 0
      THEN json_extract("payload", '$.assigneeId') ELSE NULL END
    ELSE NULL END
WHERE "module" = 'inquiry';
CREATE INDEX "RecycleEntry_module_inquiryAssigneeId_createdAt_idx" ON "RecycleEntry"("module", "inquiryAssigneeId", "createdAt");
