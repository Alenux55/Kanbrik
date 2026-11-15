-- AlterTable
-- Preserve every enum value, including Trash, without rewriting content metadata.
ALTER TABLE "Task" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "status" TYPE TEXT USING "status"::text;
ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'todo';

-- DropEnum
DROP TYPE "TaskStatus";

-- CreateTable
CREATE TABLE "WorkspaceStatus" (
    "workspaceId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WorkspaceStatus_pkey" PRIMARY KEY ("workspaceId","id")
);

-- CreateTable
CREATE TABLE "WorkspaceWorkflow" (
    "workspaceId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "defaultStatusId" TEXT NOT NULL DEFAULT 'todo',

    CONSTRAINT "WorkspaceWorkflow_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateIndex
CREATE INDEX "WorkspaceStatus_workspaceId_position_id_idx" ON "WorkspaceStatus"("workspaceId", "position", "id");

-- Seed current semantics without changing Task rows/revisions/timestamps.
INSERT INTO "WorkspaceStatus"("workspaceId",id,name,position,completed)
 SELECT w.id,d.id,d.name,d.position,d.completed FROM "Workspace" w CROSS JOIN (VALUES
 ('backlog','Backlog',0,false),('todo','To do',1,false),('in_progress','In progress',2,false),('blocked','Blocked',3,false),('done','Done',4,true)) AS d(id,name,position,completed);
INSERT INTO "WorkspaceWorkflow"("workspaceId") SELECT id FROM "Workspace";

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_status_fkey" FOREIGN KEY ("workspaceId", "status") REFERENCES "WorkspaceStatus"("workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceStatus" ADD CONSTRAINT "WorkspaceStatus_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceWorkflow" ADD CONSTRAINT "WorkspaceWorkflow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceWorkflow" ADD CONSTRAINT "WorkspaceWorkflow_workspaceId_defaultStatusId_fkey" FOREIGN KEY ("workspaceId", "defaultStatusId") REFERENCES "WorkspaceStatus"("workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "WorkspaceStatus" ADD CONSTRAINT "WorkspaceStatus_values_check" CHECK(length(btrim(name)) BETWEEN 1 AND 80 AND position>=0 AND revision>=1);
ALTER TABLE "WorkspaceWorkflow" ADD CONSTRAINT "WorkspaceWorkflow_revision_check" CHECK(revision>=1);
CREATE UNIQUE INDEX "WorkspaceStatus_active_name" ON "WorkspaceStatus"("workspaceId",lower(name)) WHERE "archivedAt" IS NULL;
CREATE FUNCTION bootstrap_workspace_workflow() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO "WorkspaceStatus"("workspaceId",id,name,position,completed) SELECT NEW.id,d.id,d.name,d.position,d.completed FROM (VALUES
 ('backlog','Backlog',0,false),('todo','To do',1,false),('in_progress','In progress',2,false),('blocked','Blocked',3,false),('done','Done',4,true)) AS d(id,name,position,completed);
 INSERT INTO "WorkspaceWorkflow"("workspaceId") VALUES(NEW.id); RETURN NEW;
END $$;
CREATE TRIGGER "Workspace_workflow_bootstrap" AFTER INSERT ON "Workspace" FOR EACH ROW EXECUTE FUNCTION bootstrap_workspace_workflow();
CREATE FUNCTION check_workspace_workflow() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ws text;
BEGIN
 ws=CASE WHEN TG_OP='DELETE' THEN OLD."workspaceId" ELSE NEW."workspaceId" END;
 IF NOT EXISTS(SELECT 1 FROM "Workspace" WHERE id=ws) THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM "WorkspaceWorkflow" w JOIN "WorkspaceStatus" s ON s."workspaceId"=w."workspaceId" AND s.id=w."defaultStatusId" WHERE w."workspaceId"=ws AND s."archivedAt" IS NULL AND NOT s.completed) THEN RAISE EXCEPTION 'An active incomplete creation default is required'; END IF;
 IF (SELECT count(*) FROM "WorkspaceStatus" WHERE "workspaceId"=ws AND "archivedAt" IS NULL)>50 THEN RAISE EXCEPTION 'Too many active statuses'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "WorkspaceStatus_default_guard" AFTER INSERT OR UPDATE OR DELETE ON "WorkspaceStatus" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_workspace_workflow();
CREATE CONSTRAINT TRIGGER "WorkspaceWorkflow_default_guard" AFTER INSERT OR UPDATE OR DELETE ON "WorkspaceWorkflow" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_workspace_workflow();
CREATE FUNCTION guard_workspace_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN IF EXISTS(SELECT 1 FROM "Workspace" WHERE id=OLD."workspaceId") THEN RAISE EXCEPTION 'Status identities are retired, not deleted'; END IF; RETURN OLD; END IF;
 IF (to_jsonb(NEW)-ARRAY['name','position','completed','revision','archivedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['name','position','completed','revision','archivedAt']) OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Status identity is immutable and edits require a revision'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "WorkspaceStatus_guard" BEFORE UPDATE OR DELETE ON "WorkspaceStatus" FOR EACH ROW EXECUTE FUNCTION guard_workspace_status();
CREATE FUNCTION guard_task_active_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR (NEW."deletedAt" IS NULL AND OLD."deletedAt" IS NOT NULL) THEN
  IF NOT EXISTS(SELECT 1 FROM "WorkspaceStatus" WHERE "workspaceId"=NEW."workspaceId" AND id=NEW.status AND "archivedAt" IS NULL) THEN RAISE EXCEPTION 'New assignments and Restore require an active workspace status'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER "Task_active_status_guard" BEFORE INSERT OR UPDATE OF status,"deletedAt" ON "Task" FOR EACH ROW EXECUTE FUNCTION guard_task_active_status();
