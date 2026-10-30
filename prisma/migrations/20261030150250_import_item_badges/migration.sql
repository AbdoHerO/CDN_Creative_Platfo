-- AlterTable
ALTER TABLE "ImportItem" ADD COLUMN     "badgeIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
