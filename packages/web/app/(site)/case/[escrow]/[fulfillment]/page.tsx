import Link from "next/link";
import { notFound } from "next/navigation";
import { formatUnits, type Hex } from "viem";
import { BRADBURY_EXPLORER, LIMITS, decodeNlaDemand, parseBenchTerms } from "@bench/core/browser";
import { JudgeButton } from "@/components/wallet/JudgeButton";
import { AutoRefresh } from "@/components/AutoRefresh";
import { JuryPanel } from "@/components/JuryPanel";
import { SettleButtons } from "@/components/SettleButtons";
import { Container } from "@/components/site/blocks";
import { Card, Hash, Note, Stamp } from "@/components/ui";
import { PUBLIC } from "@/lib/config";
import { addressUrl, txUrl } from "@/lib/chain";
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
    return (
      <Container className="pb-24">
        <div className="pb-10 pt-12 sm:pt-16">
          <p className="eyebrow">Case</p>
          <h1 className="display mt-3 text-[2.4rem] sm:text-[3.2rem]">Escrow cases open on Bradbury.</h1>
          <p className="mt-4 max-w-2xl text-muted">
            Cases with real escrows are judged by BenchJudge on Testnet Bradbury, which this deployment isn&apos;t configured for. Every past verdict is in
            the case explorer, and you can ask the jury for free on the preview page.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="pill pill-primary" href="/preview">Try the jury</Link>
            <Link className="pill pill-secondary" href="/cases">Case explorer</Link>
          </div>
        </div>
      </Container>
    );
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
  let terms: { demand: string; rubric: string; seller?: string; tries: number } | undefined;
  try {
    if (escrowInfo) {
      const nla = decodeNlaDemand(escrowInfo.demandData);
      terms = { demand: nla.demand, rubric: nla.arbitrationPrompt, ...parseBenchTerms(nla.arbitrationModel) };
    }
  } catch {
    terms = undefined;
  }
  const amount = escrowInfo
    ? view.token
      ? `${formatUnits(escrowInfo.amount, view.token.decimals)} ${view.token.symbol}`
      : `${escrowInfo.amount.toString()} (raw units)`
    : "";
  // Nothing more can change once the escrow is settled, the verdict is on Alkahest, or it can never be judged.
  const terminal = settled || Boolean(landed) || Boolean(view.refusal) || !oracleOk || (expired && !verdict);
  const canJudge = !verdict && !settled && oracleOk && !expired && !view.refusal;

  return (
    <Container className="space-y-6 pb-24">
      <AutoRefresh active={!terminal} />
      <header className="flex flex-col gap-4 pb-4 pt-12 sm:flex-row sm:items-end sm:justify-between sm:pt-16">
        <div>
          <p className="eyebrow">Case</p>
          <h1 className="display mt-3 break-all text-[1.8rem] sm:text-[2.6rem]">
            {f.slice(0, 10)}…{f.slice(-6)}
          </h1>
        </div>
        <p className="text-sm text-muted">
          judged by <Hash value={PUBLIC.judge} href={`${BRADBURY_EXPLORER}/address/${PUBLIC.judge}`} />
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="01 · Money locked">
          {escrowInfo ? (
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="eyebrow">amount</dt>
                <dd className="text-3xl font-medium tracking-tight text-ink">{amount}</dd>
                <dd className="text-xs text-muted">
                  token <Hash value={escrowInfo.token} href={addressUrl(escrowInfo.token)} />
                  {PUBLIC.token && escrowInfo.token.toLowerCase() === PUBLIC.token.toLowerCase() ? " (bUSD: a free test token)" : ""}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">escrow</dt>
                <dd>
                  <Hash value={e} />
                </dd>
              </div>
              <div>
                <dt className="eyebrow">expires</dt>
                <dd>{escrowInfo.expirationTime === 0n ? "never" : new Date(Number(escrowInfo.expirationTime) * 1000).toUTCString()}</dd>
              </div>
              {terms && (
                <div>
                  <dt className="eyebrow">terms</dt>
                  <dd className="text-muted">
                    {terms.seller ? <>seller <Hash value={terms.seller} chars={6} /></> : "open bounty (anyone may deliver)"} · up to {terms.tries} judged
                    deliveries
                  </dd>
                </div>
              )}
              <div>
                <dt className="eyebrow">state</dt>
                <dd className={settled ? "text-muted" : "text-blue"}>
                  {settled ? "settled (collected or reclaimed)" : expired ? "expired: the buyer may reclaim; it can no longer be collected" : "locked"}
                </dd>
              </div>
              {!oracleOk && <Note tone="fail">This escrow names a different oracle ({escrowInfo.oracle}); BenchJudge will refuse it.</Note>}
            </dl>
          ) : (
            <Note tone="fail">Couldn&apos;t read this escrow: {"err" in view.escrow ? view.escrow.err : ""}</Note>
          )}
        </Card>

        <Card title="02 · Demand & delivery" className="lg:col-span-2">
          {verdict || terms ? (
            <div className="space-y-4 text-sm">
              <div>
                <p className="eyebrow">demand</p>
                <p className="mt-1 whitespace-pre-wrap">{verdict?.demand ?? terms?.demand}</p>
              </div>
              <div>
                <p className="eyebrow">rubric (written by the buyer)</p>
                <p className="mt-1 whitespace-pre-wrap text-muted">
                  {(verdict?.rubric ?? terms?.rubric) || "Fulfilled only if every explicit requirement in the demand is met."}
                </p>
              </div>
              {verdict ? (
                <div>
                  <p className="eyebrow">delivery{verdict.delivered_by ? <> by <Hash value={verdict.delivered_by} chars={6} /></> : null}</p>
                  <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-wash p-4 font-mono text-xs leading-relaxed text-ink">{verdict.delivery}</pre>
                  {verdict.delivery.length >= 2000 && (
                    <p className="mt-1 text-xs text-muted">Showing the first 2,000 stored characters; the jury saw up to {LIMITS.deliveryChars.toLocaleString()}.</p>
                  )}
                </div>
              ) : (
                <Note>Not judged yet. The delivery appears here once the jury has heard the case.</Note>
              )}
            </div>
          ) : (
            <Note>{"err" in view.verdict ? `Couldn't read BenchJudge: ${view.verdict.err}` : "Not judged yet."}</Note>
          )}
        </Card>
      </div>

      <Card title="03 · Jury" right={txHash && <Hash value={txHash} href={`${BRADBURY_EXPLORER}/tx/${txHash}`} />}>
        {jury ? (
          <JuryPanel jury={jury} />
        ) : txHash ? (
          <Note tone="fail">Couldn&apos;t read the GenLayer transaction: {view.jury && "err" in view.jury ? view.jury.err : ""}</Note>
        ) : (
          <Note>Once a case is opened from this browser its transaction is added here automatically; otherwise add ?tx=&lt;hash from bench judge&gt;.</Note>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="04 · Verdict">
          {verdict ? (
            <div className="space-y-3">
              <Stamp fulfilled={verdict.fulfilled} reason={verdict.reason ? `Leader's reason: ${verdict.reason}` : undefined} />
              <p className="text-xs text-muted">
                {view.final
                  ? "Final: the appeal window has closed."
                  : "Accepted, in the appeal window: not final yet. An appeal can still change it."}{" "}
                Validators vote on fulfilled / not fulfilled; the reason is the leader&apos;s wording.
              </p>
            </div>
          ) : "err" in view.verdict ? (
            <Note>Couldn&apos;t read the verdict: {view.verdict.err}</Note>
          ) : view.refusal ? (
            <Note tone="fail">BenchJudge won&apos;t hear this case: {view.refusal.replace(/^\[\w+\]\s*/, "")}</Note>
          ) : canJudge ? (
            <div className="space-y-3">
              {jury?.status === "FINALIZED" && (
                <Note tone="warn">
                  That transaction finalized without a verdict (for example, an appeal round timed out), so nothing was recorded. Open the case again.
                </Note>
              )}
              <JudgeButton escrowUid={e} fulfillmentUid={f} />
            </div>
          ) : (
            <Note>This case can&apos;t be opened: the escrow is {settled ? "settled" : expired ? "expired" : "not judged by BenchJudge"}.</Note>
          )}
        </Card>
        <Card title="05 · On Alkahest">
          <div className="space-y-4 text-sm">
            {landed ? (
              <p>
                <span className={landed.decision ? "text-pass" : "text-fail"}>ArbitrationMade: {String(landed.decision)}</span> from BenchJudge on{" "}
                <a className="underline" href={addressUrl(PUBLIC.alkahest.trustedOracleArbiter)} target="_blank" rel="noreferrer">
                  TrustedOracleArbiter
                </a>{" "}
                (<Hash value={landed.txHash} href={txUrl(landed.txHash)} chars={8} />).
              </p>
            ) : "err" in view.arbitration && escrowInfo ? (
              <Note tone="warn">Couldn&apos;t read Alkahest just now ({view.arbitration.err}); this page retries.</Note>
            ) : (
              <Note>{verdict ? "Waiting for GenLayer finality: BenchJudge's arbitrate() executes only then." : "Nothing on Alkahest yet."}</Note>
            )}
            <SettleButtons escrowUid={e} fulfillmentUid={f} canCollect={Boolean(landed?.decision) && !settled && !expired} canReclaim={!settled && expired} />
            <p className="text-xs text-muted">
              Collect works once the verdict is true and before the escrow expires. Reclaim opens after expiry if the escrow is still locked, so sellers should
              collect promptly.
            </p>
          </div>
        </Card>
      </div>
    </Container>
  );
}
