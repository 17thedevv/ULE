-- AlterTable
ALTER TABLE "exam_grades" ALTER COLUMN "percentageScore" DROP NOT NULL,
ALTER COLUMN "percentageScore" DROP DEFAULT,
ALTER COLUMN "isPassing" DROP NOT NULL,
ALTER COLUMN "isPassing" DROP DEFAULT;
