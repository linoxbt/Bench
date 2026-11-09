import type { Metadata } from "next";
import Link from "next/link";
import { Code, Container, CtaBand, PageHero } from "@/components/site/blocks";

export const metadata: Metadata = { title: "Architecture" };

const BOUNDARY = [
  ["Alkahest (Arkhai)", "EVM", "The money, the delivery attestation, the decision record, EAS"],
  ["BenchJudge (GenLayer)", "GenVM", "Reading escrow and delivery, the jury, one arbitrate message per delivery"],
  ["Bench tooling", "CLI · SDK · web", "Encoding demands, sending wallet transactions, showing state. It never decides"],
];

export default function Architecture() {
  return (
    <>
      <PageHero
        eyebrow="Architecture"
        title="Two chains of thought, one verdict."
        lede="Alkahest owns the money. GenLayer owns the judgment. Bench wires them together so the verdict reaches the escrow without anyone in between."
      >
        <Link href="/developers" className="pill pill-primary">
          Developer guide
        </Link>
      </PageHero>

      <Container className="pb-20">
        <div className="card overflow-hidden">
          <table className="w-full text-left text-[0.95rem]">
            <thead className="bg-wash text-sm text-muted">
              <tr>
                <th className="px-6 py-4 font-medium">Owned by</th>
                <th className="px-6 py-4 font-medium">Runs on</th>
                <th className="px-6 py-4 font-medium">Responsible for</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {BOUNDARY.map(([a, b, c]) => (
                <tr key={a}>
                  <td className="px-6 py-5 font-medium text-ink">{a}</td>
                  <td className="px-6 py-5 font-mono text-sm text-muted">{b}</td>
                  <td className="px-6 py-5 text-muted">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>

      <section className="bg-wash">
        <Container className="grid gap-6 py-24 lg:grid-cols-2">
          <article className="card p-8">
            <span className="inline-flex rounded-full bg-blue px-3 py-1 text-xs font-medium text-white">Plan A</span>
            <h2 className="headline mt-5 text-[1.7rem]">Everything on GenLayer</h2>
            <p className="mt-4 text-muted">
              Alkahest runs on GenLayer Chain, so BenchJudge reads it with typed EVM views and, after finality, emits arbitrate() itself. BenchJudge is the
              oracle: no relayer, no bridge, no trusted key.
            </p>
            <p className="mt-4 text-sm text-muted">
              Status: Alkahest must be redeployed to chain 4221 (<code className="font-mono">pnpm deploy:alkahest</code>) and the Day 1 probe must pass on
              Bradbury.
            </p>
          </article>
          <article className="card p-8">
            <span className="inline-flex rounded-full bg-ink px-3 py-1 text-xs font-medium text-white">Plan B</span>
            <h2 className="headline mt-5 text-[1.7rem]">Escrows on Base Sepolia</h2>
            <p className="mt-4 text-muted">
              BenchJudgeB reads Base Sepolia over JSON-RPC, pinned to one finalized block that every validator re-reads. It stores the verdict; a relayer (B1)
              or a bridge receiver (B2) delivers it, once.
            </p>
            <p className="mt-4 text-sm text-muted">Status: live on Studionet, reading real Base Sepolia through consensus.</p>
          </article>
        </Container>
      </section>

      <Container className="grid gap-12 py-24 lg:grid-cols-2">
        <div>
          <h2 className="headline text-[2rem]">The call sequence</h2>
          <ol className="mt-8 space-y-5">
            {[
              "Buyer: ERC20EscrowObligation.doObligation with TrustedOracleArbiter and a demand naming BenchJudge.",
              "Seller: commit → wait a block → doObligation(payload, escrowUid).",
              "Anyone: BenchJudge.judge(escrowUid, fulfillmentUid).",
              "BenchJudge: checks, then the jury via run_nondet_unsafe.",
              "On finality: TrustedOracleArbiter.arbitrate(fulfillment, demand, verdict).",
              "Seller collects, or buyer reclaims after expiry.",
            ].map((s, i) => (
              <li key={s} className="flex gap-4">
                <span className="font-mono text-sm text-blue">0{i + 1}</span>
                <span className="text-muted">{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <Code title="contracts/bench_judge.py">{`@gl.public.write
def judge(self, escrow_uid: str, fulfillment_uid: str):
    e_uid, f_uid = _uid(escrow_uid), _uid(fulfillment_uid)
    key = "0x" + f_uid.hex()          # one key per delivery
    if key in self.cases:
        raise UserError("[EXPECTED] already decided")
    ...                               # oracle, attester, refUID checks
    verdict = _jury(demand, rubric, delivery)
    self._record(...)
    TrustedOracleArbiter(self.arbiter).emit().arbitrate(
        f_uid, demand_data, verdict["fulfilled"])`}</Code>
      </Container>
      <CtaBand />
    </>
  );
}
