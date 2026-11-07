import { CalendarPlanner } from "@/components/calendar";
import { verifiedSession } from "@/server/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
export const metadata = { title: "Calendar" };
export default async function CalendarPage() {
  if (!await verifiedSession(await headers())) redirect("/sign-in");
  return <CalendarPlanner />;
}
