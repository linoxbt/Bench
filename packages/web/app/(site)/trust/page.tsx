import type { Metadata } from "next";
import { Container, CtaBand, PageHero } from "@/components/site/blocks";
import { Check, Close } from "@/components/site/icons";

export const metadata: Metadata = { title: "Trust model" };

const NOT_TRUSTED = [
  ["The seller", "Can deliver anything; the jury judges it against the demand."],
  ["Any single model", "Every validator re-runs the judgment and must agree."],
  ["A relayer or bridge (Plan A)", "BenchJudge calls Alkahest itself, as the oracle."],
  ["Whoever opens the case", "Opening a case only starts the jury; it can't steer it."],
];
const TRUSTED = [
  ["The buyer's wording", "The buyer writes the demand and the rubric. Sellers should read both before delivering."],
  ["GenLayer consensus", "Validators and the appeal process decide. Anyone can appeal before finality."],
  ["Alkahest's contracts", "The escrow holds the funds and records the oracle's decision."],
];
const CHECKS = [
  ["One key per delivery", "0xABC…, 0xabc… and abc… are the same case, so a seller can't reopen a verdict by changing case."],
  ["Previews can't shadow cases", "Previews live under a separate preview: key and can never overwrite a decided case."],
  ["Only real deliveries", "The fulfillment must reference this escrow, be unrevoked and be attested by CommitRevealObligation."],
  ["Only open escrows", "Escrows that were already collected or reclaimed are refused."],
  ["Evidence stays evidence", "Angle brackets in party text are escaped, so a delivery can't close its tag and give orders."],
  ["Clean failures", "If every validator gets the same error, they agree, so a bad case reverts instead of hanging."],
];

export default function Trust() {
  return (
    <>
      <PageHero
        eyebrow="Trust model"
        title="Trust the jury, not a person."
        lede="Bench removes the operator from the decision. Here is exactly what you rely on, what you don't, and the checks that keep the jury honest."
      />
      <Container className="grid gap-6 pb-24 lg:grid-cols-2">
        <section className="card p-8">
          <h2 className="text-xl font-medium text-ink">Not trusted</h2>
          <ul className="mt-6 space-y-5">
            {NOT_TRUSTED.map(([t, d]) => (
              <li key={t} className="flex gap-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fdecea] text-fail">
                  <Close className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="font-medium text-ink">{t}</p>
                  <p className="mt-1 text-sm text-muted">{d}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-8">
          <h2 className="text-xl font-medium text-ink">Trusted, and said out loud</h2>
          <ul className="mt-6 space-y-5">
            {TRUSTED.map(([t, d]) => (
              <li key={t} className="flex gap-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-wash text-blue">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="font-medium text-ink">{t}</p>
                  <p className="mt-1 text-sm text-muted">{d}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </Container>

      <section className="bg-wash">
        <Container className="py-24">
          <h2 className="headline max-w-2xl text-[2rem] sm:text-[2.4rem]">Six checks before any jury convenes.</h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CHECKS.map(([t, d], i) => (
              <div key={t} className="card p-6">
                <p className="font-mono text-sm text-blue">0{i + 1}</p>
                <h3 className="mt-4 font-medium text-ink">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <Container className="grid gap-10 py-24 lg:grid-cols-[1fr_1.4fr]">
        <h2 className="headline text-[2rem]">Known limits</h2>
        <ul className="space-y-5 text-muted">
          <li>
            <span className="font-medium text-ink">Redelivery.</span> Anyone can deliver against an open escrow, and each delivery is judged once. Bench doesn't
            yet bind a specific seller; that needs a field beside Arkhai's NLA tuple.
          </li>
          <li>
            <span className="font-medium text-ink">Collect window.</span> Collect works once the verdict is true; after expiry the buyer can reclaim, so sellers
            should collect promptly.
          </li>
          <li>
            <span className="font-medium text-ink">Plan B adds trust.</span> If escrows live on Base Sepolia, a relayer key (B1) or a bridge (B2) carries the
            verdict, and that is stated wherever Plan B ships.
          </li>
        </ul>
      </Container>
      <CtaBand />
    </>
  );
}
