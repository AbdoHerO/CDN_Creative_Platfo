-- Trigram search indexes (Creative.name, CreativeFile.originalFilename)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "RoleKey" AS ENUM ('ADMIN', 'MANAGER', 'CREATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "LibraryView" AS ENUM ('GRID', 'LIST');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('VIDEO', 'IMAGE', 'DOCUMENT', 'AUDIO', 'OTHER');

-- CreateEnum
CREATE TYPE "CreativeCategory" AS ENUM ('MARKETING_VIDEO', 'ADVERTISING_VIDEO', 'SOCIAL_MEDIA_POST', 'BANNER', 'PROMOTIONAL_IMAGE', 'CAMPAIGN_VISUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "CreativeStatus" AS ENUM ('DRAFT', 'PENDING', 'IN_REVIEW', 'APPROVED', 'DECLINED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK', 'YOUTUBE', 'X', 'WHATSAPP', 'WEBSITE', 'EMAIL', 'DISPLAY_ADS', 'IN_APP', 'PRINT', 'OTHER');

-- CreateEnum
CREATE TYPE "VersionType" AS ENUM ('FULL', 'PREVIEW', 'VARIANT');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrityStatus" AS ENUM ('PENDING', 'VERIFIED', 'MISMATCH', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "ValidationAction" AS ENUM ('SUBMITTED', 'REVIEW_STARTED', 'APPROVED', 'DECLINED', 'CHANGES_REQUESTED', 'WITHDRAWN', 'REOPENED', 'ARCHIVED', 'RESTORED', 'RESET_NEW_VERSION');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_LOGIN_FAILED', 'PASSWORD_CHANGED', 'CREATIVE_CREATED', 'CREATIVE_UPDATED', 'CREATIVE_DELETED', 'CREATIVE_STATUS_CHANGED', 'CREATIVE_APPROVED', 'CREATIVE_DECLINED', 'CREATIVE_ARCHIVED', 'CREATIVE_RESTORED', 'FILE_UPLOADED', 'VERSION_UPLOADED', 'FILE_DELETED', 'FILE_MOVED', 'FILE_SET_CURRENT', 'FILE_DOWNLOADED', 'FILE_INTEGRITY_FAILED', 'APPLICATION_CREATED', 'APPLICATION_UPDATED', 'APPLICATION_STATUS_CHANGED', 'CAMPAIGN_CREATED', 'CAMPAIGN_UPDATED', 'CAMPAIGN_DELETED', 'USER_CREATED', 'USER_UPDATED', 'USER_ROLE_CHANGED', 'USER_DISABLED', 'USER_ENABLED', 'USER_PASSWORD_RESET', 'IMPORT_STARTED', 'IMPORT_COMPLETED', 'IMPORT_FAILED', 'SETTINGS_UPDATED', 'STORAGE_RECONCILED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('USER', 'CREATIVE', 'FILE', 'APPLICATION', 'CAMPAIGN', 'IMPORT', 'SETTINGS', 'STORAGE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CREATIVE_SUBMITTED', 'CREATIVE_APPROVED', 'CREATIVE_DECLINED', 'CHANGES_REQUESTED', 'PROCESSING_FAILED', 'INTEGRITY_FAILED', 'IMPORT_READY', 'IMPORT_COMPLETED', 'IMPORT_FAILED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "UploadPurpose" AS ENUM ('CREATIVE_FILE', 'ZIP_IMPORT');

-- CreateEnum
CREATE TYPE "UploadMode" AS ENUM ('SINGLE', 'MULTIPART');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('UPLOADING', 'COMPLETED', 'ABORTED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADING', 'ANALYZING', 'READY_FOR_REVIEW', 'IMPORTING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportItemStatus" AS ENUM ('PENDING', 'REJECTED', 'SKIPPED', 'IMPORTING', 'IMPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('PROCESS_FILE', 'DELETE_OBJECTS', 'ANALYZE_IMPORT', 'RUN_IMPORT', 'RECONCILE_STORAGE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SnapshotStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" "RoleKey" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobTitle" TEXT,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "showPreviewVersions" BOOLEAN NOT NULL DEFAULT false,
    "libraryView" "LibraryView" NOT NULL DEFAULT 'GRID',
    "restrictApplications" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserApplicationAccess" (
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserApplicationAccess_pkey" PRIMARY KEY ("userId","applicationId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "brandColor" TEXT NOT NULL DEFAULT '#4F46E5',
    "logoKey" TEXT,
    "logoMimeType" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "description" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "status" "CampaignStatus" NOT NULL DEFAULT 'PLANNED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creative" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "applicationId" TEXT NOT NULL,
    "campaignId" TEXT,
    "category" "CreativeCategory" NOT NULL DEFAULT 'OTHER',
    "mediaType" "MediaType" NOT NULL DEFAULT 'OTHER',
    "status" "CreativeStatus" NOT NULL DEFAULT 'DRAFT',
    "channels" "Channel"[],
    "keywords" TEXT[],
    "matchKey" TEXT NOT NULL,
    "archivedFromStatus" "CreativeStatus",
    "createdById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Creative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeFile" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "versionType" "VersionType" NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "originalFilename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" DOUBLE PRECISION,
    "frameRate" DOUBLE PRECISION,
    "videoCodec" TEXT,
    "audioCodec" TEXT,
    "bitrate" INTEGER,
    "pageCount" INTEGER,
    "checksumSha256" TEXT,
    "verifiedSha256" TEXT,
    "integrityStatus" "IntegrityStatus" NOT NULL DEFAULT 'PENDING',
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "processingError" TEXT,
    "thumbnailKey" TEXT,
    "thumbnailBytes" INTEGER,
    "displayKey" TEXT,
    "displayBytes" INTEGER,
    "metadata" JSONB,
    "uploadedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeTag" (
    "creativeId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreativeTag_pkey" PRIMARY KEY ("creativeId","tagId")
);

-- CreateTable
CREATE TABLE "CampaignTag" (
    "campaignId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignTag_pkey" PRIMARY KEY ("campaignId","tagId")
);

-- CreateTable
CREATE TABLE "Validation" (
    "id" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "action" "ValidationAction" NOT NULL,
    "fromStatus" "CreativeStatus" NOT NULL,
    "toStatus" "CreativeStatus" NOT NULL,
    "reviewerId" TEXT,
    "comment" TEXT,
    "reason" TEXT,
    "fileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Validation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "ActivityAction" NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT,
    "creativeId" TEXT,
    "applicationId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "creativeId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "UploadPurpose" NOT NULL,
    "mode" "UploadMode" NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'UPLOADING',
    "storageKey" TEXT NOT NULL,
    "uploadId" TEXT,
    "filename" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "partSize" INTEGER,
    "partCount" INTEGER,
    "fingerprint" TEXT NOT NULL,
    "checksumSha256" TEXT,
    "creativeId" TEXT,
    "fileId" TEXT,
    "versionType" "VersionType",
    "label" TEXT,
    "importBatchId" TEXT,
    "errorMessage" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "createdById" TEXT,
    "applicationId" TEXT NOT NULL,
    "campaignId" TEXT,
    "archiveFilename" TEXT NOT NULL,
    "archiveKey" TEXT,
    "archiveSizeBytes" BIGINT NOT NULL,
    "keepArchive" BOOLEAN NOT NULL DEFAULT false,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADING',
    "errorMessage" TEXT,
    "totalEntries" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "totalBytes" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "entryPath" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "compressedBytes" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "versionType" "VersionType" NOT NULL,
    "matchKey" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "creativeName" TEXT NOT NULL,
    "category" "CreativeCategory" NOT NULL,
    "suggestedApplicationId" TEXT,
    "suggestedCampaignId" TEXT,
    "applicationId" TEXT,
    "campaignId" TEXT,
    "targetCreativeId" TEXT,
    "include" BOOLEAN NOT NULL DEFAULT true,
    "status" "ImportItemStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "errorMessage" TEXT,
    "createdCreativeId" TEXT,
    "createdFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageSnapshot" (
    "id" TEXT NOT NULL,
    "status" "SnapshotStatus" NOT NULL DEFAULT 'RUNNING',
    "totalObjects" INTEGER NOT NULL DEFAULT 0,
    "totalBytes" BIGINT NOT NULL DEFAULT 0,
    "orphanObjects" INTEGER NOT NULL DEFAULT 0,
    "orphanBytes" BIGINT NOT NULL DEFAULT 0,
    "missingObjects" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,
    "error" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StorageSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "UserApplicationAccess_applicationId_idx" ON "UserApplicationAccess"("applicationId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "Application_name_key" ON "Application"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Application_slug_key" ON "Application"("slug");

-- CreateIndex
CREATE INDEX "Application_status_sortOrder_idx" ON "Application"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "Campaign_applicationId_status_idx" ON "Campaign"("applicationId", "status");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_applicationId_slug_key" ON "Campaign"("applicationId", "slug");

-- CreateIndex
CREATE INDEX "Creative_applicationId_status_idx" ON "Creative"("applicationId", "status");

-- CreateIndex
CREATE INDEX "Creative_applicationId_matchKey_idx" ON "Creative"("applicationId", "matchKey");

-- CreateIndex
CREATE INDEX "Creative_campaignId_idx" ON "Creative"("campaignId");

-- CreateIndex
CREATE INDEX "Creative_status_updatedAt_idx" ON "Creative"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Creative_createdById_idx" ON "Creative"("createdById");

-- CreateIndex
CREATE INDEX "Creative_createdAt_idx" ON "Creative"("createdAt");

-- CreateIndex
CREATE INDEX "Creative_category_idx" ON "Creative"("category");

-- CreateIndex
CREATE INDEX "Creative_name_trgm_idx" ON "Creative" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "CreativeFile_storageKey_key" ON "CreativeFile"("storageKey");

-- CreateIndex
CREATE INDEX "CreativeFile_creativeId_versionType_isCurrent_idx" ON "CreativeFile"("creativeId", "versionType", "isCurrent");

-- CreateIndex
CREATE INDEX "CreativeFile_versionType_isCurrent_idx" ON "CreativeFile"("versionType", "isCurrent");

-- CreateIndex
CREATE INDEX "CreativeFile_sizeBytes_idx" ON "CreativeFile"("sizeBytes");

-- CreateIndex
CREATE INDEX "CreativeFile_processingStatus_idx" ON "CreativeFile"("processingStatus");

-- CreateIndex
CREATE INDEX "CreativeFile_originalFilename_trgm_idx" ON "CreativeFile" USING GIN ("originalFilename" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "CreativeFile_creativeId_versionType_versionNumber_key" ON "CreativeFile"("creativeId", "versionType", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "CreativeTag_tagId_idx" ON "CreativeTag"("tagId");

-- CreateIndex
CREATE INDEX "CampaignTag_tagId_idx" ON "CampaignTag"("tagId");

-- CreateIndex
CREATE INDEX "Validation_creativeId_createdAt_idx" ON "Validation"("creativeId", "createdAt");

-- CreateIndex
CREATE INDEX "Validation_reviewerId_idx" ON "Validation"("reviewerId");

-- CreateIndex
CREATE INDEX "Validation_action_createdAt_idx" ON "Validation"("action", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_actorId_createdAt_idx" ON "ActivityLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_creativeId_createdAt_idx" ON "ActivityLog"("creativeId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_action_createdAt_idx" ON "ActivityLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_entityId_idx" ON "ActivityLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ActivityLog_applicationId_createdAt_idx" ON "ActivityLog"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UploadSession_storageKey_key" ON "UploadSession"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "UploadSession_fileId_key" ON "UploadSession"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "UploadSession_importBatchId_key" ON "UploadSession"("importBatchId");

-- CreateIndex
CREATE INDEX "UploadSession_userId_status_idx" ON "UploadSession"("userId", "status");

-- CreateIndex
CREATE INDEX "UploadSession_userId_fingerprint_idx" ON "UploadSession"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "UploadSession_status_expiresAt_idx" ON "UploadSession"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ImportBatch_createdById_createdAt_idx" ON "ImportBatch"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "ImportBatch_status_idx" ON "ImportBatch"("status");

-- CreateIndex
CREATE INDEX "ImportItem_batchId_status_idx" ON "ImportItem"("batchId", "status");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Job_type_status_idx" ON "Job"("type", "status");

-- CreateIndex
CREATE INDEX "StorageSnapshot_createdAt_idx" ON "StorageSnapshot"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApplicationAccess" ADD CONSTRAINT "UserApplicationAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApplicationAccess" ADD CONSTRAINT "UserApplicationAccess_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creative" ADD CONSTRAINT "Creative_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creative" ADD CONSTRAINT "Creative_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creative" ADD CONSTRAINT "Creative_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeFile" ADD CONSTRAINT "CreativeFile_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeFile" ADD CONSTRAINT "CreativeFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeTag" ADD CONSTRAINT "CreativeTag_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeTag" ADD CONSTRAINT "CreativeTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTag" ADD CONSTRAINT "CampaignTag_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTag" ADD CONSTRAINT "CampaignTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Validation" ADD CONSTRAINT "Validation_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Validation" ADD CONSTRAINT "Validation_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
