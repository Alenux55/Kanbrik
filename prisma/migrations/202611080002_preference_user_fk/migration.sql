ALTER TABLE "PlannerPreference" DROP CONSTRAINT "PlannerPreference_userId_fkey";
ALTER TABLE "PlannerPreference" ADD CONSTRAINT "PlannerPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE CASCADE;
