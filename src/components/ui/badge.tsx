import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Repository-owned shadcn/ui badge, simplified to the one variant used here.
export function Badge({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", className)} {...props} />;
}
