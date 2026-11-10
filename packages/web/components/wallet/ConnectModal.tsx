"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Close } from "@/components/site/icons";
import { Mark } from "@/components/site/Logo";
import { useWallet } from "./WalletProvider";

const GET_A_WALLET = [
  { name: "MetaMask", href: "https://metamask.io/download/" },
  { name: "Coinbase Wallet", href: "https://www.coinbase.com/wallet/downloads" },
  { name: "Rabby", href: "https://rabby.io/" },
];

export function ConnectModal() {
  const { modalOpen, closeModal, wallets, connect, status, error } = useWallet();

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [modalOpen, closeModal]);

  if (!modalOpen) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={closeModal}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect a wallet"
        className="menu-in w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mark className="h-8 w-8" />
            <h2 className="text-lg font-medium text-ink">Connect a wallet</h2>
          </div>
          <button className="rounded-lg p-2 text-muted hover:bg-wash hover:text-ink" aria-label="Close" onClick={closeModal}>
            <Close className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-3 text-sm text-muted">Lock escrows, deliver work and open cases on GenLayer Bradbury. Bench never sees your keys.</p>

        {wallets.length > 0 ? (
          <ul className="mt-6 space-y-2">
            {wallets.map((w) => (
              <li key={w.info.uuid}>
                <button
                  className="flex w-full items-center gap-4 rounded-2xl border border-line px-4 py-3.5 text-left transition-colors hover:border-[#c9cdd4] hover:bg-wash disabled:opacity-60"
                  disabled={status === "connecting"}
                  onClick={() => connect(w)}
                >
                  {w.info.icon ? (
                    <img src={w.info.icon} alt="" className="h-9 w-9 rounded-xl" />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-wash text-blue">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3" y="6" width="18" height="13" rx="3" />
                        <path d="M16 12.5h2M3 9h14a2 2 0 002-2" />
                      </svg>
                    </span>
                  )}
                  <span className="flex-1 font-medium text-ink">{w.info.name}</span>
                  <span className="text-xs text-muted">{status === "connecting" ? "Check your wallet…" : "Detected"}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-6 rounded-2xl bg-wash p-5">
            <p className="font-medium text-ink">No wallet found in this browser</p>
            <p className="mt-1 text-sm text-muted">Install one, then reload. You can still preview verdicts without a wallet.</p>
            <ul className="mt-4 space-y-2">
              {GET_A_WALLET.map((g) => (
                <li key={g.name}>
                  <a href={g.href} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-medium text-ink hover:bg-wash-2">
                    {g.name} <ArrowUpRight className="h-4 w-4 text-muted" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="mt-4 rounded-xl bg-[#fdecea] px-4 py-3 text-sm text-fail">{error}</p>}
        <p className="mt-6 text-xs leading-relaxed text-faint">
          Testnet only. Connecting shares your address with this site; transactions always need your approval in the wallet.
        </p>
      </div>
    </div>,
    document.body,
  );
}
