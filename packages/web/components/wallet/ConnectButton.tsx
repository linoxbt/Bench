"use client";
import { useEffect, useRef, useState } from "react";
import { formatUnits, parseAbi, parseUnits } from "viem";
import { ArrowUpRight } from "@/components/site/icons";
import { waitConfirmed } from "@bench/core/browser";
import { addressUrl, publicClient, txUrl } from "@/lib/chain";
import { PUBLIC } from "@/lib/config";
import { Avatar } from "./Avatar";
import { errorText, shortAddress, useWallet } from "./WalletProvider";

const TOKEN_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function mint(address to, uint256 amount)",
]);

/** Header wallet control: "Connect wallet" pill, or an address chip that opens the account menu. */
export function ConnectButton({ full = false, compact = false }: { full?: boolean; compact?: boolean }) {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (w.status !== "connected" || !w.address) {
    if (compact) return null;
    return (
      <button className={`pill pill-primary pill-sm ${full ? "w-full !h-12 !text-base" : ""}`} onClick={w.openModal} disabled={w.status === "connecting"}>
        {w.status === "connecting" ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  return (
    <div ref={ref} className={`relative ${full ? "w-full" : ""}`}>
      <button
        className={`flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 text-sm font-medium text-ink transition-colors hover:bg-wash ${
          compact ? "pr-1" : "pr-3"
        } ${full ? "w-full !py-2 !pl-2" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Account"
        onClick={() => setOpen(!open)}
      >
        <Avatar address={w.address} size={compact ? 30 : 26} />
        {!compact && <span className="font-mono text-[0.82rem]">{shortAddress(w.address)}</span>}
        {!compact && !w.onRightChain && <span className="h-2 w-2 rounded-full bg-warn" title="Wrong network" />}
      </button>
      {open && <AccountMenu onClose={() => setOpen(false)} align={full ? "left" : "right"} />}
    </div>
  );
}

function AccountMenu({ onClose, align }: { onClose: () => void; align: "left" | "right" }) {
  const w = useWallet();
  const [gen, setGen] = useState<string>();
  const [token, setToken] = useState<{ symbol: string; balance: string; decimals: number }>();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [msg, setMsg] = useState<{ text: string; href?: string; bad?: boolean }>();

  async function refresh() {
    if (!w.address) return;
    publicClient
      .getBalance({ address: w.address })
      .then((b) => setGen(Number(formatUnits(b, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })))
      .catch(() => setGen(undefined));
    if (PUBLIC.token) {
      try {
        const [bal, decimals, symbol] = await Promise.all([
          publicClient.readContract({ address: PUBLIC.token, abi: TOKEN_ABI, functionName: "balanceOf", args: [w.address] }),
          publicClient.readContract({ address: PUBLIC.token, abi: TOKEN_ABI, functionName: "decimals" }),
          publicClient.readContract({ address: PUBLIC.token, abi: TOKEN_ABI, functionName: "symbol" }),
        ]);
        setToken({ symbol, decimals, balance: Number(formatUnits(bal, decimals)).toLocaleString(undefined, { maximumFractionDigits: 2 }) });
      } catch {
        setToken(undefined);
      }
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.address, w.chainId]);

  async function mint() {
    setBusy("mint");
    setMsg(undefined);
    try {
      const client = await w.getWalletClient();
      const hash = await client.writeContract({
        address: PUBLIC.token!,
        abi: TOKEN_ABI,
        functionName: "mint",
        args: [w.address!, parseUnits("100", token?.decimals ?? 18)],
      });
      await waitConfirmed(publicClient, hash, "Mint");
      setMsg({ text: `Minted 100 ${token?.symbol ?? "bUSD"}.`, href: txUrl(hash) });
      refresh();
    } catch (e) {
      setMsg({ text: errorText(e), bad: true });
    } finally {
      setBusy(undefined);
    }
  }

  async function switchNet() {
    setBusy("switch");
    setMsg(undefined);
    try {
      await w.switchChain();
    } catch (e) {
      setMsg({ text: errorText(e), bad: true });
    } finally {
      setBusy(undefined);
    }
  }

  if (!w.address) return null;
  return (
    <div
      role="dialog"
      aria-label="Account"
      className={`menu-in absolute top-full z-50 mt-2 w-[19rem] rounded-2xl border border-line bg-white p-4 shadow-[0_24px_60px_-20px_rgb(10_11_13/0.3)] ${
        align === "right" ? "right-0" : "left-0"
      }`}
    >
      <div className="flex items-center gap-3">
        <Avatar address={w.address} size={40} />
        <div className="min-w-0">
          <p className="font-mono text-sm text-ink">{shortAddress(w.address)}</p>
          <p className="truncate text-xs text-muted">{w.wallet?.name ?? "Wallet"}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-wash p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-ink">
            <span className={`h-2 w-2 rounded-full ${w.onRightChain ? "bg-pass" : "bg-warn"}`} />
            {w.onRightChain ? PUBLIC.chainName : `Wrong network (${w.chainId})`}
          </span>
          {!w.onRightChain && (
            <button className="text-xs font-medium text-blue" onClick={switchNet} disabled={busy === "switch"}>
              {busy === "switch" ? "Switching…" : "Switch"}
            </button>
          )}
        </div>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">GEN</dt>
            <dd className="font-mono text-ink">{w.onRightChain ? (gen ?? "…") : "—"}</dd>
          </div>
          {PUBLIC.token && (
            <div className="flex justify-between">
              <dt className="text-muted">{token?.symbol ?? "bUSD"}</dt>
              <dd className="font-mono text-ink">{w.onRightChain ? (token?.balance ?? "…") : "—"}</dd>
            </div>
          )}
        </dl>
      </div>

      {PUBLIC.token && (
        <button className="pill pill-ghost pill-sm mt-3 w-full" onClick={mint} disabled={!!busy}>
          {busy === "mint" ? "Minting…" : `Get 100 test ${token?.symbol ?? "bUSD"}`}
        </button>
      )}
      {msg && (
        <p className={`mt-3 rounded-xl px-3 py-2 text-xs ${msg.bad ? "bg-[#fdecea] text-fail" : "bg-[#e7f6ee] text-pass"}`}>
          {msg.text}{" "}
          {msg.href && (
            <a className="underline" href={msg.href} target="_blank" rel="noreferrer">
              View tx
            </a>
          )}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          className="pill pill-secondary pill-sm"
          onClick={async () => {
            await navigator.clipboard?.writeText(w.address!);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? "Copied" : "Copy address"}
        </button>
        <a className="pill pill-secondary pill-sm" href={addressUrl(w.address)} target="_blank" rel="noreferrer">
          Explorer <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>
      <button
        className="mt-2 w-full rounded-full py-2 text-sm font-medium text-fail hover:bg-[#fdecea]"
        onClick={async () => {
          await w.disconnect();
          onClose();
        }}
      >
        Disconnect
      </button>
      {!gen && w.onRightChain && (
        <p className="mt-2 text-center text-xs text-faint">
          Need GEN for gas?{" "}
          <a className="underline" href="https://testnet-faucet.genlayer.foundation" target="_blank" rel="noreferrer">
            GenLayer faucet
          </a>
        </p>
      )}
    </div>
  );
}
