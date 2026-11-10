import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Lock an escrow", description: "Escrow tokens against a plain-English demand that only a GenLayer jury can release." };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
