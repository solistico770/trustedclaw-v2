import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = { title: "TrustedClaw", description: "Case-centric operational agent" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground min-h-screen">{children}</body>
    </html>
  );
}
