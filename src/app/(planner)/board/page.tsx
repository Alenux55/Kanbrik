import { Board } from "@/components/board";
import { verifiedSession } from "@/server/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
export const metadata = { title: "Board" };
export default async function BoardPage() {
  if (!await verifiedSession(await headers())) redirect("/sign-in");
  return <Board />;
}
