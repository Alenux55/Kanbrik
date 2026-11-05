"use client";
import { useTransition } from "react";

export default function ErrorPage({ retry }: { retry: () => void }) {
  const [pending, startTransition] = useTransition();
  return <main className="mx-auto max-w-lg p-8"><h1 className="text-2xl font-semibold">Could not load this page</h1><p className="my-5">Your workspace may still need setup, or the connection may be unavailable. Please retry.</p><button disabled={pending} className="min-h-12 rounded border px-4 disabled:opacity-60" onClick={() => startTransition(retry)}>{pending ? "Trying again…" : "Try again"}</button></main>;
}
