-- CreateTable
CREATE TABLE "ActivityBoundary" (
    "id" TEXT NOT NULL,
    "activatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityBoundary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkComment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "taskId" TEXT,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "createText" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WorkComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkActivity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "taskId" TEXT,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "workRevision" INTEGER,
    "commentRevision" INTEGER,
    "commentId" TEXT,
    "changes" JSONB NOT NULL,
    "operationId" TEXT,
    "operationTitle" TEXT,
    "operationKind" TEXT,
    "cascade" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkComment_workspaceId_projectId_createdAt_id_idx" ON "WorkComment"("workspaceId", "projectId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "WorkComment_workspaceId_taskId_createdAt_id_idx" ON "WorkComment"("workspaceId", "taskId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkComment_workspaceId_id_key" ON "WorkComment"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkComment_workspaceId_requestKey_key" ON "WorkComment"("workspaceId", "requestKey");

-- CreateIndex
CREATE INDEX "WorkActivity_workspaceId_projectId_occurredAt_id_idx" ON "WorkActivity"("workspaceId", "projectId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "WorkActivity_workspaceId_taskId_occurredAt_id_idx" ON "WorkActivity"("workspaceId", "taskId", "occurredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkActivity_workspaceId_eventKey_key" ON "WorkActivity"("workspaceId", "eventKey");

-- AddForeignKey
ALTER TABLE "WorkComment" ADD CONSTRAINT "WorkComment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkComment" ADD CONSTRAINT "WorkComment_projectId_workspaceId_fkey" FOREIGN KEY ("projectId", "workspaceId") REFERENCES "Project"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkComment" ADD CONSTRAINT "WorkComment_taskId_workspaceId_fkey" FOREIGN KEY ("taskId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkComment" ADD CONSTRAINT "WorkComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_projectId_workspaceId_fkey" FOREIGN KEY ("projectId", "workspaceId") REFERENCES "Project"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_taskId_workspaceId_fkey" FOREIGN KEY ("taskId", "workspaceId") REFERENCES "Task"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_workspaceId_commentId_fkey" FOREIGN KEY ("workspaceId", "commentId") REFERENCES "WorkComment"("workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Recording begins here. Existing rows deliberately receive no invented events.
INSERT INTO "ActivityBoundary" ("id") VALUES ('work_activity');
ALTER TABLE "WorkComment" ADD CONSTRAINT "WorkComment_target_check" CHECK (num_nonnulls("projectId", "taskId") = 1),
 ADD CONSTRAINT "WorkComment_text_check" CHECK (length(btrim("text")) BETWEEN 1 AND 10000 AND length(btrim("createText")) BETWEEN 1 AND 10000),
 ADD CONSTRAINT "WorkComment_revision_check" CHECK ("revision" >= 1 AND (("revision" = 1 AND "editedAt" IS NULL) OR ("revision" > 1 AND "editedAt" >= "createdAt")));
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_target_check" CHECK (num_nonnulls("projectId", "taskId") = 1),
 ADD CONSTRAINT "WorkActivity_revision_check" CHECK (num_nonnulls("workRevision", "commentRevision") = 1 AND (("workRevision" >= 1 AND "commentRevision" IS NULL AND "commentId" IS NULL) OR ("workRevision" IS NULL AND "commentRevision" >= 1 AND "commentId" IS NOT NULL))),
 ADD CONSTRAINT "WorkActivity_changes_check" CHECK (jsonb_typeof("changes") = 'array' AND jsonb_array_length("changes") > 0);

CREATE FUNCTION guard_work_comment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
  IF EXISTS (SELECT 1 FROM "Workspace" WHERE "id" = OLD."workspaceId") THEN RAISE EXCEPTION 'Comments are retained with their workspace'; END IF;
  RETURN OLD;
 END IF;
 IF (to_jsonb(NEW) - ARRAY['text','revision','editedAt','authorId']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['text','revision','editedAt','authorId']) THEN
  RAISE EXCEPTION 'Comment context and original attribution are immutable';
 END IF;
 IF NEW."authorId" IS DISTINCT FROM OLD."authorId" THEN
  IF NEW."authorId" IS NOT NULL OR EXISTS (SELECT 1 FROM "user" WHERE id = OLD."authorId") OR
   (to_jsonb(NEW) - 'authorId') IS DISTINCT FROM (to_jsonb(OLD) - 'authorId') THEN RAISE EXCEPTION 'Comment authors cannot be reassigned'; END IF;
 ELSIF NEW."text" IS DISTINCT FROM OLD."text" THEN
  IF NEW."revision" <> OLD."revision" + 1 OR NEW."editedAt" IS NULL OR NEW."editedAt" < OLD."createdAt" THEN RAISE EXCEPTION 'Comment edit requires a new revision and timestamp'; END IF;
 ELSIF NEW."revision" <> OLD."revision" OR NEW."editedAt" IS DISTINCT FROM OLD."editedAt" THEN RAISE EXCEPTION 'Unchanged comments cannot acquire an edit';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "WorkComment_guard" BEFORE UPDATE OR DELETE ON "WorkComment" FOR EACH ROW EXECUTE FUNCTION guard_work_comment();

CREATE FUNCTION guard_work_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE comment_row "WorkComment";
BEGIN
 IF TG_OP = 'DELETE' THEN
  IF EXISTS (SELECT 1 FROM "Workspace" WHERE "id" = OLD."workspaceId") THEN RAISE EXCEPTION 'Activity is retained with its workspace'; END IF;
  RETURN OLD;
 ELSIF TG_OP = 'UPDATE' THEN
  IF NEW."actorId" IS NOT NULL OR OLD."actorId" IS NULL OR EXISTS (SELECT 1 FROM "user" WHERE id = OLD."actorId") OR
   (to_jsonb(NEW) - 'actorId') IS DISTINCT FROM (to_jsonb(OLD) - 'actorId') THEN RAISE EXCEPTION 'Activity is append-only'; END IF;
 ELSIF NEW."commentId" IS NOT NULL THEN
  SELECT * INTO comment_row FROM "WorkComment" WHERE id = NEW."commentId" AND "workspaceId" = NEW."workspaceId";
  IF NOT FOUND OR comment_row."projectId" IS DISTINCT FROM NEW."projectId" OR comment_row."taskId" IS DISTINCT FROM NEW."taskId" THEN RAISE EXCEPTION 'Activity comment target mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "WorkActivity_guard" BEFORE INSERT OR UPDATE OR DELETE ON "WorkActivity" FOR EACH ROW EXECUTE FUNCTION guard_work_activity();
