import Link from "next/link";
import { Card, Hash, Note } from "@/components/ui";
import { PUBLIC } from "@/lib/config";
import { recentCases } from "@/lib/read";

export const revalidate = 30;

export default async function Home() {
  const cases = await recentCases();
  return (
    <div className="space-y-10">
      <section className="space-y-5">
        <p className="label">Internet Court · Arkhai · GenLayer</p>
        <h1 className="max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">
          Arkhai&apos;s natural-language escrows, judged by a jury of independent GenLayer validators instead of a single AI oracle.
        </h1>
        <p className="max-w-2xl text-dim">
          A buyer locks tokens against a plain-English demand. A seller delivers. GenLayer validators each judge the delivery, and
          the escrow pays or refunds on their consensus alone: BenchJudge writes the verdict to Alkahest itself. No relayer.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/preview" className="btn btn-solid">Try a demo verdict →</Link>
          <Link href="/new" className="btn">Lock an escrow</Link>
          <a href={PUBLIC.repo} className="btn" target="_blank" rel="noreferrer">Repo &amp; skill</a>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["01", "Money locked", "Buyer escrows ERC20 in Alkahest; the demand names BenchJudge as oracle."],
          ["02", "Delivery", "Seller commits, then reveals the delivery (text or links) against the escrow."],
          ["03", "Jury", "GenLayer validators each re-run the judgment and must agree on the verdict."],
          ["04", "Payout", "After finality BenchJudge calls arbitrate(); the seller collects or the buyer reclaims."],
        ].map(([n, t, d]) => (
          <Card key={n}>
            <p className="text-teal">{n}</p>
            <h3 className="mt-1 font-bold">{t}</h3>
            <p className="mt-2 text-sm text-dim">{d}</p>
          </Card>
        ))}
      </section>

      <Card title="Recent cases" right={PUBLIC.judge && <Hash value={PUBLIC.judge} href={`https://explorer-bradbury.genlayer.com/address/${PUBLIC.judge}`} />}>
        {!PUBLIC.judge ? (
          <Note tone="warn">Set NEXT_PUBLIC_BENCH_JUDGE to the deployed BenchJudge address to list cases.</Note>
        ) : cases.length === 0 ? (
          <Note>No cases yet, or Bradbury is unreachable right now.</Note>
        ) : (
          <ul className="divide-y divide-line">
            {cases.map(({ id, c }) => (
              <li key={id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{c?.demand ?? id}</p>
                  <p className="text-xs text-dim">{c?.status === "preview" ? id : <Hash value={id} />}</p>
                </div>
                {c && <span className={c.fulfilled ? "text-pass" : "text-fail"}>{c.fulfilled ? "FULFILLED" : "NOT FULFILLED"}</span>}
                {c?.escrow_uid && (
                  <Link className="btn" href={`/case/${c.escrow_uid}/${c.fulfillment_uid}`}>
                    view
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
