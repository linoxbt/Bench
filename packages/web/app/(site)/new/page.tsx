"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatUnits, isAddress, type Address, type Hex } from "viem";
import { DEFAULT_TRIES, ERC20_ABI, MAX_TERMS_CHARS, createEscrowLite, demandProblems, parseAmount, parseExpiry } from "@bench/core/browser";
import { Container } from "@/components/site/blocks";
import { AppHeader, Card, Hash, Note, Stamp } from "@/components/ui";
import { PUBLIC } from "@/lib/config";
import { errorText, useWallet } from "@/components/wallet/WalletProvider";
import { publicClient, txUrl } from "@/lib/chain";
import { myEscrows, rememberEscrow, type MyEscrow } from "@/lib/progress";

type TokenInfo = { decimals: number; symbol: string; balance?: bigint };

export default function NewEscrow() {
  const w = useWallet();
  const [copied, setCopied] = useState(false);
  const [demand, setDemand] = useState(
    "Landing-page hero copy for a note-taking app. Under 60 words. Must mention the free tier and that no credit card is needed. No hype words.",
  );
  const [rubric, setRubric] = useState("Fulfilled only if every explicit requirement is met.");
  const [amount, setAmount] = useState("50");
  const [expires, setExpires] = useState("24h");
  const [token, setToken] = useState<string>(PUBLIC.token ?? "");
  const [seller, setSeller] = useState("");
  const [openBounty, setOpenBounty] = useState(false);
  const [tries, setTries] = useState(3);
  const [info, setInfo] = useState<TokenInfo>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ escrowUid: Hex; hash: Hex; label: string }>();
  const [recent, setRecent] = useState<MyEscrow[]>([]);

  useEffect(() => setRecent(myEscrows()), [result]);

  // Token decimals, symbol and the buyer's balance, so the amount is checked before any wallet prompt.
  useEffect(() => {
    let live = true;
    setInfo(undefined);
    if (!isAddress(token, { strict: false })) return;
    (async () => {
      try {
        const [decimals, symbol, balance] = await Promise.all([
          publicClient.readContract({ address: token as Address, abi: ERC20_ABI, functionName: "decimals" }),
          publicClient.readContract({ address: token as Address, abi: ERC20_ABI, functionName: "symbol" }).catch(() => "tokens"),
          w.address ? publicClient.readContract({ address: token as Address, abi: ERC20_ABI, functionName: "balanceOf", args: [w.address] }) : undefined,
        ]);
        if (live) setInfo({ decimals: Number(decimals), symbol, balance });
      } catch {
        if (live) setInfo(undefined);
      }
    })();
    return () => {
      live = false;
    };
  }, [token, w.address]);

  const problems = useMemo(() => {
    const out = demandProblems({ demand, rubric, seller: openBounty || !seller ? undefined : (seller as Address), tries });
    if (!isAddress(token, { strict: false })) out.push("Enter the token's address.");
    else if (!info) out.push("That address isn't an ERC20 token on this chain.");
    if (!openBounty && !seller.trim()) out.push("Name the seller, or tick 'Open bounty' if anyone may deliver.");
    if (!openBounty && seller.trim() && !isAddress(seller.trim(), { strict: false })) out.push("The seller must be an address (0x…).");
    if (info) {
      try {
        const v = parseAmount(amount, info.decimals);
        if (info.balance !== undefined && v > info.balance) out.push(`You hold ${formatUnits(info.balance, info.decimals)} ${info.symbol}: less than the amount.`);
      } catch (e) {
        out.push((e as Error).message);
      }
    }
    try {
      parseExpiry(expires);
    } catch (e) {
      out.push((e as Error).message);
    }
    return out;
  }, [demand, rubric, seller, openBounty, tries, token, info, amount, expires]);

  async function submit() {
    setError(undefined);
    try {
      if (!PUBLIC.judge) throw new Error("NEXT_PUBLIC_BENCH_JUDGE is not set for this deployment.");
      if (w.status !== "connected") {
        w.openModal();
        return;
      }
      if (problems.length || !info) throw new Error(problems[0] ?? "Check the token.");
      setBusy("Confirm in your wallet…");
      const wallet = await w.getWalletClient();
      const value = parseAmount(amount, info.decimals);
      setBusy("Approve, then lock the escrow in your wallet…");
      const r = await createEscrowLite(
        wallet,
        publicClient,
        PUBLIC.alkahest,
        PUBLIC.judge,
        token as Address,
        value,
        // The default tries is left out of the terms (BenchJudge assumes 3), like the CLI, so equal escrows encode equally.
        { demand, rubric, seller: openBounty ? undefined : (seller.trim() as Address), tries: tries === DEFAULT_TRIES ? undefined : tries },
        parseExpiry(expires),
      );
      const label = `${formatUnits(value, info.decimals)} ${info.symbol}`;
      rememberEscrow({ escrowUid: r.escrowUid, label, at: Date.now() });
      setResult({ ...r, label });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(undefined);
    }
  }

  const isBusd = PUBLIC.token && token.toLowerCase() === PUBLIC.token.toLowerCase();

  return (
    <Container className="pb-24">
      <AppHeader
        eyebrow="New escrow · GenLayer Chain"
        title="Lock an escrow."
        lede="Escrow tokens against a plain-English demand. Only BenchJudge's verdict can release them."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <Card title="Terms">
          <div className="space-y-5">
            <label className="block space-y-2">
              <span className="label flex justify-between">
                <span>Demand: what the seller must deliver</span>
                <span className={demand.length > MAX_TERMS_CHARS ? "text-fail" : "text-muted"}>
                  {demand.length.toLocaleString()} / {MAX_TERMS_CHARS.toLocaleString()}
                </span>
              </span>
              <textarea className="field" rows={4} value={demand} onChange={(e) => setDemand(e.target.value)} />
            </label>
            <label className="block space-y-2">
              <span className="label flex justify-between">
                <span>Rubric: how the jury judges (sellers see this)</span>
                <span className={rubric.length > MAX_TERMS_CHARS ? "text-fail" : "text-muted"}>
                  {rubric.length.toLocaleString()} / {MAX_TERMS_CHARS.toLocaleString()}
                </span>
              </span>
              <textarea className="field" rows={2} value={rubric} onChange={(e) => setRubric(e.target.value)} />
            </label>
            <div className="grid gap-5 sm:grid-cols-3">
              <label className="block space-y-2">
                <span className="label">Amount{info ? ` (${info.symbol})` : ""}</span>
                <input className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              <label className="block space-y-2 sm:col-span-2">
                <span className="label">Token (ERC20 on chain {PUBLIC.chainId})</span>
                <input className="field font-mono text-sm" value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="0x… (BenchUSD)" />
              </label>
            </div>
            {info && !isBusd && <Note tone="warn">This isn&apos;t the site&apos;s bUSD test token. Sellers will see its address; make sure it&apos;s what you mean to pay in.</Note>}
            <div className="space-y-2">
              <label className="block space-y-2">
                <span className="label">Seller: the only address whose deliveries the jury will judge</span>
                <input
                  className="field font-mono text-sm"
                  value={seller}
                  disabled={openBounty}
                  onChange={(e) => setSeller(e.target.value.trim())}
                  placeholder="0x… (the seller's wallet)"
                />
              </label>
              <label className="flex items-start gap-2 text-sm text-muted">
                <input type="checkbox" className="mt-1" checked={openBounty} onChange={(e) => setOpenBounty(e.target.checked)} />
                <span>
                  Open bounty: anyone may deliver. Riskier for sellers: once a delivery is revealed, someone could copy it and race the
                  seller to a verdict. Name the seller for hired work.
                </span>
              </label>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="label">Expires in (30m minimum, 24h recommended)</span>
                <input className="field" value={expires} onChange={(e) => setExpires(e.target.value)} />
              </label>
              <label className="block space-y-2">
                <span className="label">Deliveries the jury will judge</span>
                <select className="field" value={tries} onChange={(e) => setTries(Number(e.target.value))}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                      {n === 3 ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {problems.length > 0 && (
              <ul className="space-y-1 text-sm text-warn" aria-live="polite">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <button className="pill pill-primary" disabled={!!busy || (w.status === "connected" && problems.length > 0)} onClick={submit}>
              {busy ??
                (w.status !== "connected"
                  ? "Connect wallet"
                  : !w.onRightChain
                    ? `Switch to ${PUBLIC.chainName} & lock`
                    : "Approve & lock escrow")}
            </button>
            {!PUBLIC.judge && (
              <Note tone="warn">BenchJudge isn&apos;t configured for this site, so escrows can&apos;t be locked here. Try the free preview.</Note>
            )}
            {error && <Note tone="fail">{error}</Note>}
          </div>
        </Card>

        <div className="space-y-4">
          {result ? (
            <Card title="Escrow locked">
              <div className="space-y-3 text-sm">
                <Stamp fulfilled reason={`${result.label} locked.`} />
                <p className="text-muted">
                  escrowUid <Hash value={result.escrowUid} />
                </p>
                <p className="text-muted">
                  tx <Hash value={result.hash} href={txUrl(result.hash)} />
                </p>
                <Note>Send the seller this delivery link. It shows them the demand, rubric and terms before they deliver.</Note>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="pill pill-primary pill-sm"
                    onClick={async () => {
                      await navigator.clipboard?.writeText(`${window.location.origin}/deliver?escrow=${result.escrowUid}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? "Link copied" : "Copy delivery link"}
                  </button>
                  <Link className="pill pill-secondary pill-sm" href={`/case?escrow=${result.escrowUid}`}>
                    Track this escrow
                  </Link>
                </div>
              </div>
            </Card>
          ) : (
            <Card title="Before you lock">
              <ul className="space-y-3 text-sm text-muted">
                <li>Write requirements a juror can check: length, must-mention, must-not-contain, format.</li>
                <li>The expiry must outlast delivery, GenLayer finality (minutes) and any appeal. Reclaim opens only after it.</li>
                <li>The escrow names BenchJudge as its only oracle: no one else can release it.</li>
                <li>bUSD is a free test token with no value.</li>
              </ul>
            </Card>
          )}
          {recent.length > 0 && (
            <Card title="Your escrows (this browser)">
              <ul className="space-y-2 text-sm">
                {recent.slice(0, 5).map((e) => (
                  <li key={e.escrowUid} className="flex items-center justify-between gap-2">
                    <Link className="underline decoration-line underline-offset-4" href={`/case?escrow=${e.escrowUid}`}>
                      <Hash value={e.escrowUid} chars={8} />
                    </Link>
                    <span className="text-muted">{e.label}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Link href="/preview" className="card card-hover block p-6">
            <p className="font-medium text-ink">Not sure about the wording?</p>
            <p className="mt-1 text-sm text-muted">Preview the verdict first, free, on Studionet.</p>
          </Link>
        </div>
      </div>
    </Container>
  );
}
