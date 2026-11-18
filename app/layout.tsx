import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brandly — Social posts that sound like your brand",
  description: "Brandly learns your colours, fonts and voice once, then helps you write, plan and schedule your social posts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Browser extensions (Grammarly, ColorZilla, dark-mode tools…) add attributes to <body> before React loads. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
