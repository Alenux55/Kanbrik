import type { Metadata } from "next";
import "./globals.css";
import { headers } from "next/headers";
import { initialAppearance } from "@/server/appearance";

export const metadata: Metadata = {
  title: { default: "Kanbrik", template: "%s · Kanbrik" },
  description: "Kanbrik planner — application foundation preview.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const appearance = await initialAppearance(await headers());
  return (
    <html lang="en" data-appearance={appearance}>
      <body>{children}</body>
    </html>
  );
}
