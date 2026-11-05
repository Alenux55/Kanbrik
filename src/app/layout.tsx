import type { Metadata } from "next";
import Link from "next/link";
import { Navigation } from "@/components/navigation";
import { Badge } from "@/components/ui/badge";
import "./globals.css";

export const metadata: Metadata = { title: { default: "Kanbrik", template: "%s · Kanbrik" }, description: "Kanbrik planner — application foundation preview." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="border-b border-neutral-200 bg-neutral-100 p-5 lg:border-r lg:border-b-0 lg:p-6">
            <Link href="/projects" className="inline-block rounded text-2xl font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-teal-700">kanbrik<span className="text-teal-700">.</span></Link>
            <p className="mt-1 text-sm text-neutral-600">Space for what’s next.</p>
            <div className="my-6 rounded-lg border border-dashed border-neutral-300 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Workspace</p>
              <p className="mt-2 text-sm">Selector coming later</p>
              <p className="mt-1 text-xs leading-5 text-neutral-600">Personal and shared workspaces are planned. No account is connected.</p>
            </div>
            <Navigation />
          </aside>
          <div className="min-w-0">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-6 py-4 lg:px-10">
              <span className="text-sm text-neutral-600">Your planner, taking shape</span>
              <Badge className="border-amber-200 bg-amber-50 text-amber-900">Foundation preview</Badge>
            </header>
            <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-6 py-10 outline-none lg:px-10 lg:py-16">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
