"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Hex } from "viem";
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { ARBITRATE_SELECTOR, feesFor } from "@bench/core/browser";
import { Note } from "@/components/ui";
import { PUBLIC } from "@/lib/config";
import { errorText, useWallet } from "./WalletProvider";

/**
 * Opens the case on BenchJudge from the connected wallet. genlayer-js routes eth_sendTransaction through the
 * injected provider when the account is a plain address, so the user signs in their own wallet.
 * Bradbury needs a fee deposit, including a budget for the arbitrate() call BenchJudge emits on finality;
 * the unused part is refunded.
 */
export function JudgeButton({ escrowUid, fulfillmentUid }: { escrowUid: Hex; fulfillmentUid: Hex }) {
  const w = useWallet();
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  async function judge() {
    setError(undefined);
    try {
      if (!PUBLIC.judge) throw new Error("BenchJudge isn't deployed on Bradbury for this site yet.");
      if (w.status !== "connected" || !w.address || !w.provider) {
        w.openModal();
        return;
      }
      if (!w.onRightChain) {
        setBusy("Switching network…");
        await w.switchChain();
      }
      setBusy("Confirm in your wallet…");
      const client = createClient({ chain: testnetBradbury, account: w.address, provider: w.provider as never, endpoint: PUBLIC.chainRpc });
      const hash = (await client.writeContract({
        address: PUBLIC.judge,
        functionName: "judge",
        args: [escrowUid, fulfillmentUid],
        value: 0n,
        fees: await feesFor({ client, network: "bradbury" }, [{ to: PUBLIC.alkahest.trustedOracleArbiter, selector: ARBITRATE_SELECTOR }]),
      })) as Hex;
      setBusy("Validators are judging… (a minute or two)");
      await client.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.ACCEPTED, retries: 120, interval: 5000 });
      router.push(`/case/${escrowUid}/${fulfillmentUid}?tx=${hash}`);
      router.refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="space-y-3">
      <button className="pill pill-primary" onClick={judge} disabled={!!busy}>
        {busy ?? (w.status === "connected" ? "Open the case" : "Connect wallet to open the case")}
      </button>
      <p className="text-sm text-muted">Anyone can open a case. It needs a small GEN fee deposit (about 0.1 GEN, mostly refunded); the verdict is the jury&apos;s, not yours.</p>
      {error && <Note tone="fail">{error}</Note>}
    </div>
  );
}
