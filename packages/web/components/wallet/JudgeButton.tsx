"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { Note } from "@/components/ui";
import { PUBLIC } from "@/lib/config";
import { saveJudgeTx, savedJudgeTx } from "@/lib/progress";
import { errorText, useWallet } from "./WalletProvider";

const RETRYING = ["UNDETERMINED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"];
/** Refusals a lagging RPC node can cause right after a reveal (mirrors LAG_PRONE_REFUSALS in @bench/core). */
const LAG_PRONE = [/does not reference this escrow/, /not a CommitRevealObligation attestation/];

/**
 * Opens the case on BenchJudge from the connected wallet. genlayer-js routes eth_sendTransaction through the
 * injected provider when the account is a plain address, so the user signs in their own wallet.
 * Bradbury needs a fee deposit, including a budget for the arbitrate() call BenchJudge emits on finality;
 * the unused part is refunded. genlayer-js is loaded only when the button is used.
 */
export function JudgeButton({ escrowUid, fulfillmentUid }: { escrowUid: Hex; fulfillmentUid: Hex }) {
  const w = useWallet();
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const casePath = `/case/${escrowUid}/${fulfillmentUid}`;

  // A case opened from this browser earlier (then the tab closed): put its transaction back on the page.
  useEffect(() => {
    const tx = savedJudgeTx(escrowUid, fulfillmentUid);
    const onCasePage = window.location.pathname === casePath;
    if (tx && onCasePage && !new URLSearchParams(window.location.search).get("tx")) router.replace(`${casePath}?tx=${tx}`);
  }, [escrowUid, fulfillmentUid, router, casePath]);

  async function judge() {
    setError(undefined);
    try {
      if (!PUBLIC.judge) throw new Error("BenchJudge isn't configured for this site.");
      if (w.status !== "connected" || !w.address || !w.provider) {
        w.openModal();
        return;
      }
      if (!w.onRightChain) {
        setBusy("Switching network…");
        await w.switchChain();
      }
      setBusy("Checking the case…");
      const [{ createClient }, { testnetBradbury }, { ARBITRATE_SELECTOR, feesFor }] = await Promise.all([
        import("genlayer-js"),
        import("genlayer-js/chains"),
        import("@bench/core/fees"),
      ]);
      const client = createClient({ chain: testnetBradbury, account: w.address, provider: w.provider as never, endpoint: PUBLIC.chainRpc });
      // Free preflight: BenchJudge says why it would refuse before anyone pays a fee. Right after a reveal, a lagging
      // RPC node can still miss the delivery, so those refusals are retried for up to 90 s.
      const check = async () =>
        String(await client.readContract({ address: PUBLIC.judge!, functionName: "check_case", args: [escrowUid, fulfillmentUid] }).catch(() => ""));
      const checkUntil = Date.now() + 90_000;
      let why = await check();
      while (why && LAG_PRONE.some((r) => r.test(why)) && Date.now() < checkUntil) {
        setBusy("Waiting for GenLayer to see the delivery…");
        await new Promise((r) => setTimeout(r, 5000));
        why = await check();
      }
      if (why) throw new Error(`BenchJudge won't hear this case: ${why.replace(/^\[\w+\]\s*/, "")}`);

      setBusy("Confirm in your wallet…");
      const hash = (await client.writeContract({
        address: PUBLIC.judge,
        functionName: "judge",
        args: [escrowUid, fulfillmentUid],
        value: 0n,
        fees: await feesFor({ client, network: "bradbury" }, [{ to: PUBLIC.alkahest.trustedOracleArbiter, selector: ARBITRATE_SELECTOR }]),
      })) as Hex;
      // Saved before waiting: a refresh or a closed tab keeps the transaction, so nobody pays to open it twice.
      saveJudgeTx(escrowUid, fulfillmentUid, hash);
      if (window.location.pathname === casePath) window.history.replaceState(null, "", `${casePath}?tx=${hash}`);

      setBusy("Validators are judging… (a minute or two)");
      const deadline = Date.now() + 20 * 60_000;
      for (;;) {
        const tx = await client.getTransaction({ hash: hash as never }).catch(() => undefined);
        const status = String(tx?.statusName ?? "");
        // Only CANCELED is terminal: after a timeout Bradbury rotates to a new leader (or, with none left, finalizes).
        if (status === "CANCELED") throw new Error("GenLayer canceled the transaction. You can open the case again.");
        if (RETRYING.includes(status)) setBusy("A leader timed out; GenLayer is handing the case to another validator…");
        if (status === "FINALIZED" && tx?.txExecutionResultName === "NOT_VOTED")
          throw new Error("The jury reached no result (its leaders timed out), so nothing was recorded. You can open the case again.");
        if (status === "ACCEPTED" || status === "FINALIZED") {
          if (tx?.txExecutionResultName === "FINISHED_WITH_ERROR") {
            const reason = String(await client.readContract({ address: PUBLIC.judge, functionName: "check_case", args: [escrowUid, fulfillmentUid] }).catch(() => ""));
            throw new Error(`BenchJudge refused the case${reason ? `: ${reason.replace(/^\[\w+\]\s*/, "")}` : "."}`);
          }
          break;
        }
        if (Date.now() > deadline) throw new Error("Still waiting for the jury after 20 minutes. The case page will update when it's done.");
        await new Promise((r) => setTimeout(r, 4000));
      }
      router.push(`${casePath}?tx=${hash}`);
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
      <p className="text-sm text-muted">
        Anyone can open a case. It needs a small GEN fee deposit (about 0.1 GEN, mostly refunded); the verdict is the jury&apos;s, not yours.
      </p>
      {busy && (
        <p className="sr-only" role="status">
          {busy}
        </p>
      )}
      {error && <Note tone="fail">{error}</Note>}
    </div>
  );
}
