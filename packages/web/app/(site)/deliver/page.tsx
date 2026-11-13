"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits, hexToString, type Hex } from "viem";
import { LIMITS, deliverLite, deliveryWarnings, readEscrowLite, readTokenLite, type EscrowView, type SavedCommit } from "@bench/core/browser";
import { Container } from "@/components/site/blocks";
import { AppHeader, Card, Hash, Note, Stamp } from "@/components/ui";
import { JudgeButton } from "@/components/wallet/JudgeButton";
import { errorText, shortAddress, useWallet } from "@/components/wallet/WalletProvider";
import { addressUrl, publicClient, txUrl } from "@/lib/chain";
import { PUBLIC } from "@/lib/config";
import { clearCommit, saveCommit, savedCommit } from "@/lib/progress";

const UID = /^0x[0-9a-fA-F]{64}$/;
const STEPS = { commit: "Step 1 of 2: commit (confirm in your wallet)…", wait: "Waiting for the next block…", reveal: "Step 2 of 2: reveal (confirm in your wallet)…" };
/** A verdict needs the escrow alive for delivery + judging + finality; BenchJudge refuses under 10 minutes left. */
const MIN_LEFT_MS = 15 * 60_000;

export default function Deliver() {
  const w = useWallet();
  const [escrowUid, setEscrowUid] = useState("");
  const [escrow, setEscrow] = useState<EscrowView>();
  const [token, setToken] = useState<{ symbol: string; decimals: number }>();
  const [lookup, setLookup] = useState<string>();
  const [delivery, setDelivery] = useState("");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ fulfillmentUid: Hex; revealHash?: Hex }>();
  const [pending, setPending] = useState<SavedCommit>();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("escrow")) setEscrowUid(q.get("escrow")!);
    const f = q.get("fulfillment");
    if (f && UID.test(f)) setDone({ fulfillmentUid: f.toLowerCase() as Hex });
  }, []);

  useEffect(() => {
    setEscrow(undefined);
    setToken(undefined);
    setLookup(undefined);
    if (!UID.test(escrowUid.trim())) return;
    let live = true;
    setLookup("Reading the escrow…");
    (async () => {
      try {
        const e = await readEscrowLite(publicClient, PUBLIC.alkahest, escrowUid.trim().toLowerCase() as Hex);
        const t = await readTokenLite(publicClient, e.token).catch(() => undefined);
        if (live) (setEscrow(e), setToken(t), setLookup(undefined));
      } catch (e) {
        if (live) setLookup(`Couldn't read this escrow: ${errorText(e)}`);
      }
    })();
    return () => {
      live = false;
    };
  }, [escrowUid]);

  // An unfinished delivery for this escrow and wallet (committed, never revealed): offer to finish it.
  useEffect(() => {
    setPending(UID.test(escrowUid.trim()) && w.address ? savedCommit(escrowUid.trim() as Hex, w.address) : undefined);
  }, [escrowUid, w.address, done]);

  const warnings = deliveryWarnings(delivery);
  const left = escrow && escrow.expirationTime !== 0n ? Number(escrow.expirationTime) * 1000 - Date.now() : Infinity;
  const expired = left <= 0;
  const tooLate = !expired && left < MIN_LEFT_MS;
  const wrongOracle = escrow && PUBLIC.judge ? escrow.oracle.toLowerCase() !== PUBLIC.judge.toLowerCase() : false;
  const notTheSeller = Boolean(escrow?.seller && w.address && escrow.seller.toLowerCase() !== w.address.toLowerCase());
  const blocked = !escrow || escrow.revoked || expired || tooLate || wrongOracle || notTheSeller;
  const isBusd = PUBLIC.token && escrow && escrow.token.toLowerCase() === PUBLIC.token.toLowerCase();

  async function submit(resume?: SavedCommit) {
    setError(undefined);
    try {
      if (w.status !== "connected") {
        w.openModal();
        return;
      }
      const client = await w.getWalletClient();
      const e = escrowUid.trim().toLowerCase() as Hex;
      const r = await deliverLite(client, publicClient, PUBLIC.alkahest, e, resume ? hexToString(resume.payload) : delivery, (s) => setBusy(STEPS[s]), {
        saved: resume,
        onSaved: saveCommit, // before the commit is signed: a closed tab can't lose the salt
      });
      clearCommit(e, client.account.address);
      setDone(r);
      window.history.replaceState(null, "", `/deliver?escrow=${e}&fulfillment=${r.fulfillmentUid}`);
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
              <input className="field font-mono text-sm" value={escrowUid} onChange={(e) => setEscrowUid(e.target.value.trim())} placeholder="0x… (from the buyer's delivery link)" />
            </label>
            {lookup && <p className="mt-4 text-sm text-muted" role="status">{lookup}</p>}
            {escrow && (
              <div className="mt-5 space-y-4">
                <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                  <span className="text-muted">
                    Amount{" "}
                    <span className="font-medium text-ink">
                      {token ? `${formatUnits(escrow.amount, token.decimals)} ${token.symbol}` : `${escrow.amount.toString()} (raw units)`}
                    </span>
                  </span>
                  <span className="text-muted">
                    Token{" "}
                    <a className="font-mono text-ink underline decoration-line underline-offset-4" href={addressUrl(escrow.token)} target="_blank" rel="noreferrer">
                      {shortAddress(escrow.token)}
                    </a>
                  </span>
                  <span className="text-muted">
                    Expires <span className="font-medium text-ink">{escrow.expirationTime === 0n ? "never" : new Date(Number(escrow.expirationTime) * 1000).toLocaleString()}</span>
                  </span>
                  <span className="text-muted">
                    Seller <span className="font-medium text-ink">{escrow.seller ? shortAddress(escrow.seller) : "anyone (open bounty)"}</span>
                  </span>
                  <span className="text-muted">
                    Judged deliveries allowed <span className="font-medium text-ink">{escrow.tries}</span>
                  </span>
                </div>
                <div className="rounded-2xl bg-wash p-5">
                  <p className="eyebrow">Demand</p>
                  <p className="mt-2 whitespace-pre-wrap text-ink">{escrow.demand || "(not a natural-language demand)"}</p>
                  <p className="eyebrow mt-5">Rubric, written by the buyer</p>
                  <p className="mt-2 whitespace-pre-wrap text-muted">{escrow.rubric || "Fulfilled only if every explicit requirement in the demand is met."}</p>
                </div>
                {!isBusd && <Note tone="warn">This escrow pays in a token other than the site&apos;s bUSD. Check the token address before you work for it.</Note>}
                {escrow.revoked && <Note tone="fail">This escrow is already collected or reclaimed.</Note>}
                {expired && !escrow.revoked && <Note tone="fail">This escrow has expired: the buyer can reclaim it, and a verdict can&apos;t be collected.</Note>}
                {tooLate && !escrow.revoked && <Note tone="fail">This escrow expires in under 15 minutes: too late to deliver and get a verdict before it does.</Note>}
                {wrongOracle && <Note tone="fail">This escrow names a different oracle ({escrow.oracle}), so BenchJudge won&apos;t judge it.</Note>}
                {notTheSeller && <Note tone="fail">This escrow only accepts deliveries from {escrow.seller}. Connect that wallet to deliver.</Note>}
                {!escrow.seller && (
                  <Note tone="warn">
                    Open bounty: anyone may deliver. Once your delivery is revealed, someone could copy it and race you to a verdict; open
                    the case right after delivering.
                  </Note>
                )}
              </div>
            )}
          </Card>

          {pending && !done && (
            <Card title="Unfinished delivery">
              <div className="space-y-4 text-sm">
                <p className="text-muted">
                  You started a delivery to this escrow from this wallet{pending.commitHash ? " and committed it" : ""}, but it was never revealed. Finish it
                  {pending.commitHash ? " (no new commit, your bond is safe)" : ""}:
                </p>
                <p className="whitespace-pre-wrap rounded-xl bg-wash p-4 text-ink">{hexToString(pending.payload).slice(0, 600)}</p>
                <button className="pill pill-primary" disabled={!!busy || blocked} onClick={() => submit(pending)}>
                  {busy ?? "Finish this delivery"}
                </button>
              </div>
            </Card>
          )}

          <Card title="2 · Your delivery">
            <label className="block space-y-2">
              <span className="label flex justify-between">
                Delivery
                <span className={`font-normal ${delivery.length > LIMITS.deliveryChars ? "text-warn" : "text-muted"}`}>
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
            <button className="pill pill-primary mt-5" onClick={() => submit()} disabled={!!busy || (w.status === "connected" && (blocked || !delivery.trim()))}>
              {busy ?? (w.status !== "connected" ? "Connect wallet" : !w.onRightChain ? `Switch to ${PUBLIC.chainName} & deliver` : "Deliver")}
            </button>
            {error && (
              <div className="mt-4">
                <Note tone="fail">{error}</Note>
              </div>
            )}
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
                {done.revealHash && (
                  <p className="text-sm text-muted">
                    tx <Hash value={done.revealHash} href={txUrl(done.revealHash)} />
                  </p>
                )}
                <JudgeButton escrowUid={escrowUid.trim().toLowerCase() as Hex} fulfillmentUid={done.fulfillmentUid} />
                <Link className="pill pill-secondary pill-sm" href={`/case/${escrowUid.trim().toLowerCase()}/${done.fulfillmentUid}`}>
                  Track the case
                </Link>
              </div>
            </Card>
          ) : (
            <Card title="How delivery works">
              <ol className="space-y-3 text-sm text-muted">
                <li>
                  <span className="font-medium text-ink">Commit.</span> Your wallet locks a 1-wei bond and a hash of the work.
                </li>
                <li>
                  <span className="font-medium text-ink">Reveal.</span> One block later the work goes on chain, referencing the escrow. The bond comes back.
                </li>
                <li>
                  <span className="font-medium text-ink">Judge.</span> Open the case and the validator jury decides.
                </li>
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
