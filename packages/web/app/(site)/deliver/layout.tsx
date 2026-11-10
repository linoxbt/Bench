import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Deliver work", description: "Read the buyer's terms and deliver by commit-reveal from your wallet." };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
