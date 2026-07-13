-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sku" TEXT,
    "model" TEXT,
    "color" TEXT,
    "type" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "gallery" TEXT,
    "specs" TEXT,
    "features" TEXT,
    "scenes" TEXT,
    "warranty" TEXT,
    "series" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'published',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "seoKeywords" TEXT,
    "ogImageUrl" TEXT,
    "relatedProductIds" TEXT,
    "accessories" TEXT,
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),
    "lastEditedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "imageUrl" TEXT,
    "date" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'published',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "seoKeywords" TEXT,
    "ogImageUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),
    "lastEditedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "heroImageUrl" TEXT,
    "aboutTitle" TEXT,
    "aboutText" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "footerText" TEXT,
    "coreTechImageUrl" TEXT,
    "coreTechTitle" TEXT,
    "coreTechDesc" TEXT,
    "coreTechLinkText" TEXT,
    "coreTechBgColor" TEXT DEFAULT '#0a0a0a',
    "coreTechBgImageUrl" TEXT,
    "quoteText" TEXT,
    "quoteAuthor" TEXT,
    "quoteBgImageUrl" TEXT,
    "artistHeroImageUrl" TEXT,
    "audioHeroImageUrl" TEXT,
    "supportHeroImageUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" SERIAL NOT NULL,
    "customerName" TEXT NOT NULL,
    "contactInfo" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "inquiryType" TEXT,
    "productId" INTEGER,
    "productTitle" TEXT,
    "city" TEXT,
    "budget" TEXT,
    "preferredTime" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "internalNote" TEXT,
    "followedAt" TIMESTAMP(3),
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtistApplication" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "portfolioUrl" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artist" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "imageUrl" TEXT,
    "bio" TEXT,
    "equipment" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportFaq" (
    "id" SERIAL NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'published',

    CONSTRAINT "SupportFaq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportDownload" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'published',

    CONSTRAINT "SupportDownload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioSolution" (
    "id" SERIAL NOT NULL,
    "en" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'published',

    CONSTRAINT "AudioSolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioStat" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'published',

    CONSTRAINT "AudioStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandTimeline" (
    "id" SERIAL NOT NULL,
    "year" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'published',

    CONSTRAINT "BrandTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcosystemService" (
    "id" SERIAL NOT NULL,
    "icon" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "imageUrl" TEXT,
    "link" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'published',

    CONSTRAINT "EcosystemService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickGuide" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "coverUrl" TEXT,
    "videoUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'published',

    CONSTRAINT "QuickGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageContent" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'super_admin',
    "status" TEXT NOT NULL DEFAULT 'active',
    "passwordHash" TEXT NOT NULL,
    "passwordSalt" TEXT NOT NULL,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginRecord" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "adminUserId" INTEGER,
    "success" BOOLEAN NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationLog" (
    "id" SERIAL NOT NULL,
    "adminUserId" INTEGER,
    "operator" TEXT,
    "role" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "target" TEXT,
    "targetId" TEXT,
    "summary" TEXT,
    "beforeData" TEXT,
    "afterData" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportRecord" (
    "id" SERIAL NOT NULL,
    "adminUserId" INTEGER,
    "operator" TEXT,
    "module" TEXT NOT NULL,
    "filters" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "filename" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentVersion" (
    "id" SERIAL NOT NULL,
    "module" TEXT NOT NULL,
    "recordId" INTEGER NOT NULL,
    "title" TEXT,
    "status" TEXT,
    "snapshot" TEXT NOT NULL,
    "adminUserId" INTEGER,
    "operator" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRecord" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'success',
    "message" TEXT,
    "adminUserId" INTEGER,
    "operator" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" SERIAL NOT NULL,
    "eventType" TEXT NOT NULL,
    "pagePath" TEXT,
    "source" TEXT,
    "sessionId" TEXT,
    "visitorId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "entityTitle" TEXT,
    "searchTerm" TEXT,
    "ctaName" TEXT,
    "metadata" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiRequestLog" (
    "id" SERIAL NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRecord" (
    "id" SERIAL NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'warning',
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "metadata" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PageContent_slug_key" ON "PageContent"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_eventType_createdAt_idx" ON "AnalyticsEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_entityType_entityId_idx" ON "AnalyticsEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_sessionId_createdAt_idx" ON "AnalyticsEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiRequestLog_status_createdAt_idx" ON "ApiRequestLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ApiRequestLog_path_createdAt_idx" ON "ApiRequestLog"("path", "createdAt");

-- CreateIndex
CREATE INDEX "AlertRecord_type_createdAt_idx" ON "AlertRecord"("type", "createdAt");

-- CreateIndex
CREATE INDEX "AlertRecord_status_createdAt_idx" ON "AlertRecord"("status", "createdAt");
