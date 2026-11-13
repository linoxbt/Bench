import type { Metadata } from "next";
import Link from "next/link";
import type { Hex } from "viem";
import { notFound } from "next/navigation";
import { BRADBURY_EXPLORER, STUDIO_EXPLORER, genvmTxUrl, LIMITS } from "@bench/core/browser";
import { CopyLink } from "@/components/CopyLink";
import { JuryPanel } from "@/components/JuryPanel";
import { Container } from "@/components/site/blocks";
import { Card, Hash, Note, Stamp } from "@/components/ui";
import { readVerdict, validCaseId } from "@/lib/read";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tx?: string }> };

const TX = /^0x[0-9a-fA-F]{64}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = decodeURIComponent((await params).id);
  if (!validCaseId(id)) return { title: "Verdict not found" };
  const v = await readVerdict(id);
  const c = "ok" in v.verdict ? v.verdict.ok : undefined;
  const title = c ? `${c.fulfilled ? "Fulfilled" : "Not fulfilled"}: ${c.demand.slice(0, 60)}` : "Verdict";
  return { title, description: c?.reason ?? "A verdict from a jury of independent GenLayer validators." };
}

export default async function VerdictPage({ params, searchParams }: Props) {
  const id = decodeURIComponent((await params).id);
  if (!validCaseId(id)) notFound();
  const { tx } = await searchParams;
  const txHash = tx && TX.test(tx) ? (tx.toLowerCase() as Hex) : undefined;
  const v = await readVerdict(id, txHash);
  const c = "ok" in v.verdict ? v.verdict.ok : undefined;
  const jury = v.jury && "ok" in v.jury ? v.jury.ok : undefined;
  const explorer = v.network === "studionet" ? STUDIO_EXPLORER : BRADBURY_EXPLORER;

  return (
    <Container className="pb-24">
      <div className="flex flex-col gap-6 pb-8 pt-12 sm:flex-row sm:items-end sm:justify-between sm:pt-16">
        <div className="min-w-0">
          <p className="eyebrow">
            Verdict · {v.network === "studionet" ? "GenLayer Studionet" : "Testnet Bradbury"}
            {c?.status === "preview" ? " · preview" : ""}
          </p>
          <h1 className="display mt-3 line-clamp-4 max-w-4xl text-[1.7rem] !leading-[1.08] sm:text-[2.3rem]">{c ? c.demand : "Verdict not found"}</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <CopyLink />
          <Link href="/preview" className="pill pill-primary pill-sm">
            Ask the jury
          </Link>
        </div>
      </div>

      {!c ? (
        <Note tone="warn">
          {"err" in v.verdict ? `Couldn't read BenchJudge: ${v.verdict.err}` : `No case with id ${id} on ${v.network}.`}
        </Note>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-6">
            <Card title="The verdict">
              <Stamp fulfilled={c.fulfilled} reason={c.reason ? `Leader's reason: ${c.reason}` : undefined} />
              <p className="mt-3 text-xs text-muted">
                {c.status === "preview"
                  ? "A preview: no money was involved."
                  : v.final
                    ? "Final: the appeal window has closed."
                    : "Accepted, in the appeal window: not final yet."}{" "}
                Validators vote on fulfilled / not fulfilled; the reason is the leader&apos;s wording.
              </p>
            </Card>
            <Card title="The jury" right={txHash && <Hash value={txHash} href={genvmTxUrl(txHash, v.network)} />}>
              {jury ? (
                <JuryPanel jury={jury} />
              ) : txHash ? (
                <Note tone="fail">Couldn&apos;t read the transaction: {v.jury && "err" in v.jury ? v.jury.err : ""}</Note>
              ) : (
                <p className="text-sm text-muted">
                  Validator votes are shown when the page is opened with its transaction (the preview and case pages link here with it).
                </p>
              )}
            </Card>
            <Card title="Rubric and delivery">
              <p className="eyebrow">Rubric, written by the buyer</p>
              <p className="mt-2 whitespace-pre-wrap text-muted">{c.rubric || "Fulfilled only if every explicit requirement in the demand is met."}</p>
              <p className="eyebrow mt-6">Delivery</p>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-wash p-4 font-mono text-xs leading-relaxed text-ink">{c.delivery}</pre>
              {c.delivery.length >= 2000 && (
                <p className="mt-2 text-xs text-muted">Showing the first 2,000 stored characters; the jury saw up to {LIMITS.deliveryChars.toLocaleString()}.</p>
              )}
            </Card>
          </div>
          <div className="space-y-4">
            <Card title="Record">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted">Case id</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs text-ink">{c.fulfillment_uid}</dd>
                </div>
                <div>
                  <dt className="text-muted">Opened by</dt>
                  <dd className="mt-0.5">
                    <Hash value={c.opened_by} href={`${explorer}/address/${c.opened_by}`} />
                  </dd>
                </div>
                {v.judge && (
                  <div>
                    <dt className="text-muted">Judge contract</dt>
                    <dd className="mt-0.5">
                      <Hash value={v.judge} href={`${explorer}/address/${v.judge}`} />
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted">Type</dt>
                  <dd className="mt-0.5 text-ink">{c.status === "preview" ? "Preview: no escrow, no money moved" : "Escrow case"}</dd>
                </div>
              </dl>
              {c.escrow_uid && (
                <Link href={`/case/${c.escrow_uid}/${c.fulfillment_uid}${txHash ? `?tx=${txHash}` : ""}`} className="pill pill-secondary pill-sm mt-5">
                  Escrow and payout
                </Link>
              )}
            </Card>
            <Link href="/cases" className="card card-hover block p-6">
              <p className="font-medium text-ink">More verdicts</p>
              <p className="mt-1 text-sm text-muted">Browse every case on the record.</p>
            </Link>
          </div>
        </div>
      )}
    </Container>
  );
}
