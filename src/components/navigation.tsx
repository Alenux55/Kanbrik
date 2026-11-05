"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sections } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function Navigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
      {sections.map((section) => {
        const active = pathname === `/${section.slug}`;
        return (
          <Link key={section.slug} href={`/${section.slug}`} aria-current={active ? "page" : undefined}
            className={cn("flex min-h-12 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700", active ? "bg-teal-900 text-white hover:bg-teal-800" : "text-neutral-700")}>
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
