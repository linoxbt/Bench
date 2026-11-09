import type { ReactNode } from "react";
import { Announcement } from "@/components/site/Announcement";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Announcement />
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
