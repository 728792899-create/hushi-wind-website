-- AlterTable
ALTER TABLE "Inquiry" ADD COLUMN "assigneeId" INTEGER;
ALTER TABLE "Inquiry" ADD COLUMN "nextFollowUpAt" DATETIME;
ALTER TABLE "Inquiry" ADD COLUMN "serialNumber" TEXT;

-- AlterTable
ALTER TABLE "ArtistApplication" ADD COLUMN "artistId" INTEGER;

-- AlterTable
ALTER TABLE "SupportFaq" ADD COLUMN "productIds" TEXT;
ALTER TABLE "SupportFaq" ADD COLUMN "series" TEXT;

-- AlterTable
ALTER TABLE "QuickGuide" ADD COLUMN "productIds" TEXT;
ALTER TABLE "QuickGuide" ADD COLUMN "series" TEXT;

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "specTemplate" TEXT NOT NULL DEFAULT '[]'
);

-- CreateTable
CREATE TABLE "ProductSeries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "categorySlug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "ContentDraft" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "module" TEXT NOT NULL,
    "recordId" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    "baseHash" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RecycleEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "module" TEXT NOT NULL,
    "recordId" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "InquiryFollowUp" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "inquiryId" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SubmissionReceipt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "recordId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MaintenanceRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "task" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "altText" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "metadata" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Artist" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "imageUrl" TEXT,
    "bio" TEXT,
    "equipment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Artist" ("bio", "createdAt", "equipment", "id", "imageUrl", "name", "role", "sortOrder", "updatedAt") SELECT "bio", "createdAt", "equipment", "id", "imageUrl", "name", "role", "sortOrder", "updatedAt" FROM "Artist";
DROP TABLE "Artist";
ALTER TABLE "new_Artist" RENAME TO "Artist";
CREATE TABLE "new_SupportDownload" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT,
    "productIds" TEXT,
    "series" TEXT,
    "version" TEXT,
    "language" TEXT NOT NULL DEFAULT 'zh-CN',
    "releasedAt" DATETIME,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'published'
);
INSERT INTO "new_SupportDownload" ("fileUrl", "id", "name", "size", "sortOrder", "status", "type") SELECT "fileUrl", "id", "name", "size", "sortOrder", "status", "type" FROM "SupportDownload";
DROP TABLE "SupportDownload";
ALTER TABLE "new_SupportDownload" RENAME TO "SupportDownload";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_slug_key" ON "ProductCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSeries_name_key" ON "ProductSeries"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ContentDraft_module_recordId_key" ON "ContentDraft"("module", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "RecycleEntry_module_recordId_key" ON "RecycleEntry"("module", "recordId");

-- CreateIndex
CREATE INDEX "InquiryFollowUp_inquiryId_createdAt_idx" ON "InquiryFollowUp"("inquiryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionReceipt_key_key" ON "SubmissionReceipt"("key");

-- CreateIndex
CREATE INDEX "SubmissionReceipt_createdAt_idx" ON "SubmissionReceipt"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_idx" ON "NotificationDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_url_key" ON "MediaAsset"("url");

-- CreateIndex
CREATE INDEX "MediaAsset_type_updatedAt_idx" ON "MediaAsset"("type", "updatedAt");

