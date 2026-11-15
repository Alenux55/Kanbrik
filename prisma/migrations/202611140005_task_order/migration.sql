-- CreateTable
CREATE TABLE "TaskOrderScope" (
    "workspaceId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "projectId" TEXT,
    "parentId" TEXT,
    "ids" TEXT[],
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TaskOrderScope_pkey" PRIMARY KEY ("workspaceId","scopeKey")
);

-- AddForeignKey
ALTER TABLE "TaskOrderScope" ADD CONSTRAINT "TaskOrderScope_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOrderScope" ADD CONSTRAINT "TaskOrderScope_projectId_workspaceId_fkey" FOREIGN KEY ("projectId", "workspaceId") REFERENCES "Project"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOrderScope" ADD CONSTRAINT "TaskOrderScope_parentId_workspaceId_fkey" FOREIGN KEY ("parentId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskOrderScope" ALTER COLUMN ids SET NOT NULL;
ALTER TABLE "TaskOrderScope" ADD CONSTRAINT "TaskOrderScope_context_check" CHECK(num_nonnulls("projectId","parentId")=1 AND revision>=1 AND "scopeKey"=CASE WHEN "parentId" IS NOT NULL THEN 'task/'||"parentId" ELSE 'project/'||"projectId" END);
-- Metadata-only backfill; canonical work, revisions and timestamps remain untouched.
INSERT INTO "TaskOrderScope"("workspaceId","scopeKey","projectId",ids)
 SELECT "workspaceId",'project/'||"projectId","projectId",array_agg(id ORDER BY "createdAt",id) FROM "Task" WHERE "projectId" IS NOT NULL AND "parentId" IS NULL GROUP BY "workspaceId","projectId";
INSERT INTO "TaskOrderScope"("workspaceId","scopeKey","parentId",ids)
 SELECT "workspaceId",'task/'||"parentId","parentId",array_agg(id ORDER BY "createdAt",id) FROM "Task" WHERE "parentId" IS NOT NULL GROUP BY "workspaceId","parentId";
CREATE FUNCTION guard_task_order_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected text[]; supplied text[];
BEGIN
 IF TG_OP='DELETE' THEN IF EXISTS(SELECT 1 FROM "Workspace" WHERE id=OLD."workspaceId") THEN RAISE EXCEPTION 'Sibling order is retained with its workspace'; END IF; RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-ARRAY['ids','revision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['ids','revision']) OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'Order context is immutable and changes require a new version'; END IF;
 IF NEW."parentId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Task" WHERE id=NEW."parentId" AND "workspaceId"=NEW."workspaceId" AND "parentId" IS NULL) THEN RAISE EXCEPTION 'Child order requires a root parent in this workspace'; END IF;
 SELECT COALESCE(array_agg(id ORDER BY id),'{}') INTO expected FROM "Task" WHERE "workspaceId"=NEW."workspaceId" AND ((NEW."parentId" IS NOT NULL AND "parentId"=NEW."parentId") OR (NEW."parentId" IS NULL AND "parentId" IS NULL AND "projectId"=NEW."projectId"));
 SELECT COALESCE(array_agg(id ORDER BY id),'{}') INTO supplied FROM unnest(NEW.ids) AS id;
 IF expected IS DISTINCT FROM supplied THEN RAISE EXCEPTION 'Order must contain exactly the complete sibling set, retaining Trash slots'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "TaskOrderScope_guard" BEFORE INSERT OR UPDATE OR DELETE ON "TaskOrderScope" FOR EACH ROW EXECUTE FUNCTION guard_task_order_scope();
ALTER TABLE "WorkActivity" DROP CONSTRAINT "WorkActivity_revision_check";
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_revision_check" CHECK(num_nonnulls("workRevision","commentRevision","subjectRevision")=1 AND (
 ("workRevision" IS NOT NULL AND "workRevision">=1 AND "commentId" IS NULL AND "subjectId" IS NULL AND "subjectKind" IS NULL) OR
 ("commentRevision" IS NOT NULL AND "commentRevision">=1 AND "commentId" IS NOT NULL AND "subjectId" IS NULL AND "subjectKind" IS NULL) OR
 ("subjectRevision" IS NOT NULL AND "subjectRevision">=1 AND "commentId" IS NULL AND "subjectId" IS NOT NULL AND "subjectKind" IN ('list','item','order'))));
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
  ELSIF NEW."subjectKind"='order' THEN SELECT NULL::text AS "projectId",t.id AS "taskId" INTO scope_row FROM "TaskOrderScope" s JOIN "Task" t ON t."workspaceId"=s."workspaceId" AND t.id=ANY(s.ids) WHERE s."workspaceId"=NEW."workspaceId" AND s."scopeKey"=NEW."subjectId" AND t.id=NEW."taskId" AND NEW.action='task_reordered';
  ELSE RETURN NEW;
  END IF;
  IF NOT FOUND OR scope_row."projectId" IS DISTINCT FROM NEW."projectId" OR scope_row."taskId" IS DISTINCT FROM NEW."taskId" THEN RAISE EXCEPTION 'Activity subject target mismatch'; END IF;
 END IF; RETURN NEW;
END $$;
