-- AlterTable
ALTER TABLE "ImportItem" ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "note" TEXT;
