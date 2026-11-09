import { PUBLIC } from "./config";

export type NavItem = { label: string; href: string; description?: string; external?: boolean };
export type NavSection = { label: string; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    label: "Product",
    items: [
      { label: "How it works", href: "/how-it-works", description: "From locked funds to payout in four steps" },
      { label: "Use cases", href: "/use-cases", description: "Freelance work, agent jobs, bounties, content" },
      { label: "Trust model", href: "/trust", description: "What is trusted, what isn't, and why" },
      { label: "Architecture", href: "/architecture", description: "Plan A on GenLayer, Plan B on Base Sepolia" },
    ],
  },
  {
    label: "App",
    items: [
      { label: "Preview a verdict", href: "/preview", description: "Ask a live jury. No wallet, no money" },
      { label: "Lock an escrow", href: "/new", description: "Escrow tokens against a plain-English demand" },
      { label: "Open a case", href: "/case", description: "Track an escrow from delivery to payout" },
      { label: "Case explorer", href: "/cases", description: "Recent verdicts, live from the chain" },
    ],
  },
  {
    label: "Developers",
    items: [
      { label: "Developer guide", href: "/developers", description: "CLI, agent skill, SDK and contracts" },
      { label: "Status & deployments", href: "/status", description: "Live networks and contract addresses" },
      { label: "Agent skill", href: `${PUBLIC.repo}/blob/main/skill/bench/SKILL.md`, external: true },
      { label: "GitHub", href: PUBLIC.repo, external: true },
    ],
  },
  {
    label: "Resources",
    items: [
      { label: "FAQ", href: "/faq", description: "Short answers to common questions" },
      { label: "Internet Court", href: "https://internetcourt.org", external: true },
      { label: "GenLayer docs", href: "https://docs.genlayer.com", external: true },
      { label: "Arkhai Alkahest", href: "https://github.com/arkhai-io/alkahest", external: true },
    ],
  },
];
