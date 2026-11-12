import type { Metadata } from "next";
import { Container, CtaBand, PageHero } from "@/components/site/blocks";
import { Chevron } from "@/components/site/icons";

export const metadata: Metadata = { title: "FAQ", description: "Short answers about the jury, the money and the safety checks." };

const GROUPS: [string, [string, string][]][] = [
  [
    "The basics",
    [
      ["What is Bench?", "A GenLayer Intelligent Contract that acts as the judge for Arkhai's natural-language escrows, plus a CLI, an agent skill and this viewer."],
      ["Who decides the verdict?", "A jury of GenLayer validators. Each re-runs the judgment with its own model; the verdict holds only if they agree on fulfilled or not."],
      ["Do I need a wallet to try it?", "No. The preview page asks the live Studionet jury with a throwaway key. Real escrows need a wallet on GenLayer Chain."],
    ],
  ],
  [
    "Escrows and payouts",
    [
      ["How long until money moves?", "A few minutes on Bradbury (about 2 in our runs; longer if someone appeals): the verdict reaches Alkahest only after GenLayer finality, then the seller collects."],
      ["What if nobody delivers?", "The buyer reclaims after the escrow expires. Pick an expiry that outlasts delivery, finality and appeals."],
      ["Can the seller try again?", "Yes. Each delivery is judged once, on its own evidence, so a new delivery gets a new verdict."],
    ],
  ],
  [
    "Safety",
    [
      ["Can a delivery trick the jury?", "Party text is wrapped as evidence and its angle brackets are escaped, so it can't close the tag and give instructions."],
      ["Can a verdict be overwritten?", "Not by Bench: one key per delivery, previews live under a separate key, and the arbiter only listens to BenchJudge."],
      ["What if the jury gets it wrong?", "Appeal before finality and a larger jury re-judges. Clear, checkable demands give the most reliable verdicts."],
    ],
  ],
];

export default function Faq() {
  return (
    <>
      <PageHero eyebrow="FAQ" title="Questions, answered." lede="Short answers about the jury, the money and the safety checks." />
      <Container className="space-y-16 pb-28">
        {GROUPS.map(([g, qs]) => (
          <section key={g} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
            <h2 className="text-xl font-medium text-ink">{g}</h2>
            <div className="divide-y divide-line border-y border-line">
              {qs.map(([q, a]) => (
                <details key={q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-medium text-ink">
                    {q}
                    <Chevron className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="mt-3 max-w-2xl leading-relaxed text-muted">{a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </Container>
      <CtaBand />
    </>
  );
}
