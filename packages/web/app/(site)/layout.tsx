import type { ReactNode } from "react";
import { Announcement } from "@/components/site/Announcement";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { ConnectModal } from "@/components/wallet/ConnectModal";
import { WalletProvider } from "@/components/wallet/WalletProvider";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <Announcement />
      <Header />
      <main>{children}</main>
      <Footer />
      <ConnectModal />
    </WalletProvider>
  );
}
