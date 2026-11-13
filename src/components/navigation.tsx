"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sections } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function Navigation() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main navigation"
      className="flex min-w-0 gap-1 overflow-x-auto lg:grid lg:grid-cols-1"
    >
      {[
        ...sections,
        { slug: "trash", label: "Trash" },
        { slug: "workspaces", label: "Workspaces" },
        { slug: "settings", label: "User settings" },
      ].map((section) => {
        const active =
          pathname === `/${section.slug}` ||
          pathname.startsWith(`/${section.slug}/`);
        return (
          <Link
            key={section.slug}
            href={`/${section.slug}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-12 shrink-0 items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700",
              active
                ? "bg-teal-900 text-white hover:bg-teal-800"
                : "text-neutral-700",
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
