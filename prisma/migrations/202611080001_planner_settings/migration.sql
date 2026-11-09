-- Workspace reference zones are explicitly UTC for legacy rows; instants are untouched.
ALTER TABLE "Workspace" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'UTC', ADD COLUMN "settingsRevision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_settingsRevision_check" CHECK ("settingsRevision" > 0);
CREATE TABLE "PlannerPreference" (
 "userId" TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 "defaultWorkspaceId" TEXT,
 "timeZone" TEXT
);
-- One-time migration; legacy preference writes cannot overwrite the new setting.
INSERT INTO "PlannerPreference" ("userId", "timeZone") SELECT "userId", "timeZone" FROM "CalendarPreference";
CREATE FUNCTION kanbrik_settings_zone() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."timeZone" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW."timeZone") THEN
 RAISE EXCEPTION 'Unknown settings time zone' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "workspace_zone" BEFORE INSERT OR UPDATE ON "Workspace" FOR EACH ROW EXECUTE FUNCTION kanbrik_settings_zone();
CREATE TRIGGER "planner_zone" BEFORE INSERT OR UPDATE ON "PlannerPreference" FOR EACH ROW EXECUTE FUNCTION kanbrik_settings_zone();
