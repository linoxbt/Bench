import type { Metadata } from "next";
import Link from "next/link";
import { PipelineArt } from "@/components/site/art";
import { Container, CtaBand, PageHero } from "@/components/site/blocks";
import { Chevron } from "@/components/site/icons";

export const metadata: Metadata = { title: "How it works", description: "From locked funds to payout in four steps: lock, deliver, judge, settle." };

const STEPS = [
  {
    n: 1 as const,
    title: "The buyer locks funds against a demand",
    who: "Buyer",
    body: "Tokens go into Alkahest's ERC20 escrow. The demand is Arkhai's natural-language tuple: what must be delivered, plus a rubric for how to judge it. The escrow names BenchJudge as its only oracle, so nobody else can release it.",
    points: ["Write requirements a juror can check: length, must-mention, must-not-contain", "Set an expiry that outlasts delivery, finality and appeals (24 h by default)"],
  },
  {
    n: 2 as const,
    title: "The seller delivers with commit-reveal",
    who: "Seller",
    body: "The seller first commits a hash of the delivery with a tiny bond, then reveals it in a later block. Nobody can copy a delivery from the mempool. The bond comes back on reveal.",
    points: ["Text, or up to two links that validators will render", "The jury sees the first 6,000 characters and 8,000 per page"],
  },
  {
    n: 3 as const,
    title: "A validator jury judges the delivery",
    who: "Anyone opens the case",
    body: "BenchJudge reads the escrow and the delivery straight from chain, checks the oracle, the reference and the attester, then asks its validators. Each re-runs the judgment with its own model and must agree with the leader on fulfilled or not.",
    points: ["Party text is escaped, so a delivery can't rewrite the instructions", "Disagree before finality? Appeal, and a larger jury re-judges"],
  },
  {
    n: 4 as const,
    title: "The verdict lands, and money moves",
    who: "Seller or buyer",
    body: "GenLayer sends external messages only after finality. BenchJudge then calls Alkahest's TrustedOracleArbiter itself, as the oracle. A true verdict lets the seller collect; otherwise the buyer reclaims once the escrow expires.",
    points: ["Exactly one verdict per delivery: arbitrate overwrites, so Bench never sends two", "No relayer, bridge or trusted key in Plan A"],
  },
];

export default function HowItWorks() {
  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="From locked funds to payout, in four steps."
        lede="Bench connects Arkhai's natural-language escrows to a GenLayer jury. The only path from 'seller delivered' to 'money moves' runs through validator consensus."
      >
        <Link href="/preview" className="pill pill-primary">
          Try the jury
        </Link>
        <Link href="/architecture" className="pill pill-secondary">
          Architecture
        </Link>
      </PageHero>

      <Container className="space-y-24 pb-28 sm:space-y-32">
        {STEPS.map((s, i) => (
          <section key={s.n} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className={i % 2 ? "lg:order-2" : ""}>
              <div className="card aspect-[16/10] p-8">
                <PipelineArt step={s.n} />
              </div>
            </div>
            <div>
              <p className="font-mono text-sm text-blue">
                0{s.n} · {s.who}
              </p>
              <h2 className="headline mt-4 text-[1.9rem] sm:text-[2.4rem]">{s.title}</h2>
              <p className="mt-5 leading-relaxed text-muted">{s.body}</p>
              <ul className="mt-6 space-y-2.5">
                {s.points.map((p) => (
                  <li key={p} className="flex gap-3 text-[0.95rem] text-ink">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </Container>

      <section className="bg-wash">
        <Container className="py-20">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              ["Minutes", "Bradbury finality (about 2 min in our runs), then the verdict lands"],
              ["24 h", "Default escrow expiry: delivery + finality + appeals"],
              ["1 wei", "Seller's commit bond, returned on reveal"],
            ].map(([v, k]) => (
              <div key={k}>
                <p className="text-[2.2rem] font-medium tracking-tight text-ink">{v}</p>
                <p className="mt-1 text-muted">{k}</p>
              </div>
            ))}
          </div>
          <Link href="/trust" className="mt-12 inline-flex items-center gap-1 font-medium text-blue">
            Read the trust model <Chevron className="h-4 w-4" />
          </Link>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
