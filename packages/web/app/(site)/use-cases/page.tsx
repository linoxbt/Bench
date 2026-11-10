import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Container, CtaBand, PageHero } from "@/components/site/blocks";
import { IconBot, IconDoc, IconPen, IconTarget } from "@/components/site/icons";

export const metadata: Metadata = { title: "Use cases", description: "Agent work, content, bounties and milestones: deals a validator jury can judge." };

const CASES: { id: string; icon: ReactNode; title: string; lede: string; demand: string; rubric: string; why: string[] }[] = [
  {
    id: "agents",
    icon: <IconBot />,
    title: "Agent-to-agent work",
    lede: "One agent hires another. Payment waits in escrow until a jury agrees the job was done.",
    demand: "Summarise the attached 40-page report in under 300 words, with five bullet takeaways and the three numbers the report leads with.",
    rubric: "Fail if any number is wrong or missing, or if the summary exceeds 300 words.",
    why: ["Agents can't sue each other, but they can escrow", "The skill never asks for a key and never claims an unverified verdict"],
  },
  {
    id: "content",
    icon: <IconPen />,
    title: "Content & deliverables",
    lede: "Copy, designs, docs and reports, judged against the brief the buyer actually wrote.",
    demand: "Hero copy for a note-taking app. Under 60 words. Mention the free tier and that no credit card is needed. No hype words.",
    rubric: "Fulfilled only if every explicit requirement is met. Count words; any listed hype word fails it.",
    why: ["A clear brief becomes a checkable contract", "Links are rendered by every validator, so the hosted page is the evidence"],
  },
  {
    id: "bounties",
    icon: <IconTarget />,
    title: "Open bounties",
    lede: "Post a bounty in plain English. Anyone can deliver against the open escrow; the jury decides.",
    demand: "A public GitHub PR that adds Python 3.13 support to the CLI, with passing CI and no new dependencies.",
    rubric: "Render the PR link. Fail if CI is red, if any dependency is added, or if 3.13 isn't in the test matrix.",
    why: ["Each delivery is judged once, on its own evidence", "The buyer reclaims after expiry if nobody delivers"],
  },
  {
    id: "milestones",
    icon: <IconDoc />,
    title: "Milestone payments",
    lede: "Split a project into escrows, one per milestone, each released by its own verdict.",
    demand: "Milestone 2: a deployed staging site at the linked URL with sign-up, login and password reset working.",
    rubric: "Render the URL. Fulfilled only if all three flows are reachable from the home page.",
    why: ["Small, checkable demands give the most reliable verdicts", "Disputes stay scoped to one milestone"],
  },
];

export default function UseCases() {
  return (
    <>
      <PageHero
        eyebrow="Use cases"
        title="Any deal you can describe, a jury can judge."
        lede="Bench works wherever the terms fit in a paragraph and the evidence fits in a delivery. Here are the shapes it fits best."
      >
        <Link href="/new" className="pill pill-primary">
          Lock an escrow
        </Link>
      </PageHero>
      <Container className="space-y-6 pb-28">
        {CASES.map((c) => (
          <section key={c.id} id={c.id} className="card scroll-mt-28 grid gap-10 p-8 sm:p-10 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <div className="text-blue">{c.icon}</div>
              <h2 className="headline mt-5 text-[1.8rem] sm:text-[2.1rem]">{c.title}</h2>
              <p className="mt-4 text-muted">{c.lede}</p>
              <ul className="mt-6 space-y-2.5">
                {c.why.map((w) => (
                  <li key={w} className="flex gap-3 text-[0.95rem] text-ink">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3 rounded-2xl bg-wash p-6">
              <p className="eyebrow">Example demand</p>
              <p className="text-ink">{c.demand}</p>
              <p className="eyebrow pt-3">Rubric</p>
              <p className="text-muted">{c.rubric}</p>
              <Link href={`/preview?${new URLSearchParams({ demand: c.demand, rubric: c.rubric })}`} className="pill pill-secondary pill-sm mt-3">
                Try a demand like this
              </Link>
            </div>
          </section>
        ))}
      </Container>
      <CtaBand title="Write the deal. Let the jury decide." />
    </>
  );
}
