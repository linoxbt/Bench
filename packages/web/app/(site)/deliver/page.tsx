"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits, type Hex } from "viem";
import { LIMITS, deliverLite, deliveryWarnings, readEscrowLite, type EscrowView } from "@bench/core/browser";
import { Container } from "@/components/site/blocks";
import { AppHeader, Card, Hash, Note, Stamp } from "@/components/ui";
import { JudgeButton } from "@/components/wallet/JudgeButton";
import { errorText, useWallet } from "@/components/wallet/WalletProvider";
import { publicClient, txUrl } from "@/lib/chain";
import { PUBLIC } from "@/lib/config";

const UID = /^0x[0-9a-fA-F]{64}$/;
const STEPS = { commit: "Step 1 of 2: commit (confirm in your wallet)…", wait: "Waiting for the next block…", reveal: "Step 2 of 2: reveal (confirm in your wallet)…" };

export default function Deliver() {
  const w = useWallet();
  const [escrowUid, setEscrowUid] = useState("");
  const [escrow, setEscrow] = useState<EscrowView>();
  const [lookup, setLookup] = useState<string>();
  const [delivery, setDelivery] = useState("");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ fulfillmentUid: Hex; revealHash: Hex }>();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("escrow");
    if (q) setEscrowUid(q);
  }, []);

  useEffect(() => {
    setEscrow(undefined);
    setLookup(undefined);
    if (!UID.test(escrowUid.trim())) return;
    let live = true;
    setLookup("Reading the escrow…");
    readEscrowLite(publicClient, PUBLIC.alkahest, escrowUid.trim().toLowerCase() as Hex)
      .then((e) => live && (setEscrow(e), setLookup(undefined)))
      .catch((e) => live && setLookup(`Couldn't read this escrow: ${errorText(e)}`));
    return () => {
      live = false;
    };
  }, [escrowUid]);

  const warnings = deliveryWarnings(delivery);
  const expired = escrow ? escrow.expirationTime !== 0n && escrow.expirationTime * 1000n < BigInt(Date.now()) : false;
  const wrongOracle = escrow && PUBLIC.judge ? escrow.oracle.toLowerCase() !== PUBLIC.judge.toLowerCase() : false;

  async function submit() {
    setError(undefined);
    try {
      if (w.status !== "connected") {
        w.openModal();
        return;
      }
      const client = await w.getWalletClient();
      const r = await deliverLite(client, publicClient, PUBLIC.alkahest, escrowUid.trim().toLowerCase() as Hex, delivery, (s) => setBusy(STEPS[s]));
      setDone(r);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <Container className="pb-24">
      <AppHeader eyebrow="Deliver · seller" title="Deliver the work." lede="Read the buyer's terms, then deliver by commit-reveal so nobody can copy your work from the mempool." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Card title="1 · The escrow">
            <label className="block space-y-2">
              <span className="label">escrowUid</span>
              <input className="field font-mono text-sm" value={escrowUid} onChange={(e) => setEscrowUid(e.target.value)} placeholder="0x… (from the buyer's delivery link)" />
            </label>
            {lookup && <p className="mt-4 text-sm text-muted">{lookup}</p>}
            {escrow && (
              <div className="mt-5 space-y-4">
                <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                  <span className="text-muted">
                    Amount <span className="font-medium text-ink">{formatUnits(escrow.amount, 18)}</span>
                  </span>
                  <span className="text-muted">
                    Expires <span className="font-medium text-ink">{new Date(Number(escrow.expirationTime) * 1000).toLocaleString()}</span>
                  </span>
                </div>
                <div className="rounded-2xl bg-wash p-5">
                  <p className="eyebrow">Demand</p>
                  <p className="mt-2 whitespace-pre-wrap text-ink">{escrow.demand || "(not a natural-language demand)"}</p>
                  <p className="eyebrow mt-5">Rubric, written by the buyer</p>
                  <p className="mt-2 whitespace-pre-wrap text-muted">{escrow.rubric || "Fulfilled only if every explicit requirement in the demand is met."}</p>
                </div>
                {escrow.revoked && <Note tone="fail">This escrow is already collected or reclaimed.</Note>}
                {expired && !escrow.revoked && <Note tone="warn">This escrow has expired: the buyer can reclaim it at any time.</Note>}
                {wrongOracle && <Note tone="warn">This escrow names a different oracle ({escrow.oracle}), so BenchJudge won&apos;t judge it.</Note>}
              </div>
            )}
          </Card>

          <Card title="2 · Your delivery">
            <label className="block space-y-2">
              <span className="label flex justify-between">
                Delivery
                <span className="font-normal text-muted">
                  {delivery.length.toLocaleString()} / {LIMITS.deliveryChars.toLocaleString()}
                </span>
              </span>
              <textarea className="field" rows={7} value={delivery} onChange={(e) => setDelivery(e.target.value)} placeholder="The work itself, or up to two links to it." />
            </label>
            <div className="mt-4 space-y-2">
              {warnings.map((x) => (
                <Note key={x} tone="warn">
                  {x}
                </Note>
              ))}
            </div>
            <button
              className="pill pill-primary mt-5"
              onClick={submit}
              disabled={!!busy || (w.status === "connected" && (!escrow || escrow.revoked || !delivery.trim()))}
            >
              {busy ?? (w.status !== "connected" ? "Connect wallet" : !w.onRightChain ? `Switch to ${PUBLIC.chainName} & deliver` : "Deliver")}
            </button>
            {error && <div className="mt-4"><Note tone="fail">{error}</Note></div>}
          </Card>
        </div>

        <div className="space-y-4">
          {done ? (
            <Card title="Delivered">
              <div className="space-y-4">
                <Stamp fulfilled reason="Your delivery is on chain." />
                <p className="text-sm text-muted">
                  fulfillmentUid <Hash value={done.fulfillmentUid} />
                </p>
                <p className="text-sm text-muted">
                  tx <Hash value={done.revealHash} href={txUrl(done.revealHash)} />
                </p>
                <JudgeButton escrowUid={escrowUid.trim().toLowerCase() as Hex} fulfillmentUid={done.fulfillmentUid} />
                <Link className="pill pill-secondary pill-sm" href={`/case?escrow=${escrowUid.trim()}&fulfillment=${done.fulfillmentUid}`}>
                  Track the case
                </Link>
              </div>
            </Card>
          ) : (
            <Card title="How delivery works">
              <ol className="space-y-3 text-sm text-muted">
                <li><span className="font-medium text-ink">Commit.</span> Your wallet locks a 1-wei bond and a hash of the work.</li>
                <li><span className="font-medium text-ink">Reveal.</span> One block later the work goes on chain, referencing the escrow. The bond comes back.</li>
                <li><span className="font-medium text-ink">Judge.</span> Open the case and the validator jury decides.</li>
              </ol>
            </Card>
          )}
          <Link href="/preview" className="card card-hover block p-6">
            <p className="font-medium text-ink">Check your work first</p>
            <p className="mt-1 text-sm text-muted">Preview the verdict on Studionet for free before you deliver.</p>
          </Link>
        </div>
      </div>
    </Container>
  );
}
