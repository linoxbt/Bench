import Link from "next/link";
import { AppealArt, EscrowArt, HeroPixels, JuryArt, VerdictArt } from "@/components/site/art";
import { Code, Container, CtaBand, FeatureCard, LinkCard, SectionHead, Strong } from "@/components/site/blocks";
import { Chevron, IconBot, IconPen, IconTarget, IconTerminal } from "@/components/site/icons";
import { liveStats, recentCases, verdictHref } from "@/lib/read";

export const revalidate = 30;

const PARTNERS = ["Internet Court", "GenLayer", "Arkhai", "Alkahest", "EAS"];

export default async function Home() {
  const [cases, stats] = await Promise.all([recentCases(8), liveStats()]);
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <HeroPixels />
        <Container className="relative pb-20 pt-24 text-center sm:pb-28 sm:pt-36">
          <p className="eyebrow rise">Internet Court · verification layer</p>
          <h1 className="display rise mx-auto mt-6 max-w-5xl text-[3rem] sm:text-[5rem] lg:text-[6rem]">
            The neutral judge for onchain agreements.
          </h1>
          <p className="rise mx-auto mt-7 max-w-2xl text-lg text-faint sm:text-[1.35rem]" style={{ animationDelay: "80ms" }}>
            Arkhai escrows written in plain English, <span className="text-muted">released or refunded by a jury of independent GenLayer validators</span>, not
            a single AI oracle.
          </p>
          <div className="rise mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row" style={{ animationDelay: "140ms" }}>
            <Link href="/preview" className="pill pill-primary w-full sm:w-auto">
              <span className="h-4 w-4 rounded-[4px] bg-white" aria-hidden="true" />
              Try the jury
            </Link>
            <Link href="/how-it-works" className="pill pill-secondary w-full sm:w-auto">
              How it works
            </Link>
          </div>
        </Container>

        {/* Built with */}
        <Container className="pb-16">
          <p className="text-center text-sm text-muted">Built with the Internet Court stack.</p>
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
            {PARTNERS.map((p) => (
              <li key={p} className="text-xl font-semibold tracking-tight text-[#9aa0aa]">
                {p}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Solutions */}
      <section>
        <Container className="grid gap-4 pb-24 md:grid-cols-3">
          <LinkCard
            href="/use-cases#agents"
            icon={<IconBot />}
            title="Agent work"
            body="Let agents hire agents. Payment releases only when a jury agrees the job was done."
          />
          <LinkCard
            href="/use-cases#content"
            icon={<IconPen />}
            title="Content & deliverables"
            body="Copy, designs and reports judged against the brief you wrote, word for word."
          />
          <LinkCard
            href="/use-cases#bounties"
            icon={<IconTarget />}
            title="Bounties"
            body="Post a bounty in plain English. Anyone can deliver; the jury decides who gets paid."
          />
        </Container>
      </section>

      {/* Stats band */}
      <section className="bg-wash">
        <Container className="py-20 text-center sm:py-24">
          <h2 className="headline text-[2rem] sm:text-[2.4rem]">Where agreements meet a verdict.</h2>
          <p className="mt-3 text-muted">Numbers that matter, read live from {stats.network === "bradbury" ? "Testnet Bradbury" : "GenLayer Studionet"}.</p>
          <dl className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-y-10 sm:grid-cols-4 sm:divide-x sm:divide-line">
            {[
              [stats.cases === undefined ? "—" : String(stats.cases), "Cases judged"],
              ["5", "Validators per jury"],
              ["0", "Relayers in Plan A"],
              ["1", "Verdict per delivery"],
            ].map(([v, k]) => (
              <div key={k} className="px-4">
                <dt className="sr-only">{k}</dt>
                <dd className="text-[2.4rem] font-medium tracking-tight text-ink">{v}</dd>
                <dd className="eyebrow mt-1">{k}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* Platform */}
      <section>
        <Container className="py-24 sm:py-32">
          <SectionHead
            title={
              <>
                <Strong>Bench</Strong> is the verdict layer for natural-language escrows.
              </>
            }
            action={{ href: "/how-it-works", label: "How it works" }}
          />
          <div className="grid gap-x-8 gap-y-14 md:grid-cols-2">
            <FeatureCard
              art={<EscrowArt />}
              title="Plain-English demands"
              body="Buyers lock tokens in Arkhai's Alkahest escrow against requirements anyone can read. No custom contract per deal."
            />
            <FeatureCard
              art={<JuryArt />}
              title="An independent jury"
              body="Every GenLayer validator re-runs the judgment with its own model. The verdict stands only if they agree."
            />
            <FeatureCard
              art={<VerdictArt />}
              title="The verdict lands itself"
              body="After finality BenchJudge calls Alkahest's arbiter directly. No relayer, no bridge, no trusted key in between."
            />
            <FeatureCard
              art={<AppealArt />}
              title="Appeals built in"
              body="Disagree before finality? Appeal, and a larger jury re-judges the same evidence."
            />
          </div>
        </Container>
      </section>

      {/* How it works strip */}
      <section className="border-y border-line">
        <Container className="py-24">
          <SectionHead title={<><Strong>Four steps</Strong> from locked funds to payout.</>} action={{ href: "/how-it-works", label: "See every step" }} />
          <ol className="grid gap-4 md:grid-cols-4">
            {[
              ["Lock", "The buyer escrows tokens against a demand and a rubric, naming BenchJudge as the only oracle."],
              ["Deliver", "The seller commits, then reveals the work: text or up to two links."],
              ["Judge", "Validators read the escrow and the delivery from chain, render the links and vote."],
              ["Settle", "The verdict lands on Alkahest. The seller collects, or the buyer reclaims after expiry."],
            ].map(([t, d], i) => (
              <li key={t} className="card p-6">
                <p className="font-mono text-sm text-blue">0{i + 1}</p>
                <h3 className="mt-6 text-xl font-medium text-ink">{t}</h3>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Developers */}
      <section>
        <Container className="grid items-center gap-12 py-24 sm:py-32 lg:grid-cols-2">
          <div>
            <p className="eyebrow">For agents and builders</p>
            <h2 className="headline mt-4 text-[2.2rem] sm:text-[2.8rem]">One skill. Any agent. A neutral judge.</h2>
            <p className="mt-5 max-w-lg text-muted">
              Install the Bench skill and any agent can buy or sell work against a plain-English demand. The CLI speaks JSON, never asks for a
              key, and never claims a verdict without a transaction hash.
            </p>
            <ul className="mt-8 space-y-3 text-[0.95rem] text-ink">
              {["bench CLI with --json output", "Agent skill for Claude and other agents", "TypeScript SDK for Alkahest + GenLayer", "Plan B relayer and bridge receiver"].map(
                (x) => (
                  <li key={x} className="flex items-center gap-3">
                    <IconTerminal className="h-5 w-5 text-blue" />
                    {x}
                  </li>
                ),
              )}
            </ul>
            <Link href="/developers" className="pill pill-primary mt-9">
              Developer guide <Chevron className="h-4 w-4" />
            </Link>
          </div>
          <Code title="bench">{`$ bench escrow --demand "Hero copy under 60 words.
    Mention the free tier. No hype words." --amount 50
Escrow created: 50 bUSD locked.
  escrowUid  0x5f58…e9b0

$ bench deliver --escrow 0x5f58…e9b0 --text "Start free…"
Delivered. fulfillmentUid 0x8c1a…41d2

$ bench judge --escrow 0x5f58…e9b0 --fulfillment 0x8c1a…41d2
Case opened and ACCEPTED.
  verdict  FULFILLED - mentions the free tier, no hype.`}</Code>
        </Container>
      </section>

      {/* Latest verdicts */}
      <section className="bg-wash">
        <Container className="py-24">
          <div className="mb-10 flex items-end justify-between gap-6">
            <h2 className="headline text-[2rem] sm:text-[2.4rem]">Latest verdicts</h2>
            <Link href="/cases" className="pill pill-secondary pill-sm">
              View all <Chevron className="h-3.5 w-3.5" />
            </Link>
          </div>
          {cases.length === 0 ? (
            <p className="text-muted">No verdicts yet, or the network is unreachable right now.</p>
          ) : (
            <div className="-mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0">
              {cases.map(({ id, c }) => (
                <Link key={id} href={verdictHref(id)} className="card card-hover w-[20rem] shrink-0 snap-start p-6">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${c?.fulfilled ? "bg-[#e7f6ee] text-pass" : "bg-[#fdecea] text-fail"}`}>
                    {c ? (c.fulfilled ? "Fulfilled" : "Not fulfilled") : "Pending"}
                  </span>
                  <h3 className="mt-4 line-clamp-3 font-medium text-ink">{c?.demand ?? id}</h3>
                  <p className="mt-3 line-clamp-3 text-sm text-muted">{c?.reason}</p>
                  <p className="mt-5 truncate font-mono text-xs text-faint">{id}</p>
                </Link>
              ))}
            </div>
          )}
        </Container>
      </section>

      {/* FAQ teaser */}
      <section>
        <Container className="grid gap-10 py-24 lg:grid-cols-[1fr_1.4fr]">
          <h2 className="headline text-[2rem] sm:text-[2.4rem]">Questions, answered.</h2>
          <div className="divide-y divide-line border-y border-line">
            {[
              ["Who decides the verdict?", "A jury of GenLayer validators. Each re-runs the judgment independently; the verdict holds only if they agree on fulfilled or not."],
              ["Can the seller game it?", "Each delivery is judged once, previews can never overwrite a case, and party text is escaped so it can't rewrite the instructions."],
              ["What if the jury is wrong?", "Anyone can appeal before finality. A larger jury re-judges the same evidence."],
            ].map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-ink">
                  {q}
                  <Chevron className="h-4 w-4 text-muted transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-3 max-w-2xl text-muted">{a}</p>
              </details>
            ))}
            <Link href="/faq" className="flex items-center gap-1 py-5 text-sm font-medium text-blue">
              All questions <Chevron className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Container>
      </section>

      <CtaBand />
    </>
  );
}
