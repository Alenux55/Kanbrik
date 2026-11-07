-- CreateTable
CREATE TABLE "CalendarPreference" (
    "userId" TEXT NOT NULL,
    "workspaceIds" TEXT[],
    "timeZone" TEXT NOT NULL,

    CONSTRAINT "CalendarPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "TimeBlock" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Time block',
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "timeZone" TEXT NOT NULL,
    "projectId" TEXT,
    "taskId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarCreateIntent" (
    "workspaceId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,

    CONSTRAINT "CalendarCreateIntent_pkey" PRIMARY KEY ("workspaceId","requestKey")
);

-- CreateIndex
CREATE INDEX "TimeBlock_workspaceId_startAt_endAt_idx" ON "TimeBlock"("workspaceId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "TimeBlock_projectId_workspaceId_idx" ON "TimeBlock"("projectId", "workspaceId");

-- CreateIndex
CREATE INDEX "TimeBlock_taskId_workspaceId_idx" ON "TimeBlock"("taskId", "workspaceId");

-- AddForeignKey
ALTER TABLE "CalendarPreference" ADD CONSTRAINT "CalendarPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_projectId_workspaceId_fkey" FOREIGN KEY ("projectId", "workspaceId") REFERENCES "Project"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_taskId_workspaceId_fkey" FOREIGN KEY ("taskId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarCreateIntent" ADD CONSTRAINT "CalendarCreateIntent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarPreference" ALTER COLUMN "workspaceIds" SET NOT NULL;
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_interval" CHECK ("endAt" > "startAt");
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_revision" CHECK ("revision" > 0);
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_label" CHECK (char_length(btrim(label)) BETWEEN 1 AND 200);
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_one_assignment" CHECK ("projectId" IS NULL OR "taskId" IS NULL);
CREATE FUNCTION kanbrik_block_context() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP = 'UPDATE' AND NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId" THEN
    RAISE EXCEPTION 'Block workspace is immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW."timeZone") THEN
    RAISE EXCEPTION 'Invalid time zone' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "TimeBlock_context" BEFORE INSERT OR UPDATE ON "TimeBlock" FOR EACH ROW EXECUTE FUNCTION kanbrik_block_context();
