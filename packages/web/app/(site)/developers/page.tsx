import type { Metadata } from "next";
import Link from "next/link";
import { Code, Container, CtaBand, PageHero } from "@/components/site/blocks";
import { ArrowUpRight, IconBot, IconDoc, IconTerminal } from "@/components/site/icons";
import { PUBLIC } from "@/lib/config";

export const metadata: Metadata = { title: "Developers", description: "The bench CLI, the agent skill and the TypeScript SDK for Alkahest and GenLayer." };

const COMMANDS = [
  ["bench escrow", "Buyer: lock tokens against a demand and rubric"],
  ["bench deliver", "Seller: commit-reveal a delivery"],
  ["bench judge", "Anyone: open the case on BenchJudge"],
  ["bench status", "Case, jury votes and whether the verdict landed"],
  ["bench collect", "Seller: collect once the verdict is true"],
  ["bench reclaim", "Buyer: reclaim after expiry"],
  ["bench preview", "Run the jury with no money and no escrow"],
  ["bench appeal", "Ask a larger jury before finality"],
];

export default function Developers() {
  return (
    <>
      <PageHero
        eyebrow="Developers"
        title="Build agents that buy and sell work."
        lede="A CLI that speaks JSON, an agent skill with safe defaults, and a TypeScript SDK for Alkahest and GenLayer. MIT licensed."
      >
        <a href={PUBLIC.repo} target="_blank" rel="noreferrer" className="pill pill-primary">
          View on GitHub <ArrowUpRight className="h-4 w-4" />
        </a>
        <Link href="/status" className="pill pill-secondary">
          Deployments
        </Link>
      </PageHero>

      <Container className="grid gap-4 pb-24 md:grid-cols-3">
        {[
          [<IconTerminal key="t" />, "CLI", "Eight commands from escrow to payout. Keys only from env vars; every write prints a tx hash."],
          [<IconBot key="b" />, "Agent skill", "SKILL.md teaches any agent the buyer and seller flows, the limits and the trust model."],
          [<IconDoc key="d" />, "SDK", "@bench/core: demand codec, escrow and judge clients, and a browser build with plain viem."],
        ].map(([icon, t, d]) => (
          <div key={t as string} className="card p-6">
            <div className="text-blue">{icon}</div>
            <h2 className="mt-5 text-lg font-medium text-ink">{t}</h2>
            <p className="mt-2 text-[0.95rem] text-muted">{d}</p>
          </div>
        ))}
      </Container>

      <section className="bg-wash" id="quickstart">
        <Container className="grid gap-12 py-24 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="headline text-[2rem] sm:text-[2.4rem]">Quickstart</h2>
            <p className="mt-4 text-muted">
              Clone, build and ask the public Studionet jury. No funds needed. For real escrows, fund testnet keys and follow the deploy guide in the README.
            </p>
          </div>
          <Code title="terminal">{`git clone ${PUBLIC.repo} bench && cd bench
pnpm install && pnpm build
export BENCH_NETWORK=studionet
export BENCH_JUDGE=${PUBLIC.judgeStudionet ?? "<BenchJudge address>"}
export GENLAYER_KEY=0x...   # any key; Studionet is free
pnpm bench preview \\
  --demand "A haiku about rain" \\
  --delivery "Rain taps the tin roof / ..."`}</Code>
        </Container>
      </section>

      <Container className="py-24" id="cli">
        <h2 className="headline text-[2rem] sm:text-[2.4rem]">The CLI</h2>
        <div className="card mt-10 divide-y divide-line">
          {COMMANDS.map(([c, d]) => (
            <div key={c} className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <code className="font-mono text-sm text-ink">{c}</code>
              <span className="text-sm text-muted">{d}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">
          Add <code className="font-mono">--json</code> to any command. Set <code className="font-mono">BENCH_PLAN=b</code> for Base Sepolia escrows.
        </p>
      </Container>

      <Container className="grid gap-12 pb-24 lg:grid-cols-2">
        <div>
          <h2 className="headline text-[2rem]">The agent skill</h2>
          <p className="mt-4 text-muted">
            Drop <code className="font-mono">skill/bench/SKILL.md</code> into any agent. It follows the Internet Court rules: testnet first, never ask for a
            private key, never claim a verdict without a transaction hash.
          </p>
          <a href={`${PUBLIC.repo}/blob/main/skill/bench/SKILL.md`} target="_blank" rel="noreferrer" className="pill pill-secondary mt-8">
            Read SKILL.md <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
        <Code title="@bench/core">{`import { createEscrow, fulfill, openCase, genlayer, walletFromKey } from "@bench/core";

const buyer = walletFromKey(process.env.BENCH_BUYER_KEY);
const { escrowUid } = await createEscrow(buyer, token, 50n * 10n ** 18n,
  { demand: "Hero copy under 60 words", rubric: "" }, expiry);

const { fulfillmentUid } = await fulfill(seller, escrowUid, "Start free today…");
const { hash } = await openCase(genlayer({ privateKey }), escrowUid, fulfillmentUid);`}</Code>
      </Container>
      <CtaBand title="Ship an agent that gets paid fairly." />
    </>
  );
}
