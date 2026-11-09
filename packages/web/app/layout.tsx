import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoStrip } from "@/components/LogoStrip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bench: natural-language escrows judged by a GenLayer jury",
  description: "Arkhai escrows released or refunded by GenLayer validator consensus. Internet Court verification layer.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen pb-20 antialiased">
        <nav className="border-b border-line">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-lg font-bold tracking-wider">
              <span className="text-teal">[</span> bench <span className="text-teal">]</span>
            </Link>
            <div className="flex gap-6 text-sm text-dim">
              <Link href="/new" className="hover:text-text">new escrow</Link>
              <Link href="/preview" className="hover:text-text">preview a verdict</Link>
              <Link href="/case" className="hover:text-text">open a case</Link>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
        <LogoStrip />
      </body>
    </html>
  );
}
