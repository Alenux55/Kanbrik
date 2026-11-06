CREATE TYPE "TaskStatus" AS ENUM ('backlog', 'todo', 'in_progress', 'blocked', 'done');

CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Project_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 200),
    CONSTRAINT "Project_description_check" CHECK (char_length("description") <= 20000),
    CONSTRAINT "Project_revision_check" CHECK ("revision" >= 1)
);
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "TaskStatus" NOT NULL DEFAULT 'todo',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Task_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 200),
    CONSTRAINT "Task_description_check" CHECK (char_length("description") <= 20000),
    CONSTRAINT "Task_revision_check" CHECK ("revision" >= 1),
    CONSTRAINT "Task_not_self_parent" CHECK ("parentId" IS DISTINCT FROM "id")
);
CREATE UNIQUE INDEX "Project_id_workspaceId_key" ON "Project"("id", "workspaceId");
CREATE INDEX "Project_workspaceId_createdAt_id_idx" ON "Project"("workspaceId", "createdAt", "id");
CREATE UNIQUE INDEX "Task_id_workspaceId_key" ON "Task"("id", "workspaceId");
CREATE INDEX "Task_workspaceId_createdAt_id_idx" ON "Task"("workspaceId", "createdAt", "id");
CREATE INDEX "Task_projectId_workspaceId_idx" ON "Task"("projectId", "workspaceId");
CREATE INDEX "Task_parentId_workspaceId_idx" ON "Task"("parentId", "workspaceId");
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_workspaceId_fkey" FOREIGN KEY ("projectId", "workspaceId") REFERENCES "Project"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_workspaceId_fkey" FOREIGN KEY ("parentId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nullable composite references alone cannot enforce NULL-safe project equality
-- or one-level hierarchy. Assignments are immutable in this implementation slice.
CREATE FUNCTION kanbrik_task_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_task "Task"%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId" OR NEW."projectId" IS DISTINCT FROM OLD."projectId" OR NEW."parentId" IS DISTINCT FROM OLD."parentId" THEN
            RAISE EXCEPTION 'Task context is immutable' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW."parentId" IS NOT NULL THEN
        SELECT * INTO parent_task FROM "Task" WHERE "id" = NEW."parentId" AND "workspaceId" = NEW."workspaceId" FOR UPDATE;
        IF NOT FOUND OR parent_task."parentId" IS NOT NULL OR parent_task."projectId" IS DISTINCT FROM NEW."projectId" THEN
            RAISE EXCEPTION 'Invalid subtask context' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER "Task_context_check" BEFORE INSERT OR UPDATE ON "Task" FOR EACH ROW EXECUTE FUNCTION kanbrik_task_context();
CREATE FUNCTION kanbrik_project_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId" THEN
        RAISE EXCEPTION 'Project context is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER "Project_context_check" BEFORE UPDATE ON "Project" FOR EACH ROW EXECUTE FUNCTION kanbrik_project_context();
