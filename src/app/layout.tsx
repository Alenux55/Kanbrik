import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: { default: "Kanbrik", template: "%s · Kanbrik" }, description: "Kanbrik planner — application foundation preview." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
