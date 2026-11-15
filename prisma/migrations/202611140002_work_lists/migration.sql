-- AlterTable
ALTER TABLE "WorkActivity" ADD COLUMN     "subjectId" TEXT,
ADD COLUMN     "subjectKind" TEXT,
ADD COLUMN     "subjectRevision" INTEGER;

-- CreateTable
CREATE TABLE "WorkList" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "taskId" TEXT,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkListItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "quantity" DECIMAL(12,3),
    "vendorId" TEXT,
    "purchased" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceVendor" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceActivity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "changes" JSONB NOT NULL,
    "eventKey" TEXT NOT NULL,

    CONSTRAINT "WorkspaceActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceIntent" (
    "workspaceId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorId" TEXT,
    "payload" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceIntent_pkey" PRIMARY KEY ("workspaceId","id")
);

-- CreateIndex
CREATE INDEX "WorkList_workspaceId_projectId_createdAt_id_idx" ON "WorkList"("workspaceId", "projectId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "WorkList_workspaceId_taskId_createdAt_id_idx" ON "WorkList"("workspaceId", "taskId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkList_workspaceId_id_kind_key" ON "WorkList"("workspaceId", "id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "WorkList_workspaceId_id_key" ON "WorkList"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "WorkListItem_workspaceId_listId_createdAt_id_idx" ON "WorkListItem"("workspaceId", "listId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkListItem_workspaceId_id_key" ON "WorkListItem"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "WorkspaceVendor_workspaceId_createdAt_id_idx" ON "WorkspaceVendor"("workspaceId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceVendor_workspaceId_id_key" ON "WorkspaceVendor"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "WorkspaceActivity_workspaceId_occurredAt_id_idx" ON "WorkspaceActivity"("workspaceId", "occurredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceActivity_workspaceId_eventKey_key" ON "WorkspaceActivity"("workspaceId", "eventKey");

-- AddForeignKey
ALTER TABLE "WorkList" ADD CONSTRAINT "WorkList_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkList" ADD CONSTRAINT "WorkList_projectId_workspaceId_fkey" FOREIGN KEY ("projectId", "workspaceId") REFERENCES "Project"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkList" ADD CONSTRAINT "WorkList_taskId_workspaceId_fkey" FOREIGN KEY ("taskId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkListItem" ADD CONSTRAINT "WorkListItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkListItem" ADD CONSTRAINT "WorkListItem_workspaceId_listId_kind_fkey" FOREIGN KEY ("workspaceId", "listId", "kind") REFERENCES "WorkList"("workspaceId", "id", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkListItem" ADD CONSTRAINT "WorkListItem_workspaceId_vendorId_fkey" FOREIGN KEY ("workspaceId", "vendorId") REFERENCES "WorkspaceVendor"("workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceVendor" ADD CONSTRAINT "WorkspaceVendor_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceActivity" ADD CONSTRAINT "WorkspaceActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceActivity" ADD CONSTRAINT "WorkspaceActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceIntent" ADD CONSTRAINT "WorkspaceIntent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceIntent" ADD CONSTRAINT "WorkspaceIntent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkList" ADD CONSTRAINT "WorkList_target_check" CHECK(num_nonnulls("projectId","taskId")=1),
 ADD CONSTRAINT "WorkList_values_check" CHECK("kind" IN ('checklist','shopping') AND length(btrim("name")) BETWEEN 1 AND 100 AND revision>=1);
ALTER TABLE "WorkListItem" ADD CONSTRAINT "WorkListItem_values_check" CHECK(length(btrim("text")) BETWEEN 1 AND 1000 AND revision>=1 AND
 ((kind='checklist' AND quantity IS NULL AND "vendorId" IS NULL AND purchased=false) OR (kind='shopping' AND quantity IS NOT NULL AND quantity>0 AND quantity<=1000000 AND checked=false)));
ALTER TABLE "WorkspaceVendor" ADD CONSTRAINT "WorkspaceVendor_values_check" CHECK(length(btrim(name)) BETWEEN 1 AND 100 AND revision>=1);
CREATE UNIQUE INDEX "WorkspaceVendor_active_name" ON "WorkspaceVendor"("workspaceId",lower(name)) WHERE "archivedAt" IS NULL;
ALTER TABLE "WorkActivity" DROP CONSTRAINT "WorkActivity_revision_check";
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_revision_check" CHECK(num_nonnulls("workRevision","commentRevision","subjectRevision")=1 AND (
 ("workRevision" IS NOT NULL AND "workRevision">=1 AND "commentId" IS NULL AND "subjectId" IS NULL AND "subjectKind" IS NULL) OR
 ("commentRevision" IS NOT NULL AND "commentRevision">=1 AND "commentId" IS NOT NULL AND "subjectId" IS NULL AND "subjectKind" IS NULL) OR
 ("subjectRevision" IS NOT NULL AND "subjectRevision">=1 AND "commentId" IS NULL AND "subjectId" IS NOT NULL AND "subjectKind" IN ('list','item'))));
CREATE OR REPLACE FUNCTION guard_work_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scope_row record;
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM "Workspace" WHERE id=OLD."workspaceId") THEN RAISE EXCEPTION 'Activity is retained with its workspace'; END IF; RETURN OLD;
 ELSIF TG_OP='UPDATE' THEN
  IF NEW."actorId" IS NOT NULL OR OLD."actorId" IS NULL OR EXISTS(SELECT 1 FROM "user" WHERE id=OLD."actorId") OR (to_jsonb(NEW)-'actorId') IS DISTINCT FROM (to_jsonb(OLD)-'actorId') THEN RAISE EXCEPTION 'Activity is append-only'; END IF;
 ELSE
  IF NEW."commentId" IS NOT NULL THEN SELECT "projectId","taskId" INTO scope_row FROM "WorkComment" WHERE id=NEW."commentId" AND "workspaceId"=NEW."workspaceId";
  ELSIF NEW."subjectKind"='list' THEN SELECT "projectId","taskId" INTO scope_row FROM "WorkList" WHERE id=NEW."subjectId" AND "workspaceId"=NEW."workspaceId";
  ELSIF NEW."subjectKind"='item' THEN SELECT l."projectId",l."taskId" INTO scope_row FROM "WorkListItem" i JOIN "WorkList" l ON l.id=i."listId" AND l."workspaceId"=i."workspaceId" WHERE i.id=NEW."subjectId" AND i."workspaceId"=NEW."workspaceId";
  ELSE RETURN NEW;
  END IF;
  IF NOT FOUND OR scope_row."projectId" IS DISTINCT FROM NEW."projectId" OR scope_row."taskId" IS DISTINCT FROM NEW."taskId" THEN RAISE EXCEPTION 'Activity subject target mismatch'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE FUNCTION guard_retained_supplement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed text[];
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM "Workspace" WHERE id=OLD."workspaceId") THEN RAISE EXCEPTION 'Supplemental records are archived, not purged'; END IF; RETURN OLD;
 END IF;
 allowed=CASE TG_TABLE_NAME WHEN 'WorkList' THEN ARRAY['name','revision','archivedAt','updatedAt'] WHEN 'WorkListItem' THEN ARRAY['text','checked','quantity','vendorId','purchased','revision','archivedAt','updatedAt'] ELSE ARRAY['name','revision','archivedAt'] END;
 IF (to_jsonb(NEW)-allowed) IS DISTINCT FROM (to_jsonb(OLD)-allowed) OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Supplemental context is immutable; changes require a new revision'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "WorkList_guard" BEFORE UPDATE OR DELETE ON "WorkList" FOR EACH ROW EXECUTE FUNCTION guard_retained_supplement();
CREATE TRIGGER "WorkListItem_guard" BEFORE UPDATE OR DELETE ON "WorkListItem" FOR EACH ROW EXECUTE FUNCTION guard_retained_supplement();
CREATE TRIGGER "WorkspaceVendor_guard" BEFORE UPDATE OR DELETE ON "WorkspaceVendor" FOR EACH ROW EXECUTE FUNCTION guard_retained_supplement();
CREATE FUNCTION guard_workspace_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM "Workspace" WHERE id=OLD."workspaceId") THEN RAISE EXCEPTION 'Workspace records are retained'; END IF; RETURN OLD;
 END IF;
 IF NEW."actorId" IS NOT NULL OR OLD."actorId" IS NULL OR EXISTS(SELECT 1 FROM "user" WHERE id=OLD."actorId") OR (to_jsonb(NEW)-'actorId') IS DISTINCT FROM (to_jsonb(OLD)-'actorId') THEN RAISE EXCEPTION 'Workspace record is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "WorkspaceActivity_guard" BEFORE UPDATE OR DELETE ON "WorkspaceActivity" FOR EACH ROW EXECUTE FUNCTION guard_workspace_record();
CREATE TRIGGER "WorkspaceIntent_guard" BEFORE UPDATE OR DELETE ON "WorkspaceIntent" FOR EACH ROW EXECUTE FUNCTION guard_workspace_record();
