ALTER TABLE "PlannerPreference" ADD COLUMN "appearance" TEXT NOT NULL DEFAULT 'system';
ALTER TABLE "PlannerPreference" ADD CONSTRAINT "PlannerPreference_appearance_check"
  CHECK ("appearance" IN ('light', 'dark', 'system'));
