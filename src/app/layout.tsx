import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aperture — Agentic knowledge workspace",
  description: "A grounded AI workspace for your team's knowledge.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
