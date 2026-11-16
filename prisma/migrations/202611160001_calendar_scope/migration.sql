-- Preserve every existing explicit selection, including an empty array.
ALTER TABLE "CalendarPreference" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE "CalendarPreference" ALTER COLUMN "mode" SET DEFAULT 'follow';
ALTER TABLE "CalendarPreference" ADD CONSTRAINT "CalendarPreference_mode_check"
  CHECK ("mode" IN ('follow', 'custom'));
