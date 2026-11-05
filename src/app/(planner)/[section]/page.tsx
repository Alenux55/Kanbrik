import { notFound } from "next/navigation";
import { sections } from "@/lib/navigation";
import { Badge } from "@/components/ui/badge";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifiedSession } from "@/server/auth";


export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return { title: sections.find(({ slug }) => slug === section)?.label ?? "Not found" };
}

export default async function Section({ params }: { params: Promise<{ section: string }> }) {
  if (!await verifiedSession(await headers())) redirect("/sign-in");
  const { section } = await params;
  const current = sections.find(({ slug }) => slug === section);
  if (!current) notFound();
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-widest text-teal-800">A little structure. More room to think.</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{current.label}</h1>
      <p className="mt-4 max-w-xl text-lg leading-8 text-neutral-600">{current.description}</p>
      <section aria-label={`${current.label} preview`} className="mt-10 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-10">
        <Badge className="border-neutral-200 text-neutral-600">Placeholder</Badge>
        <h2 className="mt-6 text-xl font-semibold">This space is still being built</h2>
        <p className="mt-3 max-w-lg leading-7 text-neutral-600">{current.planned}</p>
        <p className="mt-6 max-w-lg border-t border-neutral-100 pt-6 text-sm leading-6 text-neutral-500">Your account and private workspace are saved. Planner content, sharing, and editing are not available yet. Future edits will require a connection.</p>
      </section>
    </>
  );
}
