"use client";
import { useState } from "react";
import type { Hex } from "viem";
import { ALKAHEST_BRADBURY, collectLite, evmTxUrl, reclaimLite } from "@bench/core/browser";
import { connectWallet, errorText, publicClient } from "@/lib/wallet";
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
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<Hex>();
  const [error, setError] = useState<string>();
  async function run(kind: "collect" | "reclaim") {
    setBusy(true);
    setError(undefined);
    try {
      const w = await connectWallet();
      const hash =
        kind === "collect"
          ? await collectLite(w, ALKAHEST_BRADBURY, escrowUid, fulfillmentUid)
          : await reclaimLite(w, ALKAHEST_BRADBURY, escrowUid);
      await publicClient.waitForTransactionReceipt({ hash });
      setTx(hash);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-solid" disabled={!canCollect || busy} onClick={() => run("collect")}>
          Collect (seller)
        </button>
        <button className="btn" disabled={!canReclaim || busy} onClick={() => run("reclaim")}>
          Reclaim (buyer)
        </button>
      </div>
      {tx && (
        <p className="text-sm">
          Settled: <Hash value={tx} href={evmTxUrl(tx)} />
        </p>
      )}
      {error && <Note tone="fail">{error}</Note>}
    </div>
  );
}
