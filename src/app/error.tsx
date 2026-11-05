"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-lg p-8"><h1 className="text-2xl font-semibold">Could not load this page</h1><p className="my-5">Your workspace may still need setup, or the connection may be unavailable. Please retry.</p><button className="min-h-12 rounded border px-4" onClick={reset}>Try again</button></main>;
}
