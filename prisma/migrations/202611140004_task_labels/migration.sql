-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "important" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "urgent" BOOLEAN NOT NULL DEFAULT false;
