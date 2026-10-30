-- AlterEnum
ALTER TYPE "ActivityAction" ADD VALUE 'FILE_REPLACED';

-- AlterTable
ALTER TABLE "ImportItem" ADD COLUMN     "newApplicationName" TEXT;

-- AlterTable
ALTER TABLE "UploadSession" ADD COLUMN     "replacesFileId" TEXT;

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366F1',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeBadge" (
    "creativeId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreativeBadge_pkey" PRIMARY KEY ("creativeId","badgeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Badge_name_key" ON "Badge"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_slug_key" ON "Badge"("slug");

-- CreateIndex
CREATE INDEX "Badge_sortOrder_idx" ON "Badge"("sortOrder");

-- CreateIndex
CREATE INDEX "CreativeBadge_badgeId_idx" ON "CreativeBadge"("badgeId");

-- AddForeignKey
ALTER TABLE "CreativeBadge" ADD CONSTRAINT "CreativeBadge_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeBadge" ADD CONSTRAINT "CreativeBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
