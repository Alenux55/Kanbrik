-- Reconcile any earlier boolean implementation into one tag model, preserving work revisions/timestamps.
CREATE TABLE "WorkspaceTag" ("id" TEXT NOT NULL PRIMARY KEY,"workspaceId" TEXT NOT NULL,"name" TEXT NOT NULL,"normalizedName" TEXT NOT NULL,"color" TEXT NOT NULL,"revision" INTEGER NOT NULL DEFAULT 1,"archivedAt" TIMESTAMPTZ(3),
 CONSTRAINT "WorkspaceTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
 CONSTRAINT "WorkspaceTag_bounds" CHECK(length("name") BETWEEN 1 AND 60 AND "name"=btrim("name") AND "normalizedName"=lower(btrim("name")) AND "color" IN ('teal','blue','violet','amber','pink','sky') AND "revision">0));
CREATE UNIQUE INDEX "WorkspaceTag_workspaceId_id_key" ON "WorkspaceTag"("workspaceId","id");
CREATE UNIQUE INDEX "WorkspaceTag_workspaceId_normalizedName_key" ON "WorkspaceTag"("workspaceId","normalizedName");
CREATE TABLE "TaskTag" ("workspaceId" TEXT NOT NULL,"taskId" TEXT NOT NULL,"tagId" TEXT NOT NULL,
 CONSTRAINT "TaskTag_pkey" PRIMARY KEY ("workspaceId","taskId","tagId"),
 CONSTRAINT "TaskTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
 CONSTRAINT "TaskTag_taskId_workspaceId_fkey" FOREIGN KEY ("taskId","workspaceId") REFERENCES "Task"("id","workspaceId") ON DELETE CASCADE,
 CONSTRAINT "TaskTag_workspaceId_tagId_fkey" FOREIGN KEY ("workspaceId","tagId") REFERENCES "WorkspaceTag"("workspaceId","id") ON DELETE NO ACTION);
INSERT INTO "WorkspaceTag"("id","workspaceId","name","normalizedName","color")
 SELECT 'legacy-important/'||"workspaceId","workspaceId",'Important','important','amber' FROM "Task" WHERE important GROUP BY "workspaceId"
 UNION ALL SELECT 'legacy-urgent/'||"workspaceId","workspaceId",'Urgent','urgent','pink' FROM "Task" WHERE urgent GROUP BY "workspaceId";
INSERT INTO "TaskTag" SELECT "workspaceId",id,'legacy-important/'||"workspaceId" FROM "Task" WHERE important
 UNION ALL SELECT "workspaceId",id,'legacy-urgent/'||"workspaceId" FROM "Task" WHERE urgent;
ALTER TABLE "Task" DROP COLUMN important, DROP COLUMN urgent;
CREATE FUNCTION "guard_tag_definition"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN IF EXISTS(SELECT 1 FROM "Workspace" WHERE id=OLD."workspaceId") THEN RAISE EXCEPTION 'Tags may only be archived'; END IF; RETURN OLD; END IF;
 IF NEW.id<>OLD.id OR NEW."workspaceId"<>OLD."workspaceId" OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Invalid tag identity or revision'; END IF; RETURN NEW; END $$;
CREATE TRIGGER "WorkspaceTag_guard" BEFORE UPDATE OR DELETE ON "WorkspaceTag" FOR EACH ROW EXECUTE FUNCTION "guard_tag_definition"();
CREATE FUNCTION "guard_task_tag"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Tag association identity is immutable'; END IF;
 IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM "WorkspaceTag" WHERE id=NEW."tagId" AND "workspaceId"=NEW."workspaceId" AND "archivedAt" IS NOT NULL) THEN RAISE EXCEPTION 'Cannot assign archived tag'; END IF; RETURN NEW; END $$;
CREATE TRIGGER "TaskTag_guard" BEFORE INSERT OR UPDATE ON "TaskTag" FOR EACH ROW EXECUTE FUNCTION "guard_task_tag"();
