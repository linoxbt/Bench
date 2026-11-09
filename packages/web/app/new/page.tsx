"use client";
import { useState } from "react";
import Link from "next/link";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import { ALKAHEST_BRADBURY, ERC20_ABI, createEscrowLite, evmTxUrl, parseExpiry } from "@bench/core/browser";
import { Card, Hash, Note } from "@/components/ui";
import { PUBLIC } from "@/lib/config";
import { connectWallet, errorText, publicClient } from "@/lib/wallet";

export default function NewEscrow() {
  const [demand, setDemand] = useState(
    "Landing-page hero copy for a note-taking app. Under 60 words. Must mention the free tier and that no credit card is needed. No hype words.",
  );
  const [rubric, setRubric] = useState("Fulfilled only if every explicit requirement is met.");
  const [amount, setAmount] = useState("50");
  const [expires, setExpires] = useState("24h");
  const [token, setToken] = useState<string>(PUBLIC.token ?? "");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ escrowUid: Hex; hash: Hex; label: string }>();

  async function submit() {
    setError(undefined);
    try {
      if (!PUBLIC.judge) throw new Error("NEXT_PUBLIC_BENCH_JUDGE is not set for this deployment.");
      const tokenAddr = token as Address;
      setBusy("Connecting wallet…");
      const wallet = await connectWallet();
      const decimals = await publicClient.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "decimals" });
      const symbol = await publicClient.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "symbol" }).catch(() => "tokens");
      const value = parseUnits(amount, decimals);
      setBusy("Approve, then lock the escrow in your wallet…");
      const r = await createEscrowLite(
        wallet,
        publicClient,
        ALKAHEST_BRADBURY,
        PUBLIC.judge,
        tokenAddr,
        value,
        { demand, rubric },
        parseExpiry(expires),
      );
      setResult({ ...r, label: `${formatUnits(value, decimals)} ${symbol}` });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card title="Lock an escrow">
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="label">Demand: what the seller must deliver</span>
            <textarea rows={4} value={demand} onChange={(e) => setDemand(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="label">Rubric: how the jury judges (sellers see this)</span>
            <textarea rows={2} value={rubric} onChange={(e) => setRubric(e.target.value)} />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="label">Amount</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="label">Token (ERC20 on chain 4221)</span>
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="0x… (BenchUSD)" />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="label">Expires in</span>
            <input value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
          <button className="btn btn-solid" disabled={!!busy || !token} onClick={submit}>
            {busy ?? "Lock escrow"}
          </button>
          {error && <Note tone="fail">{error}</Note>}
        </div>
      </Card>

      <div className="space-y-4">
        <Card title="Before you lock">
          <ul className="space-y-2 text-sm text-dim">
            <li>Write requirements a juror can check: length, must-mention, must-not-contain, format.</li>
            <li>The expiry must outlast delivery, GenLayer finality (~30 min) and any appeal. Reclaim opens only after it.</li>
            <li>The escrow names BenchJudge as its only oracle: no one else can release it.</li>
          </ul>
        </Card>
        {result && (
          <Card title="Escrow locked">
            <p className="text-sm">{result.label} locked.</p>
            <p className="mt-2 text-sm">
              escrowUid <Hash value={result.escrowUid} />
            </p>
            <p className="text-sm">
              tx <Hash value={result.hash} href={evmTxUrl(result.hash)} />
            </p>
            <Note>
              Share the escrowUid, demand and rubric with the seller. They deliver with <code>bench deliver</code>, then anyone opens the case with{" "}
              <code>bench judge</code>.
            </Note>
            <Link className="btn mt-3" href={`/case?escrow=${result.escrowUid}`}>
              Track this escrow
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
