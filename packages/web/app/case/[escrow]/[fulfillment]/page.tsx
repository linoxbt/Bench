import { notFound } from "next/navigation";
import { formatUnits, type Hex } from "viem";
import { ALKAHEST_BRADBURY, evmAddressUrl, genvmTxUrl, LIMITS } from "@bench/core/browser";
import { AutoRefresh } from "@/components/AutoRefresh";
import { JuryPanel } from "@/components/JuryPanel";
import { SettleButtons } from "@/components/SettleButtons";
import { Card, Hash, Note, Stamp } from "@/components/ui";
import { PUBLIC } from "@/lib/config";
import { readCase } from "@/lib/read";

export const dynamic = "force-dynamic";

const UID = /^0x[0-9a-f]{64}$/;

export default async function CasePage({
  params,
  searchParams,
}: {
  params: Promise<{ escrow: string; fulfillment: string }>;
  searchParams: Promise<{ tx?: string }>;
}) {
  const { escrow, fulfillment } = await params;
  const { tx } = await searchParams;
  const e = escrow.toLowerCase() as Hex;
  const f = fulfillment.toLowerCase() as Hex;
  if (!UID.test(e) || !UID.test(f)) notFound();
  const txHash = tx && UID.test(tx.toLowerCase()) ? (tx.toLowerCase() as Hex) : undefined;

  if (!PUBLIC.judge) {
    return <Note tone="warn">Set NEXT_PUBLIC_BENCH_JUDGE to the deployed BenchJudge address.</Note>;
  }

  const view = await readCase(e, f, txHash);
  const escrowInfo = "ok" in view.escrow ? view.escrow.ok : undefined;
  const verdict = "ok" in view.verdict ? view.verdict.ok : undefined;
  const landed = "ok" in view.arbitration ? view.arbitration.ok : undefined;
  const jury = view.jury && "ok" in view.jury ? view.jury.ok : undefined;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const expired = escrowInfo ? escrowInfo.expirationTime !== 0n && escrowInfo.expirationTime <= now : false;
  const settled = escrowInfo?.revoked ?? false;
  const oracleOk = escrowInfo ? escrowInfo.oracle.toLowerCase() === PUBLIC.judge.toLowerCase() : true;

  return (
    <div className="space-y-6">
      <AutoRefresh active={!settled} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">case</p>
          <h1 className="text-xl font-bold">
            <Hash value={f} chars={14} />
          </h1>
        </div>
        <p className="text-xs text-dim">
          judge <Hash value={PUBLIC.judge} href={`https://explorer-bradbury.genlayer.com/address/${PUBLIC.judge}`} />
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="01 · Money locked">
          {escrowInfo ? (
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="label">amount</dt>
                <dd className="text-2xl font-bold text-teal">{formatUnits(escrowInfo.amount, 18)}</dd>
                <dd className="text-xs text-dim">
                  token <Hash value={escrowInfo.token} href={evmAddressUrl(escrowInfo.token)} />
                </dd>
              </div>
              <div>
                <dt className="label">escrow</dt>
                <dd>
                  <Hash value={e} />
                </dd>
              </div>
              <div>
                <dt className="label">expires</dt>
                <dd>{new Date(Number(escrowInfo.expirationTime) * 1000).toUTCString()}</dd>
              </div>
              <div>
                <dt className="label">state</dt>
                <dd className={settled ? "text-dim" : "text-teal"}>{settled ? "settled (collected or reclaimed)" : expired ? "expired: buyer may reclaim" : "locked"}</dd>
              </div>
              {!oracleOk && <Note tone="fail">This escrow names a different oracle ({escrowInfo.oracle}); BenchJudge will refuse it.</Note>}
            </dl>
          ) : (
            <Note tone="fail">Couldn&apos;t read this escrow: {"err" in view.escrow ? view.escrow.err : ""}</Note>
          )}
        </Card>

        <Card title="02 · Demand & delivery" className="lg:col-span-2">
          {verdict ? (
            <div className="space-y-4 text-sm">
              <div>
                <p className="label">demand</p>
                <p className="mt-1 whitespace-pre-wrap">{verdict.demand}</p>
              </div>
              <div>
                <p className="label">rubric (written by the buyer)</p>
                <p className="mt-1 whitespace-pre-wrap text-dim">{verdict.rubric || "Fulfilled only if every explicit requirement in the demand is met."}</p>
              </div>
              <div>
                <p className="label">delivery</p>
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap border border-line bg-ink p-3 text-xs">{verdict.delivery}</pre>
                {verdict.delivery.length >= 2000 && <p className="mt-1 text-xs text-dim">Showing the first 2,000 stored characters; the jury saw up to {LIMITS.deliveryChars.toLocaleString()}.</p>}
              </div>
            </div>
          ) : (
            <Note>
              {"err" in view.verdict
                ? `Couldn't read BenchJudge: ${view.verdict.err}`
                : "Not judged yet. Anyone can open the case: bench judge --escrow … --fulfillment …"}
            </Note>
          )}
        </Card>
      </div>

      <Card
        title="03 · Jury"
        right={txHash && <Hash value={txHash} href={genvmTxUrl(txHash)} />}
      >
        {jury ? (
          <JuryPanel jury={jury} />
        ) : txHash ? (
          <Note tone="fail">Couldn&apos;t read the GenLayer transaction: {view.jury && "err" in view.jury ? view.jury.err : ""}</Note>
        ) : (
          <Note>Add ?tx=&lt;hash from bench judge&gt; to this URL to see each validator&apos;s vote and the finality countdown.</Note>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="04 · Verdict">
          {verdict ? <Stamp fulfilled={verdict.fulfilled} reason={verdict.reason} /> : <Note>No verdict yet.</Note>}
        </Card>
        <Card title="05 · On Alkahest">
          <div className="space-y-4 text-sm">
            {landed ? (
              <p>
                <span className={landed.decision ? "text-pass" : "text-fail"}>ArbitrationMade: {String(landed.decision)}</span> from BenchJudge on{" "}
                <a className="underline" href={evmAddressUrl(ALKAHEST_BRADBURY.trustedOracleArbiter)} target="_blank" rel="noreferrer">
                  TrustedOracleArbiter
                </a>
                .
              </p>
            ) : (
              <Note>{verdict ? "Waiting for GenLayer finality: BenchJudge's arbitrate() executes only then." : "Nothing on Alkahest yet."}</Note>
            )}
            <SettleButtons
              escrowUid={e}
              fulfillmentUid={f}
              canCollect={Boolean(landed?.decision) && !settled}
              canReclaim={!settled && expired}
            />
            <p className="text-xs text-dim">
              Collect works once the verdict is true. Reclaim opens after expiry if the escrow is still locked, so sellers should collect promptly.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
