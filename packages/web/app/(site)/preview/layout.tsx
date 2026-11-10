import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Preview a verdict", description: "Ask a live jury of GenLayer validators about any demand and delivery. No wallet, no money." };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
