import type { Metadata, Viewport } from "next";
import { getEvent } from "@/lib/event";
import "./globals.css";

export function generateMetadata(): Metadata {
  const { title } = getEvent();
  return {
    title: `${title} · Anı Albümü`,
    description: "Fotoğraf ve videolarınızı bizimle paylaşın.",
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf6f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
