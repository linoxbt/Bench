"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Hex } from "viem";
import { collectLite, reclaimLite, waitConfirmed } from "@bench/core/browser";
import { errorText, useWallet } from "@/components/wallet/WalletProvider";
import { publicClient, txUrl } from "@/lib/chain";
import { PUBLIC } from "@/lib/config";
import { Hash, Note } from "./ui";

export function SettleButtons({
  escrowUid,
  fulfillmentUid,
  canCollect,
  canReclaim,
}: {
  escrowUid: Hex;
  fulfillmentUid: Hex;
  canCollect: boolean;
  canReclaim: boolean;
}) {
  const wallet = useWallet();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<Hex>();
  const [error, setError] = useState<string>();
  async function run(kind: "collect" | "reclaim") {
    setBusy(true);
    setError(undefined);
    try {
      const w = await wallet.getWalletClient();
      const hash =
        kind === "collect"
          ? await collectLite(w, PUBLIC.alkahest, escrowUid, fulfillmentUid)
          : await reclaimLite(w, PUBLIC.alkahest, escrowUid);
      await waitConfirmed(publicClient, hash, kind === "collect" ? "Collect" : "Reclaim");
      setTx(hash);
      router.refresh(); // show the settled escrow right away
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (wallet.status !== "connected") {
    return (
      <div className="space-y-2">
        <button className="pill pill-primary pill-sm" onClick={wallet.openModal}>
          Connect wallet to settle
        </button>
        <p className="text-xs text-muted">The seller collects with their wallet; the buyer reclaims with theirs.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <button className="pill pill-primary pill-sm" disabled={!canCollect || busy} onClick={() => run("collect")}>
          Collect (seller)
        </button>
        <button className="pill pill-secondary pill-sm" disabled={!canReclaim || busy} onClick={() => run("reclaim")}>
          Reclaim (buyer)
        </button>
      </div>
      {tx && (
        <p className="text-sm">
          Settled: <Hash value={tx} href={txUrl(tx)} />
        </p>
      )}
      {error && <Note tone="fail">{error}</Note>}
    </div>
  );
}
