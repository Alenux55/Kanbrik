CREATE TABLE "TrashBatch" (
  "workspaceId" TEXT NOT NULL, "id" TEXT NOT NULL,
  "rootKind" TEXT NOT NULL, "rootId" TEXT NOT NULL, "rootTitle" TEXT NOT NULL,
  "impactDigest" TEXT NOT NULL, "members" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "restoredAt" TIMESTAMP(3), "createdById" TEXT,
  CONSTRAINT "TrashBatch_pkey" PRIMARY KEY ("workspaceId", "id"),
  CONSTRAINT "TrashBatch_kind" CHECK ("rootKind" IN ('project', 'task')),
  CONSTRAINT "TrashBatch_revision" CHECK ("revision" > 0),
  CONSTRAINT "TrashBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TrashBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "TrashBatch_workspaceId_createdAt_id_idx" ON "TrashBatch"("workspaceId", "createdAt", "id");
ALTER TABLE "Project" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "trashBatchId" TEXT;
ALTER TABLE "Task" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "trashBatchId" TEXT;
ALTER TABLE "Project" ADD CONSTRAINT "Project_trash_state" CHECK (("deletedAt" IS NULL) = ("trashBatchId" IS NULL));
ALTER TABLE "Task" ADD CONSTRAINT "Task_trash_state" CHECK (("deletedAt" IS NULL) = ("trashBatchId" IS NULL));
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_trashBatchId_fkey" FOREIGN KEY ("workspaceId", "trashBatchId") REFERENCES "TrashBatch"("workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_trashBatchId_fkey" FOREIGN KEY ("workspaceId", "trashBatchId") REFERENCES "TrashBatch"("workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
CREATE INDEX "Project_workspaceId_trashBatchId_idx" ON "Project"("workspaceId", "trashBatchId");
CREATE INDEX "Task_workspaceId_trashBatchId_idx" ON "Task"("workspaceId", "trashBatchId");

-- Deferred checks permit one atomic subtree change/restore in any row order,
-- but never commit active work underneath a trashed project/parent.
CREATE FUNCTION kanbrik_active_work_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'Project' THEN
    IF EXISTS (SELECT 1 FROM "Project" p JOIN "Task" t ON t."projectId" = p."id" AND t."workspaceId" = p."workspaceId" WHERE p."id" = NEW."id" AND p."workspaceId" = NEW."workspaceId" AND p."deletedAt" IS NOT NULL AND t."deletedAt" IS NULL)
      THEN RAISE EXCEPTION 'Active work requires active project' USING ERRCODE = '23514'; END IF;
  ELSIF EXISTS (
    SELECT 1 FROM "Task" t
    LEFT JOIN "Project" p ON p."id" = t."projectId" AND p."workspaceId" = t."workspaceId"
    LEFT JOIN "Task" parent ON parent."id" = t."parentId" AND parent."workspaceId" = t."workspaceId"
    WHERE t."id" = NEW."id" AND t."workspaceId" = NEW."workspaceId" AND t."deletedAt" IS NULL
      AND (p."deletedAt" IS NOT NULL OR parent."deletedAt" IS NOT NULL)
  ) OR EXISTS (SELECT 1 FROM "Task" parent JOIN "Task" child ON child."parentId" = parent."id" AND child."workspaceId" = parent."workspaceId" WHERE parent."id" = NEW."id" AND parent."workspaceId" = NEW."workspaceId" AND parent."deletedAt" IS NOT NULL AND child."deletedAt" IS NULL)
    THEN RAISE EXCEPTION 'Active work requires active ancestors' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "Project_active_ancestors" AFTER INSERT OR UPDATE ON "Project" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION kanbrik_active_work_context();
CREATE CONSTRAINT TRIGGER "Task_active_ancestors" AFTER INSERT OR UPDATE ON "Task" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION kanbrik_active_work_context();

CREATE FUNCTION kanbrik_active_block_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."projectId" IS NOT DISTINCT FROM OLD."projectId" AND NEW."taskId" IS NOT DISTINCT FROM OLD."taskId" THEN RETURN NEW; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM "Project" WHERE "id" = NEW."projectId" AND "workspaceId" = NEW."workspaceId" AND "deletedAt" IS NOT NULL)
    OR EXISTS (
      SELECT 1 FROM "Task" t
      LEFT JOIN "Project" p ON p."id" = t."projectId" AND p."workspaceId" = t."workspaceId"
      LEFT JOIN "Task" parent ON parent."id" = t."parentId" AND parent."workspaceId" = t."workspaceId"
      WHERE t."id" = NEW."taskId" AND t."workspaceId" = NEW."workspaceId"
        AND (t."deletedAt" IS NOT NULL OR p."deletedAt" IS NOT NULL OR parent."deletedAt" IS NOT NULL)
    ) THEN RAISE EXCEPTION 'New assignment requires active work' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "TimeBlock_active_assignment" BEFORE INSERT OR UPDATE ON "TimeBlock" FOR EACH ROW EXECUTE FUNCTION kanbrik_active_block_assignment();
